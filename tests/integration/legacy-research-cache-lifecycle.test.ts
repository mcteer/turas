import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {cachedFetch,EvidenceBackoffError} from '../../lib/server/research/specialists/research-cache/fetch';
import {readCachedSource,snapshotDependenciesValid} from '../../lib/server/research/specialists/research-cache/sources';
import {prepareResearch,loadResearchRequest,finishResearchRequest,researchRequestProgress,loadSessionResearchRequest} from '../../lib/server/research/specialists/research-cache/requests';
import {loadResearchContext} from '../../lib/server/research/specialists/solution-research/context';
import {bindCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update';
import {signCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update-receipt';
import {loadCustomerUpdateArtifact} from '../../lib/server/research/specialists/solution-research/artifacts';
import {researchPassages} from '../../lib/server/research/specialists/solution-research/source-integrity';
import {recallPublicLearning,refreshPublicLearning} from '../../lib/server/research/specialists/research-cache/public-learning';
import {maintainResearchEvidence} from '../../lib/server/research/specialists/research-cache/maintenance';
import * as embeddings from '../../lib/server/retrieval/embeddings';
import {legacyResearchFixture} from '../fixtures/legacy-research';
const databaseUrl=requireTestDatabaseUrl(),signal=()=>new AbortController().signal;
beforeAll(()=>{const runtime=new URL(databaseUrl);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
async function fixture(db:Client){const actor=await isolatedChatActor(db,'internal','admin'),accountId=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic cache contract account',false)",[accountId,actor.workspaceId]);return{actor,accountId,identity:{...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!}};}
it('shares successful fetches, honors failure backoff and immediately releases aborted work',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity}=await legacyResearchFixture(db),key=randomUUID();let calls=0;
  const first=await cachedFetch(identity,key,z.string(),async()=>{calls++;return 'original';},signal());
  expect(await cachedFetch(identity,key,z.string(),async()=>{throw Error('duplicate fetch');},signal())).toMatchObject({value:'original',hit:true,checkedAt:first.checkedAt,refreshAfter:first.refreshAfter});expect(calls).toBe(1);
  const failed=randomUUID();await expect(cachedFetch(identity,failed,z.string(),async()=>{throw Error('synthetic failure');},signal())).rejects.toThrow('synthetic failure');
  await expect(cachedFetch(identity,failed,z.string(),async()=>{throw Error('must not retry');},signal())).rejects.toBeInstanceOf(EvidenceBackoffError);
  await db.query('UPDATE turas_evidence_fetches SET expires_at=now()-interval \'1 second\' WHERE key=$1 AND workspace_id=$2',[failed,identity.workspaceId]);
  expect(await cachedFetch(identity,failed,z.string(),async()=>'recovered',signal())).toMatchObject({value:'recovered',hit:false});
  const abort=new AbortController(),cancelKey=randomUUID();await expect(cachedFetch(identity,cancelKey,z.string(),async()=>{abort.abort();return 'cancelled';},abort.signal)).rejects.toThrow();
  expect(await cachedFetch(identity,cancelKey,z.string(),async()=>'after cancel',signal())).toMatchObject({value:'after cancel',hit:false});
 }finally{await db.end();}
});
it('expired fetch ownership cannot overwrite a replacement or clear its published value',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity}=await legacyResearchFixture(db),key=randomUUID();
  await expect(cachedFetch(identity,key,z.string(),async()=>{
   await db.query('UPDATE turas_evidence_fetches SET lease_until=now()-interval \'1 second\' WHERE key=$1 AND workspace_id=$2',[key,identity.workspaceId]);
   expect(await cachedFetch(identity,key,z.string(),async()=>'replacement',signal())).toMatchObject({value:'replacement',hit:false});return 'late stale value';
  },signal())).rejects.toThrow('lease expired');
  expect(await cachedFetch(identity,key,z.string(),async()=>{throw Error('must reuse replacement');},signal())).toMatchObject({value:'replacement',hit:true});
 }finally{await db.end();}
});
it('content hashes reuse snapshot embeddings, invalidate changed dependencies and preserve original learning dates until a retained refresh',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity,accountId}=await fixture(db),url='https://example.org/cache/'+randomUUID();let text='Synthetic customer uses Next.js for an isolated documented workload. '.repeat(6),fetches=0;
  vi.stubEnv('CONTEXT_DEV_API_KEY','synthetic-rendered-provider');vi.stubEnv('AI_GATEWAY_API_KEY','synthetic-intercepted-embedding');
  const embed=vi.spyOn(embeddings,'embedRetrievalTexts').mockImplementation(async values=>values.map(()=>[1,...Array(1535).fill(0)]));
  vi.stubGlobal('fetch',vi.fn(async()=>{fetches++;return Response.json({success:true,url,markdown:text,metadata:{title:'Synthetic source'}});}));
  const [original,concurrent]=await Promise.all([readCachedSource(identity,accountId,'public workload',url,signal()),readCachedSource(identity,accountId,'public workload',url,signal())]);expect(concurrent.source.cache.snapshotId).toBe(original.source.cache.snapshotId);expect(original.retentionWarning).toBeNull();expect(fetches).toBe(1);expect(embed).toHaveBeenCalledTimes(1);
  const reuse=await readCachedSource(identity,accountId,'public workload',url,signal());expect(reuse.cacheHit).toBe(true);expect(reuse.source.cache.snapshotId).toBe(original.source.cache.snapshotId);expect(fetches).toBe(1);
  await db.query('UPDATE turas_evidence_fetches SET expires_at=now()-interval \'1 second\' WHERE workspace_id=$1',[identity.workspaceId]);
  const same=await readCachedSource(identity,accountId,'public workload',url,signal());expect(same.source.cache.snapshotId).toBe(original.source.cache.snapshotId);expect(fetches).toBe(2);expect(embed).toHaveBeenCalledTimes(1);
  text+=' A later visible paragraph records Vercel Blob.';await db.query('UPDATE turas_evidence_fetches SET expires_at=now()-interval \'1 second\' WHERE workspace_id=$1',[identity.workspaceId]);
  const changed=await readCachedSource(identity,accountId,'public workload',url,signal());expect(changed.source.cache.snapshotId).not.toBe(original.source.cache.snapshotId);expect(embed).toHaveBeenCalledTimes(2);
  expect(await snapshotDependenciesValid(identity,[original.source.cache],accountId)).toBe(false);expect(await snapshotDependenciesValid(identity,[changed.source.cache],accountId)).toBe(true);
  const retained=await recallPublicLearning(identity,accountId,'',signal());expect(retained.length).toBeGreaterThan(0);expect(retained.every(row=>row.publishedAt===null)).toBe(true);expect(retained.some(row=>row.evidenceState==='changed')).toBe(true);
  // Claim this owned URL for service refresh without consuming unrelated fixtures.
  await db.query('UPDATE turas_public_learning SET last_seen=now()-interval \'2 days\',refresh_attempt_at=NULL WHERE workspace_id=$1',[identity.workspaceId]);
  await db.query('UPDATE turas_public_learning SET refresh_attempt_at=now() WHERE workspace_id<>$1',[identity.workspaceId]);
  expect(await refreshPublicLearning(identity.environmentId,signal())).toMatchObject({refreshAttempted:1,refreshed:1});
  expect((await recallPublicLearning(identity,accountId,'',signal())).every(row=>row.evidenceState==='recently_checked')).toBe(true);
  expect(await refreshPublicLearning(identity.environmentId,signal())).toMatchObject({refreshAttempted:0});
 }finally{await db.end();}
});
it('fences request takeover and reissues only completed signed source-bound research with original check dates',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity,accountId}=await fixture(db),url='https://example.org/reuse/'+randomUUID();vi.stubEnv('AI_GATEWAY_API_KEY','');vi.stubEnv('CONTEXT_DEV_API_KEY','synthetic-rendered-provider');
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,url,markdown:'Synthetic cache contract account documented Next.js customer workload. '.repeat(8),metadata:{title:'Synthetic source'}})));
  const source=(await readCachedSource(identity,accountId,'public workload',url,signal())).source;
  const scope={accountId,workload:'public workload',question:'Which products are documented?',kind:'customer-update' as const};
  const old=await prepareResearch(identity,scope,signal());if(!old.ticket)throw Error('Expected original reservation');expect((await prepareResearch(identity,scope,signal())).status).toBe('working');
  await db.query('UPDATE turas_research_requests SET lease_until=now()-interval \'1 second\' WHERE key=$1 AND workspace_id=$2',[old.key,identity.workspaceId]);
  const replacement=await prepareResearch(identity,scope,signal());if(!replacement.ticket)throw Error('Expected replacement reservation');expect(replacement.ticket.lease).not.toBe(old.ticket.lease);
  await expect(loadResearchRequest(identity,old.ticket,accountId,'customer-update',signal())).rejects.toThrow('expired');
  const context=await loadResearchContext(identity,accountId,signal()),passage=researchPassages(source)[0];
  const bound=bindCustomerUpdate({accountId,question:scope.question,findings:[{claim:'The retained public page names Next.js.',scope:'Documented public workload',sourceId:source.id,passageId:passage.id,publisherType:'customer',sourceType:'customer_publication'}],conflicts:[],unknowns:[]},[source]);
  const receipt=signCustomerUpdate({userId:identity.userId,environmentId:identity.environmentId,workspaceId:identity.workspaceId,issuedAt:new Date().toISOString(),context,...bound});
  await expect(finishResearchRequest(identity,old.ticket,receipt,signal())).rejects.toThrow('expired');await finishResearchRequest(identity,replacement.ticket,receipt,signal());await finishResearchRequest(identity,replacement.ticket,receipt,signal());
  const reuse=await prepareResearch(identity,{...scope,proposal:'Irrelevant generated proposal'},signal());expect(reuse.status).toBe('reused');if(!reuse.reference)throw Error('Expected signed reuse reference');
  const loaded=await loadCustomerUpdateArtifact(reuse.reference,identity,signal());expect(loaded?.payload.update).toEqual(receipt.payload.update);expect(loaded?.payload.reusedFrom?.researchedAt).toBe(receipt.payload.issuedAt);expect(loaded?.payload.sources[0].cache?.checkedAt).toBe(source.cache.checkedAt);
  expect(await researchRequestProgress(identity,replacement.key,signal())).toMatchObject({status:'available'});
  const parent='wrun_synthetic_'+randomUUID(),solutionScope={...scope,kind:'solution' as const,proposal:'A bounded synthetic reliability pilot.'};
  const solution=await prepareResearch(identity,solutionScope,signal(),false,parent,reuse.reference);if(!solution.ticket)throw Error('Expected solution reservation');
  expect((await loadResearchRequest(identity,solution.ticket,accountId,'solution',signal())).recon_reference).toEqual(reuse.reference);
  const claims=await Promise.allSettled(['worker-a','worker-b'].map(worker=>loadSessionResearchRequest(identity,parent,worker,accountId,'solution',signal())));
  const winners=claims.filter(claim=>claim.status==='fulfilled');expect(winners).toHaveLength(1);expect(claims.filter(claim=>claim.status==='rejected')).toHaveLength(1);if(winners[0].status==='fulfilled')expect(winners[0].value.ticket).toEqual(solution.ticket);
  await expect(loadSessionResearchRequest(identity,parent,'worker-c',accountId,'solution',signal())).rejects.toThrow('No unique');
  expect((await prepareResearch(identity,{...solutionScope,question:'A model-generated rephrasing'},signal(),false,parent,reuse.reference)).status).toBe('working');
  const changedContextScope={...scope,question:'Another bounded source question'};
  const inflight=await prepareResearch(identity,changedContextScope,signal());if(!inflight.ticket)throw Error('Expected context-bound request');
  const beforeChange=await loadResearchContext(identity,accountId,signal());
  const beforeChangeReceipt=signCustomerUpdate({...receipt.payload,context:beforeChange,issuedAt:new Date().toISOString()});
  await db.query("UPDATE customer_references SET display_name='Synthetic renamed cache contract account' WHERE id=$1",[accountId]);
  await expect(finishResearchRequest(identity,inflight.ticket,beforeChangeReceipt,signal())).rejects.toThrow('context changed');
  await db.query("UPDATE customer_references SET display_name='Synthetic cache contract account' WHERE id=$1",[accountId]);

  await expect(loadResearchRequest({...identity,userId:randomUUID()},replacement.ticket,accountId,'customer-update',signal())).rejects.toThrow();
  // A changed current customer source invalidates reuse before another run is admitted.
  const canonical=(await db.query('SELECT id FROM evidence_source_revisions WHERE customer_id=$1',[accountId])).rows;expect(canonical.length).toBeGreaterThan(0);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) SELECT $1,id,1,'withdraw','Synthetic cache source loss' FROM evidence_source_revisions WHERE customer_id=$2 LIMIT 1",[randomUUID(),accountId]);
  expect(await researchRequestProgress(identity,replacement.key,signal())).toMatchObject({status:'unavailable'});
 }finally{await db.end();}
});
it('removes expired cache requests/fetches/snapshots and their passage associations without deleting public learning history',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity,accountId}=await fixture(db),url='https://example.org/retention/'+randomUUID();vi.stubEnv('AI_GATEWAY_API_KEY','');vi.stubEnv('CONTEXT_DEV_API_KEY','synthetic-rendered-provider');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,url,markdown:'Synthetic retained historical source. '.repeat(8),metadata:{title:'Synthetic historical source'}})));
  const source=await readCachedSource(identity,accountId,'public workload',url,signal());const request=await prepareResearch(identity,{accountId,workload:'public workload',question:'What is retained?',kind:'customer-update'},signal());
  await db.query('UPDATE turas_research_requests SET started_at=now()-interval \'31 days\',lease_until=now()-interval \'1 day\' WHERE workspace_id=$1',[identity.workspaceId]);await db.query('UPDATE turas_evidence_fetches SET expires_at=now()-interval \'31 days\' WHERE workspace_id=$1',[identity.workspaceId]);await db.query('UPDATE turas_evidence_snapshots SET checked_at=now()-interval \'91 days\' WHERE workspace_id=$1',[identity.workspaceId]);
  await maintainResearchEvidence(identity.environmentId,signal());
  expect((await db.query('SELECT 1 FROM turas_research_requests WHERE key=$1 AND workspace_id=$2',[request.key,identity.workspaceId])).rowCount).toBe(0);expect((await db.query('SELECT 1 FROM turas_evidence_fetches WHERE workspace_id=$1',[identity.workspaceId])).rowCount).toBe(0);
  expect((await db.query('SELECT 1 FROM turas_evidence_passages WHERE snapshot_id=$1 AND workspace_id=$2',[source.source.cache.snapshotId,identity.workspaceId])).rowCount).toBe(0);
  const learned=await recallPublicLearning(identity,accountId,'',signal());expect(learned.length).toBeGreaterThan(0);expect(learned.every(row=>row.evidenceState==='historical')).toBe(true);
 }finally{await db.end();}
});

