import {afterAll,beforeAll,expect,it} from 'vitest';
import {Client} from 'pg';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {withRecoveryDatabaseCheckpoint} from '../../../lib/server/operations/database-checkpoint';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {restoreOwnedRecoveryDump} from '../../../lib/server/operations/pg-restore';
import {transitionRecoveryControl} from '../../../lib/server/operations/control';
import {withPrivateRecoveryKey} from '../../../lib/server/operations/recovery-key';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey} from '../../../lib/server/storage/private-objects';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import {getCurrentSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {readProfile} from '../../../lib/server/profiles/read';
import {randomUUID} from 'node:crypto';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';

let root:string,source:Parameters<typeof restoreOwnedRecoveryDump>[0];
beforeAll(async()=>{
 root=await mkdtemp(resolve('local-artifacts/016/recovery-interruption-'));
 await withPilotEnvironment(async env=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   const scope=await lockAuthorityTarget(owner,env.environmentId);
   await withRecoveryDatabaseCheckpoint(owner,{...scope,signal:env.signal},async boundary=>{
    const dump=join(root,'database.dump'),receipt=await runRecoveryPgDump({environmentId:env.environmentId,snapshot:boundary.snapshot,serverMajor:boundary.serverMajor,output:dump,signal:env.signal});
    source={dump,serverMajor:18,clientMajor:18,digest:receipt.digest,sizeBytes:receipt.sizeBytes,sourceDatabaseName:env.databaseName,sourceEnvironmentId:env.environmentId,signal:env.signal};
   });
  }finally{await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});

it('keeps an interrupted capture fenced',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const scope=await lockAuthorityTarget(owner,environmentId),cancellation=new AbortController();let snapshot='';
 await expect(withRecoveryDatabaseCheckpoint(owner,{...scope,signal:cancellation.signal},async boundary=>{snapshot=boundary.snapshot;cancellation.abort(Error('Controlled checkpoint interruption'));})).rejects.toThrow('Controlled checkpoint interruption');
 const observer=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await observer.connect();
 try{
  await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await expect(observer.query("SET TRANSACTION SNAPSHOT '"+snapshot+"'")).rejects.toThrow('does not exist');await observer.query('ROLLBACK');
  expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
  await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
 }finally{await observer.query('ROLLBACK').catch(()=>undefined);await observer.end();}
}),210000);

it('denies unlock before complete verification',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const scope=await lockAuthorityTarget(owner,environmentId);
 await expect(transitionRecoveryControl(owner,{environmentId,recoveryId:scope.recoveryId,expectedRevision:scope.controlRevision,operationId:randomUUID(),mode:'open',verifiedBundleDigest:'a'.repeat(64)})).rejects.toThrow('verification required');
 await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);

it('rejects a missing key or object',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 await lockAuthorityTarget(owner,environmentId);let keyUsed=false;
 await expect(withPrivateRecoveryKey({file:join(root,'absent.key'),excludedRoots:[join(root,'objects')],signal:AbortSignal.timeout(5000)},async()=>{keyUsed=true;})).rejects.toMatchObject({code:'ENOENT'});
 expect(keyUsed).toBe(false);
 await expect(restoreOwnedRecoveryDump({...source,dump:join(root,'absent.dump'),signal:AbortSignal.timeout(10000)})).rejects.toMatchObject({code:'ENOENT'});
 const store=new LocalPrivateObjects(process.env.TURAS_ARTIFACT_STORE_ROOT!,environmentId,10485760);
 await expect(store.stream(objectKey(environmentId,'artifact', 'f'.repeat(64)))).rejects.toThrow();
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);

