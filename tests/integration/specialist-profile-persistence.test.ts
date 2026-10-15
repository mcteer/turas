import {readOrdinaryPracticeEvidence,ordinaryPracticeAccount} from '../../lib/server/conversations/practice-evidence';
import {searchNamedCustomerEvidence} from '../../lib/server/conversations/named-evidence-search';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
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
import {persistSpecialistCustomerResearch} from '../../lib/server/research/public-persistence';
import {publicDigest,signCheckedPublicPage,dossierAreas} from '../../lib/server/research/public-dossier';
import {readProfile} from '../../lib/server/profiles/read';
const isolatedTestUrl=requireTestDatabaseUrl();
const ownedConversationIds:string[]=[];
const withRuntime=<T>(run:(db:PoolClient)=>Promise<T>)=>withTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return run(db);});
beforeAll(()=>{const runtime=new URL(isolatedTestUrl);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('keeps shared practice sources out of customer facts without blocking research retention',async()=>{
 const db=new Client({connectionString:isolatedTestUrl});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','member'),customerId=randomUUID(),name=`Retention Fixture ${customerId}`;
  await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)',[customerId,actor.workspaceId,name]);
  const text=`Official product documentation mentions ${name} as an example, without establishing that customer’s deployment.`,url=`https://vercel.com/docs/retention-fixture/${customerId}`;
  const page=signCheckedPublicPage({url,title:'Shared product documentation',text,bodyDigest:publicDigest(text),normalizedDigest:publicDigest(text),retrievedAt:new Date().toISOString(),publishedAt:null,discoveryPurpose:'specialist_public_source'});
  const snapshot=publicDigest(text),source={...extractSources({success:true,url,title:page.title,markdown:text},page.retrievedAt)[0],cache:{snapshotId:snapshot,checkedAt:page.retrievedAt,refreshAfter:new Date(Date.now()+3600000).toISOString()}};
  await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,check_receipt) VALUES($1,$2,$3,$3,$4,$3,'{}',false,now(),now()+interval '6 hours',$5)`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,snapshot,url,JSON.stringify(page)]);
  const identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  expect(await retainSpecialistProfileSources(identity,customerId,[source])).toEqual({updated:0,skipped:1});
  expect((await db.query('SELECT count(*)::int AS count FROM evidence_sources WHERE customer_id=$1',[customerId])).rows[0].count).toBe(0);
  // Once a source is customer-mapped, missing verification is still an error.
  await db.query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility) VALUES($1,$2,$3,$4,'',$5,'public')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,customerId,snapshot]);
  await db.query('UPDATE turas_evidence_snapshots SET check_receipt=NULL WHERE id=$1',[snapshot]);
  await expect(retainSpecialistProfileSources(identity,customerId,[source])).rejects.toThrow('no verified fetch receipt');
  // An unrelated, uncited source is never part of the selected retention work.
  expect(await retainSpecialistProfileSources(identity,customerId,[source],[])).toEqual({updated:0,skipped:1});
 }finally{await db.end();}
});
it('retains new public research for an assigned partner, preserves curated claims on recheck, and indexes late document evidence',async()=>{
 const db=new Client({connectionString:isolatedTestUrl});await db.connect();
 try {
  const actor=await isolatedChatActor(db,'partner','member');
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
  ownedConversationIds.push(conversation.id);
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
  // Reproduce a real profile after many focused investigations. Their empty
  // descriptions must not erase an older still-source-eligible overview.
  await db.query(`INSERT INTO public_customer_research_results
    (id,environment_id,workspace_id,customer_id,actor_membership_id,batch_digest,
     request_key,input_digest,dossier,source_revision_ids,provider_usage,state)
    SELECT gen_random_uuid(),r.environment_id,r.workspace_id,r.customer_id,r.actor_membership_id,
      r.batch_digest,gen_random_uuid(),r.input_digest,r.dossier,r.source_revision_ids,r.provider_usage,r.state
    FROM(SELECT * FROM public_customer_research_results WHERE customer_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 1) r CROSS JOIN generate_series(1,25)`,[customerId]);
  const profile=z.object({attributedResearch:z.array(z.object({passage:z.string(),documentDigest:z.string().nullable(),productNames:z.array(z.string())})),publicResearchCoverage:z.object({description:z.string()}).nullable()}).parse(await readProfile(actor,customerId));
  expect(profile.attributedResearch).toHaveLength(1);
  expect(profile.attributedResearch[0].passage).toContain(originalQuote);
  expect(profile.attributedResearch[0].passage).toContain(newQuote);
  expect(profile.attributedResearch[0].documentDigest).toBe(publicDigest(complete));
  expect(profile.attributedResearch[0].productNames).not.toContain('Sandbox');
  async function freshSearchConversation(who=actor){
   const key=randomUUID(),fresh=await createOwnedConversation(who,{requestKey:key});
   ownedConversationIds.push(fresh.conversation.id);
   const binding=await claimBinding(who,fresh.conversation.id,key);
   if(binding.state!=='claimed')throw Error('Fixture search binding unavailable');
   const native=`wrun_${randomUUID()}`;
   await bindNativeSession(who,fresh.conversation.id,binding.claimToken,native);
   const attempt=await prepareAttempt(who,fresh.conversation.id,native,randomUUID(),'Find documented Sandbox evidence');
   await claimDispatch(who,fresh.conversation.id,attempt.attemptId,0);
   return {...fresh,principal:{principalId:who.principalId,attributes:{turasAttemptId:attempt.attemptId}}};
  }
  const fresh=await freshSearchConversation(),searchPrincipal=fresh.principal;
  const namedSearch=await searchNamedCustomerEvidence(searchPrincipal,customerId,
    {query:'Sandboxes',scope:'customer',use:'accepted_fact',limit:5});
  expect(namedSearch.results.some(result=>result.text.includes(late))).toBe(true);
  expect((await db.query('SELECT customer_id FROM conversations WHERE id=$1',[fresh.conversation.id])).rows[0].customer_id).toBe(null);
  expect(Number((await db.query('SELECT count(*) FROM session_evidence_dependencies WHERE conversation_id=$1',[fresh.conversation.id])).rows[0].count)).toBeGreaterThan(0);
  // Public product documentation is reusable without disclosing the private
  // query metadata that originally populated the practice library.
  const practiceUrl='https://vercel.com/docs/sandbox/concepts/firewall';
  const practiceText=Array.from({length:28},(_,i)=>`Section ${i}: `+'General firewall introduction. '.repeat(12)).join('\n\n')+'\n\nIP custom DNS and broad CIDR rules can bypass domain restrictions.\n\nAllowed destinations can receive exfiltrated data.';
  const practiceSource=extractSources({success:true,url:practiceUrl,title:'Sandbox firewall',markdown:practiceText},new Date().toISOString())[0];
  const practiceId=publicDigest(practiceText);
  await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
   VALUES($1,$2,$3,$3,$4,$3,$5,false,now(),now()+interval '6 hours')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,practiceId,practiceUrl,JSON.stringify(practiceSource)]);
  const {researchPassages}=await import('../../lib/server/research/specialists/solution-research/source-integrity');
  await db.query(`INSERT INTO turas_evidence_passages(environment_id,workspace_id,snapshot_id,ordinal,text,model) VALUES($1,$2,$3,1,$4,'fixture')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,practiceId,researchPassages(practiceSource).slice(-3).map(p=>p.text).join('\n\n')]);
  await db.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,checked_at,refresh_after)
   VALUES($1,$2,'private-product-marker','private-question-marker',$3,$4,'Sandbox firewall','vercel_documentation','product_capability',now(),now()+interval '6 hours')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,practiceId,practiceUrl]);
  expect(await ordinaryPracticeAccount(searchPrincipal)).toBeUndefined();
  await withRuntime(client=>readCustomerAccountEvidence(client,searchPrincipal,customerId));
  expect(await ordinaryPracticeAccount(searchPrincipal)).toBe(customerId);
  const otherCustomer=randomUUID();
  await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)',[otherCustomer,actor.workspaceId,'Other scope fixture']);
  await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids) VALUES($1,$2,'delivery',0,'{}')`,[searchPrincipal.attributes.turasAttemptId,otherCustomer]);
  try{expect(await ordinaryPracticeAccount(searchPrincipal)).toBeUndefined();}
  finally{await db.query('DELETE FROM general_customer_read_scopes WHERE attempt_id=$1 AND customer_id=$2',[searchPrincipal.attributes.turasAttemptId,otherCustomer]);}

  const practice=await readOrdinaryPracticeEvidence(searchPrincipal,customerId,'DNS CIDR exfiltrated',new AbortController().signal);
  expect(practice.sources).toHaveLength(1);
  expect(practice.sources[0].passages.length).toBeGreaterThan(8);
  expect(practice.sources[0].passages).toEqual(researchPassages(practiceSource));
  expect(practice.sources[0].passages.some(p=>p.text.includes('exfiltrated'))).toBe(true);
  expect(JSON.stringify(practice)).not.toContain('private-question-marker');
  expect(JSON.stringify(practice)).not.toContain('private-product-marker');
  const unassignedPartner=await isolatedChatActor(db,'partner','member',actor.workspaceId);
  const generic=await freshSearchConversation(unassignedPartner);
  const customerDocumentUrl='https://vercel.com/docs/other-account-fixture';
  const customerDocument=extractSources({success:true,url:customerDocumentUrl,title:'Other customer identifier',markdown:'DNS CIDR exfiltrated private-customer-material-marker. '.repeat(8)},new Date().toISOString())[0];
  const customerDocumentId=publicDigest(customerDocumentUrl);
  await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
   VALUES($1,$2,$3,$3,$4,$3,$5,false,now(),now()+interval '6 hours')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerDocumentId,customerDocumentUrl,JSON.stringify(customerDocument)]);
  await db.query(`INSERT INTO turas_evidence_passages(environment_id,workspace_id,snapshot_id,ordinal,text,model) VALUES($1,$2,$3,1,$4,'fixture')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerDocumentId,customerDocument.excerpt]);
  await db.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,checked_at,refresh_after)
   VALUES($1,$2,'private-product','private-topic',$3,$4,'Other customer identifier','customer_engineering','product_capability',now(),now()+interval '6 hours')`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerDocumentId,customerDocumentUrl]);
  const genericPublic=await readOrdinaryPracticeEvidence(generic.principal,undefined,'DNS CIDR exfiltrated',new AbortController().signal);
  expect(genericPublic.sources).toHaveLength(1);
  expect((await db.query('SELECT count(*)::int AS count FROM general_customer_read_scopes WHERE attempt_id=$1',[generic.principal.attributes.turasAttemptId])).rows[0].count).toBe(0);
  expect(JSON.stringify(genericPublic)).not.toContain('private-question-marker');
  expect(JSON.stringify(genericPublic)).not.toContain('Other customer identifier');
  expect(JSON.stringify(genericPublic)).not.toContain('private-customer-material-marker');
  expect(JSON.stringify(genericPublic)).not.toContain(customerDocumentUrl);
  await db.query('DELETE FROM turas_vercel_practice_sources WHERE snapshot_id=$1',[customerDocumentId]);
  const boundedPractice=await readOrdinaryPracticeEvidence(searchPrincipal,customerId,'DNS CIDR exfiltrated',new AbortController().signal,1024);
  expect(Buffer.byteLength(JSON.stringify(boundedPractice))).toBeLessThanOrEqual(1024);
  expect(boundedPractice.sources).toEqual([]);
  expect(boundedPractice.omittedReferences).toContainEqual(expect.objectContaining({url:practiceUrl,passagesOmitted:true}));
  expect((await db.query('SELECT citation_ids FROM general_customer_read_scopes WHERE attempt_id=$1 AND customer_id=$2',[searchPrincipal.attributes.turasAttemptId,customerId])).rows[0].citation_ids).toContain('public_practice:'+practiceId);
  await withRuntime(client=>assertCustomerQuestionReads(client,actor,fresh.conversation.id,searchPrincipal.attributes.turasAttemptId));
  // Withdrawing the library mapping invalidates already-consumed context.
  await db.query('BEGIN');
  try{
   await db.query('DELETE FROM turas_vercel_practice_sources WHERE snapshot_id=$1',[practiceId]);
   await expect(assertCustomerQuestionReads(db as unknown as PoolClient,actor,fresh.conversation.id,searchPrincipal.attributes.turasAttemptId)).rejects.toMatchObject({status:404});
  }finally{await db.query('ROLLBACK');}
  // Two already-authorized reads must not upgrade shared membership locks
  // while recording consumption for distinct owner-private conversations.
  const consumers=[new Client({connectionString:process.env.DATABASE_URL}),new Client({connectionString:process.env.DATABASE_URL})];
  try{
   await Promise.all(consumers.map(async reader=>{await reader.connect();await reader.query('BEGIN');await lockWorkspaceActor(reader as unknown as PoolClient,actor,undefined,true);}));
   await Promise.all(consumers.map(async(reader,index)=>{
    await recordRetrievalConsumption(reader as unknown as PoolClient,actor,namedSearch.receiptId,index?conversation.id:fresh.conversation.id);
    await reader.query('ROLLBACK');
   }));
  }finally{await Promise.all(consumers.map(async reader=>{await reader.query('ROLLBACK').catch(()=>{});await reader.end();}));}
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
  const changedOverview=z.object({publicResearchCoverage:z.object({description:z.string()}).nullable()}).parse(await readProfile(actor,customerId));
  expect(changedOverview.publicResearchCoverage?.description??'').not.toBe('Original checked business description.');
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
  const classified={...sourceForRetention,informationType:'product_capability' as const,cache:{snapshotId:checked.snapshot,checkedAt:checked.page.retrievedAt,refreshAfter:new Date(Date.now()+3600000).toISOString()}};
  expect(await retainSpecialistProfileSources(researchActor,customerId,[classified])).toMatchObject({updated:1});
  const capability=z.object({attributedResearch:z.array(z.object({productNames:z.array(z.string()),retrievalAt:z.string()}))}).parse(await readProfile(actor,customerId));
  expect(capability.attributedResearch[0].productNames).toEqual([]);
  expect(capability.attributedResearch[0].retrievalAt).toBe(checked.page.retrievedAt);
  expect(await retainSpecialistProfileSources(researchActor,customerId,[{...classified,informationType:'architecture'}])).toMatchObject({updated:1});
  const architecture=z.object({attributedResearch:z.array(z.object({productNames:z.array(z.string()),retrievalAt:z.string()}))}).parse(await readProfile(actor,customerId));
  expect(architecture.attributedResearch[0].productNames).toContain('Sandbox');
  expect(architecture.attributedResearch[0].retrievalAt).toBe(checked.page.retrievedAt);
  const inventory=await withRuntime(client=>readCustomerAccountEvidence(client,principal,customerId,{page:10,includeProductIndex:true}));
  expect(inventory.entries).toEqual([]);
  expect(inventory.productIndex).toMatchObject({complete:true,products:expect.arrayContaining([expect.objectContaining({name:'Sandbox',url})])});
  // Overlapping selections near the 8k limit must not displace earlier facts.
  const longDocument=name+' '+Array.from({length:110},(_,i)=>`Documented architecture detail ${String(i).padStart(3,'0')}: isolated execution and verified delivery. `).join('');
  const priorQuotes=Array.from({length:5},(_,i)=>longDocument.slice(i*1300,i*1300+1300));
  for(const quote of priorQuotes)await retain(longDocument,quote,0,true);
  await retain(longDocument,longDocument.slice(5200,6700),0,true);
  const overlapping=z.object({attributedResearch:z.array(z.object({passage:z.string()}))}).parse(await readProfile(actor,customerId));
  for(const quote of priorQuotes)expect(overlapping.attributedResearch[0].passage).toContain(quote);
  expect(overlapping.attributedResearch[0].passage).toContain(longDocument.slice(5200,6700));
  const head=(await db.query(`SELECT v.id FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id
    WHERE s.customer_id=$1 AND s.origin='independent_research' AND s.canonical_location=$2 ORDER BY v.version DESC LIMIT 1`,[customerId,url])).rows[0];
  await db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale)
    VALUES($1,$2,1,'withdraw',$3,'Fixture source withdrawal')`,[randomUUID(),head.id,actor.membershipId]);
  expect(await researchSourceIsEligible(researchActor,customerId,url)).toBe(false);
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[customerId,actor.membershipId]);
  await expect(readProfile(actor,customerId)).rejects.toMatchObject({status:404});
  expect((await readOrdinaryPracticeEvidence(generic.principal,undefined,'DNS CIDR exfiltrated',new AbortController().signal)).sources).toHaveLength(1);
  await expect(ordinaryPracticeAccount(searchPrincipal)).rejects.toMatchObject({status:404});
  await expect(searchNamedCustomerEvidence(searchPrincipal,customerId,
    {query:'Sandboxes',scope:'customer',use:'accepted_fact',limit:5})).rejects.toMatchObject({status:404});
 }finally{try{await settleSyntheticConversationAttempts(db,ownedConversationIds);}finally{await db.end();}}
});