it('round-trips signed artifacts once under simultaneous storage and denies tampered, cancelled, expired and cross-scope transport',async()=>{
 const db=new Client({connectionString:databaseUrl});await db.connect();try{
  const {identity,accountId}=await fixture(db);
  const {brief:fixtureBrief,sources:fixtureSources}=await import('../fixtures/legacy-solution-research');
  const {signResearch,verifyResearch}=await import('../../lib/server/research/specialists/solution-research/receipt');
  const {storeResearchArtifact,loadResearchArtifact,purgeExpiredResearchArtifacts}=await import('../../lib/server/research/specialists/solution-research/artifacts');
  const context=await loadResearchContext(identity,accountId,signal()),brief={...fixtureBrief,accountId};
  const receipt=signResearch({userId:identity.userId,environmentId:identity.environmentId,workspaceId:identity.workspaceId,issuedAt:new Date().toISOString(),context,brief,sources:fixtureSources,blockers:[]});
  const refs=await Promise.all([storeResearchArtifact(receipt,identity,signal()),storeResearchArtifact(receipt,identity,signal())]);
  expect(refs[0]).toEqual(refs[1]);const loaded=await loadResearchArtifact(refs[0],identity,signal());expect(loaded).toEqual(receipt);expect(verifyResearch(loaded!,identity)).toBe(true);
  expect((await db.query('SELECT count(*)::int n FROM turas_research_artifacts WHERE workspace_id=$1',[identity.workspaceId])).rows[0].n).toBe(1);
  for(const patch of [{userId:randomUUID()},{workspaceId:randomUUID()},{environmentId:'test-other'}])expect(await loadResearchArtifact(refs[0],{...identity,...patch},signal())).toBeNull();
  expect(await loadResearchArtifact({...refs[0],accountId:randomUUID()},identity,signal())).toBeNull();
  await expect(loadResearchArtifact(refs[0],identity,AbortSignal.abort())).rejects.toThrow();
  const forged=structuredClone(receipt);forged.payload.brief.proposal+=' altered during handoff';
  await expect(storeResearchArtifact(forged,identity,signal())).rejects.toThrow('Invalid research artifact');
  await db.query('UPDATE turas_research_artifacts SET receipt=$1::jsonb WHERE id=$2 AND workspace_id=$3',[JSON.stringify(forged),refs[0].researchId,identity.workspaceId]);
  expect(await loadResearchArtifact(refs[0],identity,signal())).toBeNull();
  const fresh=signResearch({...receipt.payload,issuedAt:new Date(Date.now()-500).toISOString()});const freshRef=await storeResearchArtifact(fresh,identity,signal());
  await db.query('UPDATE turas_research_artifacts SET receipt=$1::jsonb,expires_at=now()-interval \'1 second\' WHERE id=$2 AND workspace_id=$3',[JSON.stringify(receipt),refs[0].researchId,identity.workspaceId]);
  const [expired]=await Promise.all([loadResearchArtifact(refs[0],identity,signal()),purgeExpiredResearchArtifacts(identity)]);expect(expired).toBeNull();
  expect((await db.query('SELECT 1 FROM turas_research_artifacts WHERE id=$1',[refs[0].researchId])).rowCount).toBe(0);
  expect(await loadResearchArtifact(freshRef,identity,signal())).toEqual(fresh);
 }finally{await db.end();}
});
