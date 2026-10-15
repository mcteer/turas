import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {withPlanEvalEnvironment} from '../../scripts/plan-eval-environment';
import {withTransaction,query} from '../../lib/server/db/client';
import {createProfileTestSession} from '../fixtures/profiles';
import {persistPublicCustomerResearch} from '../../lib/server/research/public-persistence';
import {publicDigest,dossierAreas,signCheckedPublicPage} from '../../lib/server/research/public-dossier';
import {markDueResearch} from '../../lib/server/research/refresh';
import {readPublicCustomerCoverage} from '../../lib/server/research/public-read';
import {claimRetrievalJobs} from '../../lib/server/retrieval/jobs';
import {currentIndexPassages} from '../../scripts/retrieval-worker';
import {getServerConfig} from '../../lib/server/config';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
const text='Cedar Public Company reports its documentation deployment on Vercel for a dated public workload.';
const customer={name:'Cedar Public Company',industries:[],directoryListed:true,stories:[]};
const rawPages=[{url:'https://public.example.org/cedar',title:'Cedar public report',text,bodyDigest:'a'.repeat(64),normalizedDigest:publicDigest(text),retrievedAt:new Date().toISOString(),publishedAt:null,discoveryPurpose:'identity'}];
const pages=()=>rawPages.map(signCheckedPublicPage);
const dossier={description:'Attributed public identity',findings:[{area:'identity',statement:'Reports a public documentation workload.',sourceIndex:0,quote:text,attribution:'Company report',caveats:['Public self-report']}],coverage:dossierAreas.map(area=>({area,state:area==='identity'?'supported':'not_found',explanation:'Bounded public discovery'})),unknowns:['Internal engagement unknown']};
const input=()=>({requestKey:randomUUID(),batchDigest:'a'.repeat(64),customer,dossier,usage:{searches:6,fetches:1,inputTokens:1000,outputTokens:100,costUsd:.01,model:'synthetic-test',modelCalls:2}});
describe('operator public research persistence',()=>{
 it('idempotently retains a scoped public anchor, immutable receipt and attributed sources without accepted internal facts',async()=>{
  await withPlanEvalEnvironment(async()=>{
   const actor=await withTransaction(db=>createProfileTestSession(db,'mcteer'));const command=input();
   const first=await persistPublicCustomerResearch(actor,command,pages());const replay=await persistPublicCustomerResearch(actor,command,pages());
   expect(replay).toMatchObject({id:first.id,customerId:first.customerId,replayed:true});
   expect((await query('SELECT count(*)::int AS count FROM public_customer_research_results WHERE customer_id=$1',[first.customerId])).rows[0].count).toBe(1);
   expect((await query('SELECT count(*)::int AS count FROM profile_records WHERE customer_id=$1 AND current_accepted_revision_id IS NOT NULL',[first.customerId])).rows[0].count).toBe(0);
   const coverage=await withTransaction(db=>readPublicCustomerCoverage(db,actor,first.customerId));expect(coverage?.coverage).toHaveLength(6);
   expect((await query('SELECT synthetic FROM customer_references WHERE id=$1',[first.customerId])).rows[0].synthetic).toBe(false);
   expect((await query("SELECT count(*)::int AS count FROM retrieval_sources WHERE customer_id=$1 AND source_kind='verified_research'",[first.customerId])).rows[0].count).toBe(2);
   await expect(persistPublicCustomerResearch(actor,{...command,usage:{...command.usage,inputTokens:1001}},pages())).rejects.toMatchObject({code:'request_key_conflict'});
   const projections=(await query<{id:string}>("SELECT id FROM retrieval_sources WHERE customer_id=$1 AND source_kind='verified_research'",[first.customerId])).rows;
   const claims=await claimRetrievalJobs(2,undefined,getServerConfig().TURAS_ENVIRONMENT_ID,projections.map(p=>p.id));
   expect(claims).toHaveLength(2);for(const claim of claims)expect(await currentIndexPassages(claim)).toHaveLength(1);
   const source=(await query('SELECT source_revision_id FROM research_checks JOIN evidence_source_revisions v ON v.id=source_revision_id WHERE v.customer_id=$1',[first.customerId])).rows[0].source_revision_id;
   await withTransaction(async db=>{
    await db.query('SAVEPOINT unchanged_checked_metadata');const successor=randomUUID();
    await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,publication_at,retrieval_at,rights,audience,quality_input)
      SELECT $1,source_id,workspace_id,customer_id,version+1,location,title,passage,supported_claim,passage_digest,publication_at,clock_timestamp(),rights,audience,quality_input FROM evidence_source_revisions WHERE id=$2`,[successor,source]);
    await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
      VALUES($1,$2,'research-check-v3',true,true,true,true,$3)`,[successor,'public-fetch-v1:observation:'+randomUUID(),JSON.stringify({normalizedDigest:publicDigest(text),retainedPreviousClaim:true})]);
    await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'supersede','Synthetic unchanged checked replacement')",[randomUUID(),source]);
    expect((await readPublicCustomerCoverage(db,actor,first.customerId))?.description).toBe(dossier.description);
    await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,2,'withdraw','Synthetic explicit original withdrawal')",[randomUUID(),source]);
    expect(await readPublicCustomerCoverage(db,actor,first.customerId)).toBe(null);
    await db.query('ROLLBACK TO SAVEPOINT unchanged_checked_metadata');await db.query('RELEASE SAVEPOINT unchanged_checked_metadata');
   });
   await query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),source]);
   expect(await withTransaction(db=>readPublicCustomerCoverage(db,actor,first.customerId))).toBe(null);
   for(const claim of claims)expect(await currentIndexPassages(claim)).toBe(null);
   await expect(query('UPDATE public_customer_research_results SET state=\'researched\' WHERE id=$1',[first.id])).rejects.toMatchObject({code:'23514'});
  },{deadlineAt:Date.now()+120000,sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
 },150000);
 it('denies a member, partner, revoked admin and cross-workspace target',async()=>{
  await withPlanEvalEnvironment(async()=>{
   const actors=await withTransaction(async db=>({admin:await createProfileTestSession(db,'mcteer'),member:await createProfileTestSession(db,'panel'),partner:await createProfileTestSession(db,'partner')}));
   await expect(persistPublicCustomerResearch(actors.admin,input(),[{...pages()[0],receiptSignature:'b'.repeat(64)}])).rejects.toThrow('signature');
   for(const actor of [actors.member,actors.partner])await expect(persistPublicCustomerResearch(actor,input(),pages())).rejects.toMatchObject({code:'forbidden'});
   await expect(persistPublicCustomerResearch(actors.admin,input(),pages(),randomUUID())).rejects.toMatchObject({code:'identity_conflict'});
   await query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,creator_membership_id)
    VALUES($1,$2,$3,'manual',$4,$5)`,[randomUUID(),actors.admin.workspaceId,DEMO_IDS.sharedCustomer,rawPages[0].url,actors.admin.membershipId]);
   await expect(persistPublicCustomerResearch(actors.admin,input(),pages(),DEMO_IDS.sharedCustomer)).rejects.toMatchObject({code:'submitted_origin'});
   await query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[actors.admin.sessionId]);
   await expect(persistPublicCustomerResearch(actors.admin,input(),pages(),DEMO_IDS.sharedCustomer)).rejects.toMatchObject({code:'unauthorized'});
  },{deadlineAt:Date.now()+120000,sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
 },150000);
 it('indexes a newly checked revision on an older public source without relabeling its parent',async()=>{
  await withPlanEvalEnvironment(async()=>{
   const actor=await withTransaction(db=>createProfileTestSession(db,'mcteer'));
   const customerId=randomUUID(),sourceId=randomUUID();
   await query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)',[customerId,actor.workspaceId,customer.name]);
   await query("INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity) VALUES($1,$2,$3,'independent_research',$4,'earlier-public-fetch')",[sourceId,actor.workspaceId,customerId,rawPages[0].url]);
   await persistPublicCustomerResearch(actor,input(),pages(),customerId);
   const projections=(await query<{id:string}>("SELECT id FROM retrieval_sources WHERE customer_id=$1 AND source_kind='verified_research'",[customerId])).rows;
   const claims=await claimRetrievalJobs(2,undefined,getServerConfig().TURAS_ENVIRONMENT_ID,projections.map(p=>p.id));
   expect(claims).toHaveLength(2);
   for(const claim of claims)expect(await currentIndexPassages(claim)).toHaveLength(1);
   expect((await query('SELECT trusted_ingest_identity FROM evidence_sources WHERE id=$1',[sourceId])).rows[0].trusted_ingest_identity).toBe('earlier-public-fetch');
  },{deadlineAt:Date.now()+120000,sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
 },150000);

 it('preserves eligible knowledge when focused research adds products to an existing profile',async()=>{
  await withPlanEvalEnvironment(async()=>{
   const actor=await withTransaction(db=>createProfileTestSession(db,'mcteer'));
   const first=await persistPublicCustomerResearch(actor,input(),pages());
   const productText='Cedar Public Company reports using Vercel Sandbox for its public agent integration.';
   const focusedPage=signCheckedPublicPage({...rawPages[0],url:'https://public.example.org/cedar-agent',publishedAt:'2020-01-01T00:00:00.000Z',text:productText,normalizedDigest:publicDigest(productText),bodyDigest:publicDigest(productText),retrievedAt:new Date().toISOString()});
   const focused={...dossier,description:'',findings:[{...dossier.findings[0],area:'architecture_outcomes',statement:'Reports a Sandbox agent integration.',quote:productText}],coverage:dossierAreas.map(area=>({area,state:area==='architecture_outcomes'?'supported':'incomplete',explanation:'Focused product research'}))};
   await persistPublicCustomerResearch(actor,{...input(),dossier:focused},[focusedPage],first.customerId);
   await markDueResearch();
   const refreshed=(await query("SELECT v.publication_at,due.state FROM evidence_source_revisions v JOIN research_review_due due ON due.source_revision_id=v.id WHERE v.customer_id=$1 AND v.location=$2",[first.customerId,focusedPage.url])).rows[0];
   expect(refreshed.state).toBe('current');
   expect(refreshed.publication_at.toISOString()).toBe('2020-01-01T00:00:00.000Z');
   const coverage=await withTransaction(db=>readPublicCustomerCoverage(db,actor,first.customerId));
   expect(coverage?.description).toBe(dossier.description);
   expect(coverage?.coverage.filter(area=>area.state==='supported').map(area=>area.area)).toEqual(['identity','architecture_outcomes']);
   const oldSource=(await query('SELECT source_revision_id FROM research_checks JOIN evidence_source_revisions v ON v.id=source_revision_id WHERE v.customer_id=$1 AND v.location=$2',[first.customerId,rawPages[0].url])).rows[0].source_revision_id;
   await query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic stale description withdrawal')",[randomUUID(),oldSource]);
   const withdrawn=await withTransaction(db=>readPublicCustomerCoverage(db,actor,first.customerId));
   expect(withdrawn?.description).toBe('');
   expect(withdrawn?.coverage.find(area=>area.area==='identity')?.state).toBe('incomplete');
  },{deadlineAt:Date.now()+120000,sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
 },150000);

});
