import {lockWorkspaceActor} from "../../lib/server/profiles/policy";
import {researchSourceIsEligible} from "../../lib/server/research/specialists/account";
import {loadResearchContext} from '../../lib/server/research/specialists/solution-research/context';
import {retainSpecialistProfileSources} from '../../lib/server/research/specialists/retain-profile';
import {extractSources} from '../../lib/server/research/specialists/solution-research/evidence';
import type {PoolClient} from 'pg';
import {recordRetrievalConsumption} from '../../lib/server/retrieval/fences';
import {withTransaction} from '../../lib/server/db/client';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {readCustomerAccountEvidence,assertCustomerQuestionReads} from '../../lib/server/conversations/customer-accounts';
import {refreshOrdinaryKnowledge} from '../../lib/server/conversations/current-knowledge';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {z} from 'zod';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {POST as login} from '../../app/api/auth/login/route';
import {getCurrentSession} from '../../lib/server/auth/sessions';
import {persistSpecialistCustomerResearch} from '../../lib/server/research/public-persistence';
import {publicDigest,signCheckedPublicPage,dossierAreas} from '../../lib/server/research/public-dossier';
import {readProfile} from '../../lib/server/profiles/read';
const isolatedTestUrl=requireTestDatabaseUrl();
const withRuntime=<T>(run:(db:PoolClient)=>Promise<T>)=>withTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return run(db);});
beforeAll(()=>{const runtime=new URL(isolatedTestUrl);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('retains new public research for an assigned partner, preserves curated claims on recheck, and indexes late document evidence',async()=>{
 const db=new Client({connectionString:isolatedTestUrl});await db.connect();
 try {
  const origin=process.env.TURAS_APP_ORIGIN!;
  const response=await login(new Request(`${origin}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'partner',password:process.env.PARTNER_PASSWORD})}));
  const currentActor=await getCurrentSession(new Request(origin,{headers:{cookie:response.headers.get('set-cookie')!.split(';')[0]}}));if(!currentActor)throw Error('Fixture login unavailable');
  const actor=currentActor;
  const customerId=randomUUID(),name=`Parity Fixture ${customerId}`;
  await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)',[customerId,actor.workspaceId,name]);
  await db.query(`INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)`,[randomUUID(),actor.workspaceId,customerId,actor.membershipId,actor.principalId]);
  const originalQuote=`${name} uses Vercel to deliver its public website and its application to customers.`;
  const url=`https://example.com/parity/${customerId}`;
  async function retain(text:string,quote:string,age:number,independentlyDiscovered=false){
   const page=signCheckedPublicPage({url,title:`${name} architecture`,text,bodyDigest:publicDigest(text),normalizedDigest:publicDigest(text),retrievedAt:new Date(Date.now()-age).toISOString(),publishedAt:null,discoveryPurpose:'specialist_public_source',...(independentlyDiscovered?{independentDiscovery:{accountId:customerId,searchId:'server-discovery-fixture',provider:'context' as const,checkedAt:new Date().toISOString()}}:{})});
   const snapshot=publicDigest(text+page.retrievedAt);
   await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,check_receipt) VALUES($1,$2,$3,$3,$4,$3,'{}',false,now(),now()+interval '6 hours',$5)`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,snapshot,url,JSON.stringify(page)]);
   await db.query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility) VALUES($1,$2,$3,$4,'',$5,'public')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,customerId,snapshot]);
   const input={requestKey:randomUUID(),batchDigest:publicDigest(text),customer:{name,industries:[],directoryListed:false,stories:[{url,title:name}]},dossier:{description:age?'Original checked business description.':'',findings:[{area:'architecture_outcomes',statement:quote,quote,sourceIndex:0,attribution:'Public source',caveats:[]}],coverage:dossierAreas.map(area=>({area,state:area==='architecture_outcomes'?'supported':'incomplete',explanation:'Only the cited public document was checked.'})),unknowns:[]},usage:{searches:0,fetches:0,inputTokens:0,outputTokens:0,costUsd:null,model:'fixture',modelCalls:0}};
   const saved=await persistSpecialistCustomerResearch(actor,input,[page],customerId);
   expect((await persistSpecialistCustomerResearch(actor,input,[page],customerId)).replayed).toBe(true);
   return {saved,page,snapshot};
  }
  await retain(originalQuote,originalQuote,10000);
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Fixture binding unavailable');
  const native=`wrun_${randomUUID()}`;await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'source-refresh-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),'What does this customer use?');await claimDispatch(actor,conversation.id,attempt.attemptId,0);
  const principal={principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId}};
  const original=await withRuntime(client=>readCustomerAccountEvidence(client,principal,customerId));
  const oldCitation=original.entries[0].citationId;
  const source=(await db.query(`SELECT s.*,p.id AS passage_id,p.passage_digest,p.locators FROM retrieval_sources s
   JOIN retrieval_passages p ON p.source_id=s.id WHERE s.source_revision_id=$1 AND s.lifecycle_state='current' LIMIT 1`,[oldCitation])).rows[0];
  const receipt=randomUUID();
  await db.query(`INSERT INTO retrieval_receipts(id,environment_id,actor_membership_id,conversation_id,scope,workspace_id,customer_id,mode,citation_ids,as_of,valid_until)
   VALUES($1,$2,$3,$4,'customer',$5,$6,'lexical_degraded','[]',now(),now()+interval '1 hour')`,[receipt,process.env.TURAS_ENVIRONMENT_ID,actor.membershipId,conversation.id,actor.workspaceId,customerId]);
  await db.query(`INSERT INTO retrieval_receipt_sources(id,receipt_id,ordinal,source_id,passage_id,source_kind,source_revision_id,source_generation,passage_digest,projection_contract,locators,valid_until)
   VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '1 hour')`,[randomUUID(),receipt,source.id,source.passage_id,source.source_kind,source.source_revision_id,source.source_generation,source.passage_digest,source.projection_contract,JSON.stringify(source.locators)]);
  await withTransaction(client=>recordRetrievalConsumption(client,actor,receipt,conversation.id));


  // Reproduce two ordinary chats having acquired their read-authority locks
  // before validating retrieval scopes. Neither may upgrade the shared actor
  // lock and deadlock the other merely to validate read-only permissions.
  const readers=[new Client({connectionString:process.env.DATABASE_URL}),new Client({connectionString:process.env.DATABASE_URL})];
  try{
    await Promise.all(readers.map(async reader=>{await reader.connect();await reader.query('BEGIN');await lockWorkspaceActor(reader as unknown as PoolClient,actor,undefined,true);}));
    await Promise.all(readers.map(reader=>assertCustomerQuestionReads(reader as unknown as PoolClient,actor,conversation.id,attempt.attemptId,false)));
  }finally{await Promise.all(readers.map(async reader=>{await reader.query('ROLLBACK').catch(()=>{});await reader.end();}));}

  const late=`${name} uses Vercel Sandboxes to execute isolated workloads for its customers.`;
  const newQuote=`${name} independently documents the deployment architecture for its customer-facing service.`;
  const complete=originalQuote+'\n\n'+newQuote+'\n\n'+('Unrelated documented detail. '.repeat(900))+'\n\n'+late;
  await retain(complete,newQuote,0);
  const profile=z.object({attributedResearch:z.array(z.object({passage:z.string(),documentDigest:z.string().nullable(),productNames:z.array(z.string())})),publicResearchCoverage:z.object({description:z.string()}).nullable()}).parse(await readProfile(actor,customerId));
  expect(profile.attributedResearch).toHaveLength(1);
  expect(profile.attributedResearch[0].passage).toContain(originalQuote);
  expect(profile.attributedResearch[0].passage).toContain(newQuote);
  expect(profile.attributedResearch[0].documentDigest).toBe(publicDigest(complete));
  expect(profile.attributedResearch[0].productNames).not.toContain('Sandbox');
  // A full-document search hit is not yet a curated product finding. Once the
  // researcher selects its actual supporting quote, the profile updates.
  await retain(complete,late,0);
  const selected=z.object({attributedResearch:z.array(z.object({productNames:z.array(z.string())}))}).parse(await readProfile(actor,customerId));
  expect(selected.attributedResearch[0].productNames).toContain('Sandbox');
  expect(profile.publicResearchCoverage?.description).toBe('Original checked business description.');
  const passages=await db.query(`SELECT p.passage_text AS text FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.customer_id=$1 AND p.passage_text LIKE '%Sandboxes%'`,[customerId]);
  expect(passages.rows.some(row=>row.text.includes(late))).toBe(true);
  // Actual changed content must replace active facts in this same thread.
  const changed=`${name} now uses Vercel Sandboxes for its isolated execution service.`;
  await db.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location) VALUES($1,$2,$3,'manual',$4)`,[randomUUID(),actor.workspaceId,customerId,url]);
  await expect(retain(changed,changed,0)).rejects.toMatchObject({code:'submitted_origin'});
  const checked=await retain(changed,changed,0,true);
  const sourceForRetention=extractSources({success:true,url,title:name,markdown:changed},checked.page.retrievedAt)[0];
  expect(await retainSpecialistProfileSources({...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!},customerId,[{...sourceForRetention,cache:{snapshotId:checked.snapshot,checkedAt:checked.page.retrievedAt,refreshAfter:new Date(Date.now()+3600000).toISOString()}}])).toMatchObject({updated:1,skipped:0});
  await loadResearchContext({...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,responseAttemptId:attempt.attemptId,workerSessionId:'wrun_local_fixture'},customerId);
  expect((await db.query('SELECT citation_ids FROM general_customer_read_scopes WHERE attempt_id=$1 AND customer_id=$2',[attempt.attemptId,customerId])).rows[0].citation_ids).toContain(`attributed_research:${oldCitation}`);
  await expect(withRuntime(client=>assertCustomerQuestionReads(client,actor,conversation.id,attempt.attemptId))).rejects.toMatchObject({status:409});
  const refreshed=await withRuntime(client=>refreshOrdinaryKnowledge(client,actor,principal,conversation.id,attempt.attemptId));
  expect(JSON.stringify(refreshed)).toContain(changed);
  const active=(await db.query('SELECT citation_ids FROM general_customer_read_scopes WHERE attempt_id=$1 AND customer_id=$2',[attempt.attemptId,customerId])).rows[0].citation_ids;
  expect(active).not.toContain(`attributed_research:${oldCitation}`);
  await withRuntime(client=>assertCustomerQuestionReads(client,actor,conversation.id,attempt.attemptId));
  expect((await db.query('SELECT count(*)::int AS count FROM session_evidence_dependencies WHERE conversation_id=$1',[conversation.id])).rows[0].count).toBe(1);
  expect((await db.query(`SELECT count(*)::int AS count FROM ordinary_evidence_refreshes f JOIN session_evidence_dependencies d ON d.id=f.dependency_id WHERE d.conversation_id=$1`,[conversation.id])).rows[0].count).toBe(1);

  const researchActor={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  expect(await researchSourceIsEligible(researchActor,customerId,url)).toBe(true);
  expect(await researchSourceIsEligible(researchActor,customerId,'https://example.com/new-independent-source')).toBe(true);
  const head=(await db.query(`SELECT v.id FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id
    WHERE s.customer_id=$1 AND s.origin='independent_research' AND s.canonical_location=$2 ORDER BY v.version DESC LIMIT 1`,[customerId,url])).rows[0];
  await db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale)
    VALUES($1,$2,1,'withdraw',$3,'Fixture source withdrawal')`,[randomUUID(),head.id,actor.membershipId]);
  expect(await researchSourceIsEligible(researchActor,customerId,url)).toBe(false);
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[customerId,actor.membershipId]);
  await expect(readProfile(actor,customerId)).rejects.toMatchObject({status:404});
 }finally{await db.end();}
});
