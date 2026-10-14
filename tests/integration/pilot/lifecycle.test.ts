import {beforeAll,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withdrawKnowledge} from '../../../lib/server/knowledge/service';
import {readPublishedKnowledge} from '../../../lib/server/knowledge/read';
import {searchEvidence} from '../../../lib/server/retrieval/search';
import {resolveRetrievalCitation} from '../../../lib/server/retrieval/citations';
import {assertRetrievalDependenciesCurrent,recordRetrievalConsumption} from '../../../lib/server/retrieval/fences';
import {runRetrievalLifecycleTick} from '../../../scripts/retrieval-worker';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {createMcpConnection,revokeMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import {readMcpKnowledge} from '../../../lib/server/mcp/knowledge';
import {runMcpMaintenanceTick} from '../../../lib/server/mcp/retention';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {submitProfileCommandDetailed} from '../../../lib/server/profiles/service';
import {suspendStaleKnowledge} from '../../../lib/server/knowledge/suspension';
const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)});let db:PoolClient,f:Awaited<ReturnType<typeof pilotPublishedKnowledgeFixture>>,sourceId:string,receipt:Awaited<ReturnType<typeof searchEvidence>>,conversationId:string,connection:Awaited<ReturnType<typeof createMcpConnection>>,mcp:Awaited<ReturnType<typeof authenticateMcpBearer>>;
const disabled=process.env.TURAS_005_DISABLED;
beforeAll(async()=>{db=await pool.connect();});afterAll(async()=>{db.release();await pool.end();await closeRuntimePool();});afterEach(()=>{if(disabled===undefined)delete process.env.TURAS_005_DISABLED;else process.env.TURAS_005_DISABLED=disabled;});
const search=()=>searchEvidence(f.actor,{scope:'shared',query:'stage',use:'current_fact',limit:10},{audience:'internal',workloadId:null,lexicalOnly:true});
beforeEach(async()=>{
 f=await pilotPublishedKnowledgeFixture(db,'primary');sourceId=(await db.query('SELECT id FROM retrieval_sources WHERE source_revision_id=$1',[f.revisionId])).rows[0].id;
 receipt=await search();expect(receipt.results.some(row=>row.sourceRevisionId===f.revisionId)).toBe(true);
 const conversation=await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Synthetic lifecycle context'});conversationId=conversation.conversation.id;
 await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[conversationId,'synthetic-native-'+randomUUID()]);await recordRetrievalConsumption(db,f.actor,receipt.receiptId,conversationId);
 connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic lifecycle connection',categories:['knowledge'],customerIds:[],lifetimeDays:1});if(!connection.secretAvailable)throw Error('Fresh fixture credential required');mcp=await authenticateMcpBearer('Bearer '+connection.credential);
},30000);
function command(){return {idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:f.digest,expectedPublicationGeneration:f.generation,rationale:'Synthetic lifecycle withdrawal'};}
async function withdraw(input=command()){await db.query('BEGIN');try{const result=await withdrawKnowledge(db,f.actor,f.publicationId,input);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
async function passages(){return Number((await db.query('SELECT count(*) AS n FROM retrieval_passages WHERE source_id=$1',[sourceId])).rows[0].n);}
it('withholds withdrawn knowledge before deleting derived bytes',async()=>{await withdraw();expect(await passages()).toBeGreaterThan(0);await expect(readPublishedKnowledge(db,f.actor,f.publicationId)).rejects.toThrow();});
it('withholds withdrawn content from search before cleanup',async()=>{await withdraw();expect(await passages()).toBeGreaterThan(0);expect((await search()).results.some(row=>row.sourceRevisionId===f.revisionId)).toBe(false);});
it('denies an existing citation immediately after withdrawal',async()=>{const citation=receipt.results.find(row=>row.sourceRevisionId===f.revisionId)!.citationId;await withdraw();await expect(resolveRetrievalCitation(db,f.actor,citation)).rejects.toThrow();});
it('denies stale native dependencies before retirement completes',async()=>{await withdraw();await expect(assertRetrievalDependenciesCurrent(db,conversationId)).rejects.toThrow();expect(await passages()).toBeGreaterThan(0);});
it('denies an existing MCP actor after source withdrawal',async()=>{expect((await readMcpKnowledge(db,mcp,{publicationId:f.publicationId})).status).not.toBe('unavailable');await withdraw();expect((await readMcpKnowledge(db,mcp,{publicationId:f.publicationId})).status).toBe('unavailable');});
it('purges withdrawn projections while authoring is disabled',async()=>{await withdraw();process.env.TURAS_005_DISABLED='1';await runRetrievalLifecycleTick([sourceId]);expect(await passages()).toBe(0);expect(Number((await db.query('SELECT count(*) AS n FROM retrieval_embedding_operations')).rows[0].n)).toBe(0);});
it('retains permanent withdrawal replay authority after payload cleanup',async()=>{const input=command(),first=await withdraw(input);await runRetrievalLifecycleTick([sourceId]);expect(await withdraw(input)).toMatchObject({decisionId:first.decisionId,replayed:true});expect((await db.query('SELECT 1 FROM knowledge_decisions WHERE id=$1',[first.decisionId])).rowCount).toBe(1);});
it('revokes MCP reads before cleanup and retains the management receipt',async()=>{await revokeMcpConnection(f.actor,connection.connection.id,{requestKey:randomUUID(),expectedConnectionId:connection.connection.id});await expect(authenticateMcpBearer('Bearer '+(connection.secretAvailable?connection.credential:''))).rejects.toThrow();await runMcpMaintenanceTick();expect((await db.query('SELECT credential_hash,revoked_at FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0]).toMatchObject({credential_hash:null,revoked_at:expect.any(Date)});expect((await db.query("SELECT 1 FROM mcp_management_receipts WHERE connection_id=$1 AND action='revoke'",[connection.connection.id])).rowCount).toBe(1);});
it('withholds every shared consumer after original retraction and preserves exact retraction replay',async()=>{
 const version=Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[f.originalRevisionId])).rows[0].version);
 const input={action:'retract_revision',requestKey:randomUUID(),revisionId:f.originalRevisionId,expectedRecordVersion:version,rationale:'Controlled original withdrawal before derived cleanup'};
 const citation=receipt.results.find(row=>row.sourceRevisionId===f.revisionId)!.citationId;
 const first=await submitProfileCommandDetailed(f.actor,f.customerId,input);
 expect(first.replayed).toBe(false);expect(await passages()).toBeGreaterThan(0);
 await expect(readPublishedKnowledge(db,f.actor,f.publicationId)).rejects.toThrow();
 expect((await search()).results.some(row=>row.sourceRevisionId===f.revisionId)).toBe(false);
 await expect(resolveRetrievalCitation(db,f.actor,citation)).rejects.toThrow();
 await expect(assertRetrievalDependenciesCurrent(db,conversationId)).rejects.toThrow();
 expect((await readMcpKnowledge(db,mcp,{publicationId:f.publicationId})).status).toBe('unavailable');
 process.env.TURAS_005_DISABLED='1';
 // The original fence acts immediately. The separate bounded knowledge sweep
 // then retires the dependent publication before retrieval removes its bytes.
 await suspendStaleKnowledge();await suspendStaleKnowledge();
 expect((await db.query('SELECT state FROM knowledge_publications WHERE id=$1',[f.publicationId])).rows[0].state).toBe('suspended');
 await runRetrievalLifecycleTick([sourceId]);expect(await passages()).toBe(0);
 const replay=await submitProfileCommandDetailed(f.actor,f.customerId,input);expect(replay).toMatchObject({replayed:true,data:first.data});
 expect((await db.query("SELECT count(*)::int AS count FROM profile_lifecycle_events WHERE revision_id=$1 AND event_type='retract'",[f.originalRevisionId])).rows[0].count).toBe(1);
});


it('keeps deleted originals and native output closed through interrupted cleanup',async()=>{
 const {createArtifactStore}=await import('../../../lib/server/artifacts/store-factory');
 const {createArtifactDatabaseFixture}=await import('../../fixtures/artifact-database');
 const {retireArtifactVersion}=await import('../../../lib/server/artifacts/lifecycle');
 const {attachConversationArtifact}=await import('../../../lib/server/artifacts/references');
 const {assertArtifactDependenciesCurrent}=await import('../../../lib/server/artifacts/context-fence');
 const {processNativeRetirement}=await import('../../../lib/server/artifacts/native-retirement');
 const {claimArtifactCleanup,runArtifactCleanup}=await import('../../../lib/server/artifacts/cleanup');
 const bytes=Buffer.from('Synthetic original lifecycle bytes'),store=createArtifactStore();
 const staged=await store.stage((async function*(){yield bytes;})(),bytes.length),key=await store.finalize(staged.key,staged.digest);
 await db.query('BEGIN');let original:Awaited<ReturnType<typeof createArtifactDatabaseFixture>>;
 try{original=await createArtifactDatabaseFixture(db,f.actor,f.customerId,null,bytes,key);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
 const nativeId='synthetic-native-'+randomUUID();
 await db.query("UPDATE artifact_extraction_runs SET state='published',scan_receipt='{}',coverage='{\"total\":1,\"visited\":1,\"omitted\":[]}',manifest_digest=$2,published_at=now() WHERE id=$1",[original.runId,original.originalDigest]);
 await db.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[original.versionId]);
 await db.query("UPDATE artifact_versions SET state='ready' WHERE id=$1",[original.versionId]);
 await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[original.conversationId,nativeId]);
 await db.query(`INSERT INTO conversation_artifact_dependencies(conversation_id,version_id,run_id,environment_id,workspace_id,customer_id,owner_principal_id,lifecycle_generation) VALUES($1,$2,$3,$4,$5,$6,$7,1)`,[original.conversationId,original.versionId,original.runId,process.env.TURAS_ENVIRONMENT_ID,f.actor.workspaceId,f.customerId,f.actor.principalId]);
 await attachConversationArtifact(f.actor,original.conversationId,original.versionId);
 const input={action:'delete' as const,expectedGeneration:1,reason:'Synthetic interrupted deletion',idempotencyKey:randomUUID()};
 const retired=await retireArtifactVersion(f.actor,original.versionId,input);
 await expect(attachConversationArtifact(f.actor,original.conversationId,original.versionId)).rejects.toThrow();
 await expect(assertArtifactDependenciesCurrent(db,original.conversationId)).rejects.toThrow();
 expect(await store.readPath(key)).toBeTruthy();
 const origin=process.env.TURAS_EVE_INTERNAL_ORIGIN;delete process.env.TURAS_EVE_INTERNAL_ORIGIN;
 try{expect(await processNativeRetirement()).toBe(true);}finally{if(origin!==undefined)process.env.TURAS_EVE_INTERNAL_ORIGIN=origin;}
 const native=(await db.query('SELECT state,safe_error_code FROM artifact_native_retirement_receipts WHERE version_id=$1',[original.versionId])).rows[0];
 expect(native).toMatchObject({state:'retry',safe_error_code:'native_origin_unavailable'});
 let interrupted=false,completed=0;
 for(let i=0;i<20;i++){
  const job=await claimArtifactCleanup();if(!job)break;
  if(job.version_id===original.versionId&&job.target_kind==='original'&&!interrupted){
   const root=process.env.TURAS_ARTIFACT_STORE_ROOT;process.env.TURAS_ARTIFACT_STORE_ROOT=root+'/unavailable';
   try{await runArtifactCleanup(job);}finally{process.env.TURAS_ARTIFACT_STORE_ROOT=root;}
   expect((await db.query('SELECT state FROM artifact_cleanup_jobs WHERE id=$1',[job.id])).rows[0].state).toBe('retry');
   expect(await store.readPath(key)).toBeTruthy();await db.query('UPDATE artifact_cleanup_jobs SET next_attempt_at=now() WHERE id=$1',[job.id]);interrupted=true;
  }else{await runArtifactCleanup(job);completed++;}
 }
 expect(interrupted).toBe(true);expect(completed).toBeGreaterThan(0);
 expect((await db.query('SELECT state FROM artifact_versions WHERE id=$1',[original.versionId])).rows[0].state).toBe('deleted');
 await expect(store.readPath(key)).rejects.toThrow();
 expect(await retireArtifactVersion(f.actor,original.versionId,input)).toEqual(retired);
 expect((await db.query('SELECT state FROM artifact_native_retirement_receipts WHERE version_id=$1',[original.versionId])).rows[0].state).toBe('retry');
 await expect(assertArtifactDependenciesCurrent(db,original.conversationId)).rejects.toThrow();
});

it('withholds report streams during partial Blob expiry and retains permanent publication history',async()=>{
 const {publishedReportFixture}=await import('../../fixtures/reports/published');
 const {ownedReportFixtureTransaction}=await import('../../fixtures/reports/environment');
 const {reportTransaction}=await import('../../../lib/server/reports/commands');
 const {cleanupReportRevisionPayloads,cleanupReportFiles}=await import('../../../lib/server/reports/cleanup');
 const {streamReportArtifact}=await import('../../../lib/server/reports/artifacts');
 const {readReportObject}=await import('../../../lib/server/reports/store');
 const {BlobPrivateObjects}=await import('../../../lib/server/storage/blob-objects');
 const {objectKey}=await import('../../../lib/server/storage/private-objects');
 const {createHash}=await import('node:crypto');
 const previous=Object.fromEntries(['TURAS_REPORTS_ENABLED','TURAS_REPORT_RENDERER_IMAGE','TURAS_PRIVATE_OBJECT_BACKEND','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN'].map(k=>[k,process.env[k]]));
 const mocks:Array<{mockRestore():void}>=[];
 try{
  const report=await publishedReportFixture(),monthly=report.reports[1];
  const {previewReportPublication,submitReportPublicationDecision}=await import('../../../lib/server/reports/service');
  const preview=await previewReportPublication(report.reviewer,monthly.reportId,{action:'publish',expectedVersion:monthly.version});
  const published=await submitReportPublicationDecision(report.reviewer,monthly.reportId,{action:'publish',expectedVersion:monthly.version,requestKey:randomUUID(),rationale:'Publish actual synthetic monthly files for lifecycle verification',previewId:preview.previewId,previewDigest:preview.previewDigest}) as {reportId:string;revisionId:string;artifacts:unknown[]};
  const revisionId=published.revisionId;
  const files=await reportTransaction(async runtime=>(await runtime.query('SELECT * FROM report_artifacts WHERE revision_id=$1 ORDER BY format',[revisionId])).rows);
  expect(published.artifacts).toHaveLength(2);
  expect(files).toHaveLength(2);
  const history=(await db.query('SELECT * FROM report_publications WHERE revision_id=$1',[revisionId])).rows;
  const stream=await streamReportArtifact(report.reviewer,published.reportId,files[0].id),reader=stream.stream.getReader();expect((await reader.read()).value?.length).toBeGreaterThan(0);
  const mirror=new Map<string,Buffer>();for(const file of files)mirror.set(objectKey(process.env.TURAS_ENVIRONMENT_ID!,'report',file.object_key),await readReportObject(file.object_key,file.content_digest,Number(file.size_bytes)));
  await ownedReportFixtureTransaction(owner=>owner.query("UPDATE report_revision_states SET payload_expires_at=now()-interval '1 second' WHERE revision_id=$1",[revisionId]));
  await reportTransaction(runtime=>cleanupReportRevisionPayloads(runtime));
  await expect(reader.read()).rejects.toThrow();await expect(streamReportArtifact(report.reviewer,published.reportId,files[0].id)).rejects.toThrow();
  let removes=0,interrupt=true;
  mocks.push(vi.spyOn(BlobPrivateObjects.prototype,'headers').mockResolvedValue({objects:[]}));
  mocks.push(vi.spyOn(BlobPrivateObjects.prototype,'stat').mockImplementation(async key=>{const content=mirror.get(key);return content?{key,sizeBytes:content.length,digest:createHash('sha256').update(content).digest('hex')}:null;}));
  mocks.push(vi.spyOn(BlobPrivateObjects.prototype,'delete').mockImplementation(async key=>{if(interrupt&&++removes===2)throw Error('Controlled Blob deletion interruption');mirror.delete(key);}));
  Object.assign(process.env,{TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'controlled016',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlled016_SYNTHETIC_NOT_A_CREDENTIAL'});
  await expect(reportTransaction(runtime=>cleanupReportFiles(runtime))).rejects.toThrow('Controlled Blob deletion interruption');expect(mirror.size).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM report_store_objects WHERE revision_id=$1 AND state='deleted'",[revisionId])).rows[0].n).toBe(0);
  interrupt=false;expect((await reportTransaction(runtime=>cleanupReportFiles(runtime))).purged).toBe(2);expect(mirror.size).toBe(0);
  expect((await reportTransaction(runtime=>cleanupReportFiles(runtime))).purged).toBe(0);
  expect((await db.query('SELECT * FROM report_publications WHERE revision_id=$1',[revisionId])).rows).toEqual(history);
  // The controlled adapter only touched its mirror. Local fixture originals
  // survive and are removed with the entire owned environment by the harness.
 }finally{for(const mock of mocks)mock.mockRestore();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
},300000);