it('resumes interrupted exact cleanup',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const {createArtifactStore}=await import('../../../lib/server/artifacts/store-factory');
 const {createArtifactDatabaseFixture}=await import('../../fixtures/artifact-database');
 const {retireArtifactVersion}=await import('../../../lib/server/artifacts/lifecycle');
 const {claimArtifactCleanup,runArtifactCleanup}=await import('../../../lib/server/artifacts/cleanup');
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),bytes=Buffer.from('Synthetic exact recovery cleanup'),store=createArtifactStore();
 const staged=await store.stage((async function*(){yield bytes;})(),bytes.length),key=await store.finalize(staged.key,staged.digest);
 await owner.query('BEGIN');let artifact:Awaited<ReturnType<typeof createArtifactDatabaseFixture>>;
 try{artifact=await createArtifactDatabaseFixture(owner as any,f.actor,f.customerId,null,bytes,key);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const command={action:'delete' as const,expectedGeneration:1,reason:'Synthetic interrupted exact cleanup',idempotencyKey:randomUUID()};
 const receipt=await retireArtifactVersion(f.actor,artifact.versionId,command);
 await lockAuthorityTarget(owner,environmentId);let interrupted=false,settled=false;
 for(let n=0;n<20;n++){
  const job=await claimArtifactCleanup();if(!job)break;
  if(job.version_id===artifact.versionId&&job.target_kind==='original'&&!interrupted){
   const originalRoot=process.env.TURAS_ARTIFACT_STORE_ROOT;process.env.TURAS_ARTIFACT_STORE_ROOT=originalRoot+'/unavailable';
   try{await runArtifactCleanup(job);}finally{process.env.TURAS_ARTIFACT_STORE_ROOT=originalRoot;}
   expect((await owner.query('SELECT state FROM artifact_cleanup_jobs WHERE id=$1',[job.id])).rows[0].state).toBe('retry');
   expect(await store.readPath(key)).toBeTruthy();await owner.query('UPDATE artifact_cleanup_jobs SET next_attempt_at=now() WHERE id=$1',[job.id]);interrupted=true;
  }else{await runArtifactCleanup(job);if(job.version_id===artifact.versionId&&job.target_kind==='original')settled=true;}
 }
 expect(interrupted).toBe(true);expect(settled).toBe(true);
 expect((await owner.query('SELECT state FROM artifact_versions WHERE id=$1',[artifact.versionId])).rows[0].state).toBe('deleted');
 await expect(store.readPath(key)).rejects.toThrow();expect(await claimArtifactCleanup()).toBeNull();
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
 // Locking denies ordinary replay too; the original permanent receipt remains.
 await expect(retireArtifactVersion(f.actor,artifact.versionId,command)).rejects.toMatchObject({code:'recovery_locked'});
 expect(receipt).toBeTruthy();
}),210000);

it('holds uncertain paid and send attempts',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const {publishedReportFixture}=await import('../../fixtures/reports/published');
 const {reportTransaction}=await import('../../../lib/server/reports/commands');
 const {verifyConfiguredReportSender,registerVerifiedReportSender}=await import('../../../lib/server/reports/senders');
 const {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy}=await import('../../../lib/server/reports/recipient-policy');
 const {previewReportSend,submitReportSendDecision}=await import('../../../lib/server/reports/service');
 const {claimReportDeliveries,dispatchReportDelivery}=await import('../../../lib/server/reports/outbox');
 Object.assign(process.env,{TURAS_REPORT_SENDER_ADDRESS:'recovery@example.invalid',TURAS_REPORT_SENDER_ID:randomUUID(),TURAS_REPORT_SENDER_DOMAIN_ID:randomUUID(),RESEND_API_KEY:'synthetic-provider-test-only',TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'synthetic',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({synthetic:Buffer.alloc(32,7).toString('base64')})});
 const f=await publishedReportFixture();
 const sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:process.env.TURAS_REPORT_SENDER_DOMAIN_ID,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
 await reportTransaction(db=>registerVerifiedReportSender(db,f.reviewer.workspaceId,sender));
 const policy=await reportTransaction(db=>createReportRecipientPolicy(db,f.reviewer,f.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:sender.id,recipients:[{address:'interrupted@example.invalid',entitlementRationale:'Explicit synthetic recovery recipient'}]}));
 const review=await reportTransaction(db=>createReportPolicyPreview(db,f.reviewer,policy.policyId,'approve',1));
 await reportTransaction(db=>decideReportPolicy(db,f.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve synthetic recovery recipient',previewId:review.previewId,previewDigest:review.previewDigest}));
 const input={action:'send' as const,policyId:policy.policyId,expectedVersion:f.published.version,expectedPolicyVersion:2},preview=await previewReportSend(f.reviewer,f.published.publicationId,input);
 await submitReportSendDecision(f.reviewer,f.published.publicationId,{...input,requestKey:randomUUID(),rationale:'Authorize only synthetic recovery fixture',previewId:preview.previewId,previewDigest:preview.previewDigest});
 const claims=await reportTransaction(db=>claimReportDeliveries(db,1));expect(claims).toHaveLength(1);
 const before=(await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[0].id])).rows[0];
 const budgetId=randomUUID(),reservationId=randomUUID(),digest='c'.repeat(64);
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,1000000,clock_timestamp()+interval '1 hour')",[budgetId,environmentId,digest]);
 await owner.query('INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,$3,100000)',[reservationId,budgetId,digest]);
 await owner.query("UPDATE operations_cost_reservations SET job_id=$2,state='dispatched',dispatched_at=clock_timestamp() WHERE id=$1",[reservationId,randomUUID()]);
 const scope=await lockAuthorityTarget(owner,environmentId),result=await quarantineRestoredAuthority(owner,{environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision});
 expect(result).toMatchObject({newlyHeldPaidReservations:1,newlyHeldReportDeliveries:1,restorationReady:false});
 expect((await owner.query('SELECT state FROM operations_cost_reservations WHERE id=$1',[reservationId])).rows[0].state).toBe('unknown');
 const held=(await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[0].id])).rows[0];
 expect(held).toMatchObject({state:'uncertain',provider_key:before.provider_key,first_dispatch_at:before.first_dispatch_at,next_attempt_at:null,lease_token:null});
 let posts=0;await expect(dispatchReportDelivery(claims[0],async()=>{posts++;throw Error('Duplicate provider dispatch forbidden');})).rejects.toThrow('lease changed');expect(posts).toBe(0);
 await expect(owner.query("UPDATE operations_cost_reservations SET state='reserved' WHERE id=$1",[reservationId])).rejects.toThrow('Invalid cost transition');
 expect(await quarantineRestoredAuthority(owner,{environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision})).toMatchObject({newlyHeldPaidReservations:0,newlyHeldReportDeliveries:0});
 expect((await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[0].id])).rows[0]).toEqual(held);
}),210000);

it('rejects a wrong marker or schema',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const scope=await lockAuthorityTarget(owner,environmentId);let called=false;
 await expect(withRecoveryDatabaseCheckpoint(owner,{...scope,environmentId:'foreign',signal:AbortSignal.timeout(10000)},async()=>{called=true;})).rejects.toThrow('target differs');
 await owner.query('UPDATE turas_environment SET schema_version=78');
 await expect(withRecoveryDatabaseCheckpoint(owner,{...scope,signal:AbortSignal.timeout(10000)},async()=>{called=true;})).rejects.toThrow('target differs');
 await expect(restoreOwnedRecoveryDump({...source,signal:AbortSignal.timeout(10000)})).rejects.toThrow('marker required');
 expect(called).toBe(false);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);

it('denies locked UI native MCP and job admission',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary');
 const connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic recovery admission',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1});
 if(!connection.secretAvailable)throw Error('Fresh synthetic credential required');
 const headers={cookie:`${sessionCookieName()}=${f.actor.token}`};
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!+'/api/auth/session',{headers}))).not.toBeNull();
 await lockAuthorityTarget(owner,environmentId);
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!+'/api/auth/session',{headers}))).toBeNull();
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!+'/eve/v1/session',{method:'POST',headers}))).toBeNull();
 await expect(readProfile(f.actor,f.customerId)).rejects.toMatchObject({code:'recovery_locked'});
 await expect(createOwnedConversation(f.actor,{customerId:f.customerId,requestKey:randomUUID()})).rejects.toMatchObject({code:'recovery_locked'});
 await expect(authenticateMcpBearer('Bearer '+connection.credential)).rejects.toMatchObject({code:'recovery_locked'});
 await expect(runtime.query(`INSERT INTO operations_local_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,image_digest,lease_id,deadline_at,lease_expires_at,state) VALUES($1,$2,'artifact',$3,1,$4,$4,$5,clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '29 seconds','running')`,[randomUUID(),environmentId,randomUUID(),'d'.repeat(64),randomUUID()])).rejects.toThrow('admission closed');
}),210000);

it('keeps an interrupted restore locked',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 await lockAuthorityTarget(owner,environmentId);
 const blocker=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await blocker.connect();
 const cancellation=new AbortController();let observed=false;
 await blocker.query('BEGIN');await blocker.query('LOCK TABLE principals IN ACCESS EXCLUSIVE MODE');
 const restoring=restoreOwnedRecoveryDump({...source,signal:cancellation.signal});
 const settled=restoring.then(()=>({failed:false}),()=>({failed:true}));
 try{
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
   const waiting=await owner.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='pg_restore' AND wait_event_type='Lock'");
   if(waiting.rowCount){observed=true;break;}
   await new Promise(done=>setTimeout(done,25));
  }
  cancellation.abort(Error('Controlled physical restore interruption'));await blocker.query('ROLLBACK');
  expect(await settled).toEqual({failed:true});expect(observed).toBe(true);
  expect((await owner.query("SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='turas_runtime'")).rows[0].n).toBe(0);
  const control=await owner.query("SELECT to_regclass('public.operations_control') AS table_id");
  if(control.rows[0].table_id)expect((await owner.query('SELECT mode FROM operations_control')).rows.every(row=>row.mode==='locked')).toBe(true);
  await expect(runtime.query('SELECT * FROM principals')).rejects.toThrow();
 }finally{cancellation.abort();await blocker.query('ROLLBACK').catch(()=>undefined);await settled;await blocker.end();}
}),210000);
