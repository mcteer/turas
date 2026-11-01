import {Client} from 'pg';
import {runNativeRecoveryPgDump} from '../../../lib/server/operations/native-postgres';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,lstat,mkdir,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {captureWorkRecoveryCandidate} from '../../../lib/server/operations/capture-work-candidate';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {decryptRecoveryFile} from '../../../lib/server/operations/backup-crypto';
import {unpackBackupArchive} from '../../../lib/server/operations/backup-archive';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {copyWorkCapture} from '../../../lib/server/operations/work-capture-copy';
import {reserveWorkBackupCost,transitionWorkBackupCost,provisionWorkBackupCostAuthority,reviewWorkBackupCost} from '../../../lib/server/operations/work-backup-cost';
import {deriveWorkBackupKey,workBackupScopeDigest,runOwnedScheduledWorkBackup} from '../../../lib/server/operations/work-backup-run';
import {readWorkCapture} from '../../../lib/server/operations/work-capture-read';
const connectionString=process.env.DATABASE_URL_UNPOOLED!,environmentId=process.env.TURAS_TEST_ENVIRONMENT_ID!;
const db=new Client({connectionString}),writer=new Client({connectionString});
try{
 await db.connect();await writer.connect();await db.query('CREATE TABLE native_snapshot_proof (id int PRIMARY KEY, value text NOT NULL)');await db.query("INSERT INTO native_snapshot_proof VALUES(1,'before-snapshot')");
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const snapshot=(await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
 await writer.query("UPDATE native_snapshot_proof SET value='after-snapshot'");
 const input={assetRoot:'/native-client',connectionString,environmentId,serverMajor:18 as const,snapshot,output:'/output/native.dump',signal:AbortSignal.timeout(60000)};
 const dump=await runNativeRecoveryPgDump(input);await db.query('COMMIT');
 const cancelled=new AbortController();cancelled.abort();let cancellationDenied=false;
 try{await runNativeRecoveryPgDump({...input,output:'/output/cancelled.dump',signal:cancelled.signal});}catch{cancellationDenied=true;}
 const cancelledOutputAbsent=await lstat('/output/cancelled.dump').then(()=>false,error=>{if(error.code!=='ENOENT')throw error;return true;});
 await writer.query('CREATE DATABASE native_restored');
 const url=new URL(connectionString);await promisify(execFile)('/native-client/bin/pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname=native_restored','/output/native.dump'],{timeout:60000,maxBuffer:65536,env:{NODE_ENV:'test',PATH:'/usr/bin:/bin',LD_LIBRARY_PATH:'/native-client/lib',PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable'}});
 url.pathname='/native_restored';const restored=new Client({connectionString:url.toString()});await restored.connect();let snapshotContentRestored=false;
 try{snapshotContentRestored=(await restored.query('SELECT value FROM native_snapshot_proof WHERE id=1')).rows[0]?.value==='before-snapshot';}finally{await restored.end();}
 const sourceContentRetained=(await writer.query('SELECT value FROM native_snapshot_proof WHERE id=1')).rows[0]?.value==='after-snapshot';
 const recoveryId=randomUUID(),revision=Number((await writer.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0].revision);
 await mkdir('/output/objects',{mode:0o700});await mkdir('/output/candidate',{mode:0o700});
 const objects=new LocalPrivateObjects('/output/objects',environmentId,10485760),keys:string[]=[],bytes=Buffer.from('synthetic matched private object'),digest=createHash('sha256').update(bytes).digest('hex');
 for(const namespace of activeObjectNamespaces){const key=objectKey(environmentId,namespace,randomUUID());keys.push(key);await objects.put(key,(async function*(){yield bytes;})(),{digest,sizeBytes:bytes.length});}
 const key=randomBytes(32),master=randomBytes(32);let scheduledKey:Buffer|undefined,matchedCaptureVerified=false,scheduledCaptureVerified=false,coldCopyVerified=false,costAdmissionVerified=false,coldReadVerified=false,costProvisionVerified=false,scheduledRunVerified=false,notDueRunVerified=false,manualRunVerified=false;
 try{
  const candidate=await captureWorkRecoveryCandidate({scope:{environmentId,recoveryId,controlRevision:revision,sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:recoveryDigest((await writer.query('SELECT name FROM turas_migrations ORDER BY name')).rows),sourceProjectId:'prj_synthetic',storeId:'synthetic-owned-test-store',keyReference:'synthetic-separate-key',keyVersion:'1'},connectionString,assetRoot:'/native-client',output:'/output/candidate',objects,key,signal:AbortSignal.timeout(60000)});
  await decryptRecoveryFile('/output/candidate/candidate.encrypted','/output/candidate/decrypted.archive',key,candidate.encryptedBundle.headerDigest,AbortSignal.timeout(10000));
  const header=await unpackBackupArchive({archive:'/output/candidate/decrypted.archive',target:'/output/candidate/unpacked',expectedHeaderDigest:candidate.encryptedBundle.headerDigest,environmentId,checkpointId:candidate.id,signal:AbortSignal.timeout(10000)});
  matchedCaptureVerified=header.entries.length===7&&candidate.objects.objectCount===6&&candidate.workflow.backend==='managed-workflow'&&!candidate.workflow.reconciliationVerified&&!candidate.restorationReady;
  for(const entry of header.entries.filter(row=>row.name.startsWith('objects/')))matchedCaptureVerified&&=(await readFile('/output/candidate/unpacked/'+entry.name)).equals(bytes);
  for(const stored of keys)matchedCaptureVerified&&=Boolean(await objects.stat(stored));
  matchedCaptureVerified&&=(await writer.query('SELECT mode FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0]?.mode==='locked';
  const openRevision=Number((await writer.query("UPDATE operations_control SET mode='open',revision=revision+1 WHERE environment_id=$1 RETURNING revision",[environmentId])).rows[0].revision);await mkdir('/output/scheduled',{mode:0o700});
  let fenced=false;const originalList=objects.list.bind(objects);objects.list=async(...args)=>{
   const acquired=(await writer.query('SELECT pg_try_advisory_lock_shared(hashtextextended($1,16017)) AS acquired',[environmentId])).rows[0].acquired;
   if(acquired){await writer.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,16017))',[environmentId]);throw Error('Scheduled backup lost its IO fence');}fenced=true;return originalList(...args);
  };
  const installationId=randomUUID(),scheduledId=randomUUID();scheduledKey=deriveWorkBackupKey(master,{installationId,environmentId,archiveId:scheduledId});
  const scheduled=await captureWorkRecoveryCandidate({scope:{environmentId,recoveryId:scheduledId,controlRevision:openRevision,purpose:'scheduled-backup',sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:recoveryDigest((await writer.query('SELECT name FROM turas_migrations ORDER BY name')).rows),sourceProjectId:'prj_synthetic',storeId:'synthetic-owned-test-store',keyReference:'TURAS_RECOVERY_MASTER_1:'+scheduledId,keyVersion:'1'},connectionString,assetRoot:'/native-client',output:'/output/scheduled',objects,key:scheduledKey,archiveId:scheduledId,signal:AbortSignal.timeout(60000)});
  const control=(await writer.query('SELECT mode,revision FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
  scheduledCaptureVerified=fenced&&scheduled.mode==='open'&&scheduled.objects.objectCount===6&&!scheduled.scheduledBackupVerified&&control.mode==='open'&&Number(control.revision)===openRevision;
  await writer.query('CREATE DATABASE native_archive');const archiveUrl=new URL(connectionString);archiveUrl.pathname='/native_archive';const archiveDb=new Client({connectionString:archiveUrl.toString()});
  await mkdir('/output/keys',{mode:0o700});await writeFile('/output/keys/separate.key',scheduledKey,{mode:0o600,flag:'wx'});
  await archiveDb.connect();
  try{
   await archiveDb.query(await readFile('/sql/neon-archive.sql','utf8'));await archiveDb.query(await readFile('/sql/neon-archive-004-capture-receipts.sql','utf8'));
   await archiveDb.query("INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,'pilot-neon-archive-v1',$1,104857600)",[installationId]);
   for(const name of ['cold','cold-repeat'])await mkdir('/output/'+name,{mode:0o700});
   const scope={candidate:scheduled,sourceProjectId:'prj_synthetic',installationId,connectionString:archiveUrl.toString(),maximumBytes:104857600,bundle:'/output/scheduled/candidate.encrypted',keyFile:'/output/keys/separate.key',coldOutput:'/output/cold',signal:AbortSignal.timeout(60000)};
   const copied=await copyWorkCapture(scope),repeated=await copyWorkCapture({...scope,coldOutput:'/output/cold-repeat'});
   let auditImmutable=false;try{await archiveDb.query("UPDATE turas_backup.capture_receipts SET key_version='forged' WHERE archive_id=$1",[scheduled.id]);}catch(error){auditImmutable=(error as {code?:string}).code==='23514';}
   coldCopyVerified=copied.coldDownloadAuthenticated&&repeated.coldDownloadAuthenticated&&auditImmutable&&Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.capture_receipts')).rows[0].n)===1&&!copied.independentPlacementVerified&&!copied.scheduledBackupVerified&&!copied.restorationReady;
   await mkdir('/output/cold-read',{mode:0o700});await mkdir('/output/wrong-key',{mode:0o700});
   const inspection={connectionString:archiveUrl.toString(),installationId,archiveId:scheduled.id,environmentId,sourceProjectId:'prj_synthetic',master,masterReference:'TURAS_RECOVERY_MASTER_1',masterVersion:'1',output:'/output/cold-read',signal:AbortSignal.timeout(60000)};
   const inspected=await readWorkCapture(inspection);let wrongKeyDenied=false;const wrongMaster=randomBytes(32);try{await readWorkCapture({...inspection,master:wrongMaster,output:'/output/wrong-key'});}catch{wrongKeyDenied=true;}finally{wrongMaster.fill(0);}
   // Reproduce a real server timeout while a delivered chunk is being consumed.
   // Keep EventEmitter semantics: a missing client error listener must still fail.
   await mkdir('/output/cold-timeout',{mode:0o700});const originalQuery=Client.prototype.query,originalEmit=Client.prototype.emit,keyDirectories=async()=> (await readdir(tmpdir())).filter(name=>name.startsWith('turas-cold-work-key-')).sort(),keysBefore=await keyDirectories();let chunkDelivered=false,timeoutWhileConsuming=false,timeoutRejected=false;
   Client.prototype.query=(async function(this:Client,...args:any[]){if(args[0]==="SET LOCAL transaction_timeout='180s'")args[0]="SET LOCAL transaction_timeout='500ms'";const result=await (originalQuery as any).apply(this,args);if(typeof args[0]==='string'&&args[0].includes("encode(ciphertext,'base64')")){chunkDelivered=true;await new Promise(resolve=>setTimeout(resolve,750));}return result;}) as typeof originalQuery;
   Client.prototype.emit=function(this:Client,event:string|symbol,...args:any[]){if(event==='error'&&args[0]?.code==='25P04'&&chunkDelivered)timeoutWhileConsuming=true;return originalEmit.call(this,event,...args);};
   try{await readWorkCapture({...inspection,output:'/output/cold-timeout'});}catch{timeoutRejected=true;}finally{Client.prototype.query=originalQuery;Client.prototype.emit=originalEmit;}
   const timeoutCleanupVerified=chunkDelivered&&timeoutWhileConsuming&&timeoutRejected&&(await readdir('/output/cold-timeout')).length===0&&JSON.stringify(await keyDirectories())===JSON.stringify(keysBefore);if(!timeoutCleanupVerified)throw Error('Interrupted cold download must reject and remove its partial file and ephemeral key');
   coldReadVerified=inspected.encryptedArchiveVerified&&inspected.captureMetadataVerified&&inspected.candidate.id===scheduled.id&&inspected.header.entries.length===7&&wrongKeyDenied&&timeoutCleanupVerified&&!inspected.sourceAccessed&&!inspected.restorationReady;
   await archiveDb.query(await readFile('/sql/neon-archive-005-cost-authority.sql','utf8'));
   let missingReviewGuardDenied=false;
   try{await reserveWorkBackupCost(archiveDb,{installationId,environmentId,hostingBudgetId:randomUUID(),blobBudgetId:randomUUID(),scopeDigest:'d'.repeat(64),pricingDigest:'e'.repeat(64),hostingCeilingMicroUsd:500,blobCeilingMicroUsd:500},'7'.repeat(64));}catch{missingReviewGuardDenied=true;}
   if(!missingReviewGuardDenied||Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.cost_reservations')).rows[0].n)!==0)throw Error('Absent immutable review guard must deny admission');
   await archiveDb.query(await readFile('/sql/neon-archive-006-cost-reconciliation.sql','utf8'));
   const hostingBudgetId=randomUUID(),blobBudgetId=randomUUID(),binding={installationId,environmentId,hostingBudgetId,blobBudgetId,scopeDigest:'d'.repeat(64),pricingDigest:'e'.repeat(64),hostingCeilingMicroUsd:500,blobCeilingMicroUsd:500};
   const authorization={contract:'pilot-work-backup-cost-authority-v1',installationId,authorizationCapMicroUsd:2000,budgets:([['hosting',hostingBudgetId],['blob',blobBudgetId]] as const).map(([category,id])=>({contract:'pilot-cost-v1',id,environmentId,category,authorizationDigest:'f'.repeat(64),scopeDigest:binding.scopeDigest,pricingDigest:binding.pricingDigest,capMicroUsd:1000,expiresAt:new Date(Date.now()+600000).toISOString()}))};
   // One exact expiry is shared by both category allocations.
   authorization.budgets[1].expiresAt=authorization.budgets[0].expiresAt;
   let excessiveDenied=false,replacementDenied=false;
   try{await provisionWorkBackupCostAuthority(archiveDb,{...authorization,authorizationCapMicroUsd:1999});}catch{excessiveDenied=true;}
   const firstProvision=await provisionWorkBackupCostAuthority(archiveDb,authorization),repeatProvision=await provisionWorkBackupCostAuthority(archiveDb,authorization);
   try{await provisionWorkBackupCostAuthority(archiveDb,{...authorization,budgets:authorization.budgets.map(row=>({...row,id:randomUUID()}))});}catch{replacementDenied=true;}
   costProvisionVerified=excessiveDenied&&replacementDenied&&!firstProvision.replayed&&repeatProvision.replayed&&Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.cost_budgets')).rows[0].n)===2;
   let categoryDenied=false;try{await reserveWorkBackupCost(archiveDb,{...binding,blobBudgetId:hostingBudgetId},'1'.repeat(64));}catch{categoryDenied=true;}
   const atomicRollback=Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.cost_reservations')).rows[0].n)===0;
   const reserved=await reserveWorkBackupCost(archiveDb,binding,'2'.repeat(64));let concurrentDenied=false,unknownDenied=false,replayDenied=false,capDenied=false;
   try{await reserveWorkBackupCost(archiveDb,binding,'3'.repeat(64));}catch{concurrentDenied=true;}
   await transitionWorkBackupCost(archiveDb,binding,reserved,'dispatched');await transitionWorkBackupCost(archiveDb,binding,reserved,'unknown');
   try{await reserveWorkBackupCost(archiveDb,binding,'3'.repeat(64));}catch{unknownDenied=true;}
   let unreviewedDenied=false,changedReviewDenied=false;
   try{await transitionWorkBackupCost(archiveDb,binding,reserved,'settled');}catch{unreviewedDenied=true;}
   const review={contract:'pilot-work-backup-cost-review-v1',installationId,environmentId,reservationIds:reserved,operationDigest:'2'.repeat(64),chargeEvidenceDigest:'4'.repeat(64),operatorReviewDigest:'5'.repeat(64)};
   const reviewed=await reviewWorkBackupCost(archiveDb,review),reviewedAgain=await reviewWorkBackupCost(archiveDb,review);
   try{await reviewWorkBackupCost(archiveDb,{...review,operatorReviewDigest:'6'.repeat(64)});}catch{changedReviewDenied=true;}
   if(!unreviewedDenied||!changedReviewDenied||reviewed.replayed||!reviewedAgain.replayed||reviewed.actualInvoiceVerified||Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.cost_reconciliations')).rows[0].n)!==2)throw Error('Actual immutable cost review proof unavailable');

   try{await reserveWorkBackupCost(archiveDb,binding,'2'.repeat(64));}catch{replayDenied=true;}
   const second=await reserveWorkBackupCost(archiveDb,binding,'3'.repeat(64));await transitionWorkBackupCost(archiveDb,binding,second,'dispatched');await transitionWorkBackupCost(archiveDb,binding,second,'settled');
   try{await reserveWorkBackupCost(archiveDb,binding,'4'.repeat(64));}catch{capDenied=true;}
   const spent=Number((await archiveDb.query('SELECT sum(charged_micro_usd) AS n FROM turas_backup.cost_reservations')).rows[0].n);
   costAdmissionVerified=categoryDenied&&atomicRollback&&concurrentDenied&&unknownDenied&&replayDenied&&capDenied&&spent===2000;
   // This runner exercises a separate declared project; the prior cold-copy fixture remains intact.
   const resources={contract:'pilot-work-backup-config-v2',operatorProjectId:'prj_syntheticOperator',sourceProjectId:'prj_syntheticScheduledRunner',environmentId,installationId,storeId:'synthetic-owned-test-store',maximumArchiveBytes:104857600,maximumObjectBytes:25165824,maximumObjects:256};
   const runBinding={...binding,hostingBudgetId:randomUUID(),blobBudgetId:randomUUID(),scopeDigest:workBackupScopeDigest(resources)};
   const runAuthorization={...authorization,budgets:authorization.budgets.map(row=>({...row,id:row.category==='hosting'?runBinding.hostingBudgetId:runBinding.blobBudgetId,authorizationDigest:'9'.repeat(64),scopeDigest:runBinding.scopeDigest}))};
   await provisionWorkBackupCostAuthority(archiveDb,runAuthorization);
   const run=await runOwnedScheduledWorkBackup({configuration:{...resources,sourceConnection:connectionString,archiveConnection:archiveUrl.toString(),keyReference:'TURAS_RECOVERY_MASTER_1',keyVersion:'1',cost:runBinding},source:{sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:candidate.ledgerDigest},assetRoot:'/native-client',objects,key:{master,reference:'TURAS_RECOVERY_MASTER_1',version:'1'},signal:AbortSignal.timeout(60000)});
   if(run.state!=='captured')throw Error('Expected actual first scheduled capture');
   const backupObservation=(await writer.query('SELECT id,code_version,captured_at FROM operations_backup_observations WHERE id=$1',[run.archiveId])).rows;
   const afterRun=(await writer.query('SELECT mode,revision FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
   const runCosts=(await archiveDb.query('SELECT state,charged_micro_usd,upper_bound_micro_usd,charge_kind FROM turas_backup.cost_reservations WHERE budget_id=ANY($1::uuid[])',[runAuthorization.budgets.map(row=>row.id)])).rows;
   const retainedPrior=(await archiveDb.query('SELECT captured_at FROM turas_backup.capture_receipts WHERE archive_id=$1 AND source_project_id=$2',[scheduled.id,'prj_synthetic'])).rows;
   scheduledRunVerified=retainedPrior.length===1&&retainedPrior[0].captured_at.toISOString()===scheduled.capturedAt&&backupObservation.length===1&&backupObservation[0].code_version==='a'.repeat(40)&&backupObservation[0].captured_at.toISOString()===run.capturedAt&&run.coldDownloadAuthenticated&&run.temporaryBytesRemoved&&run.completeCostCeilingsRetained&&!run.scheduledInvocationVerified&&!run.restorationReady&&afterRun.mode==='open'&&Number(afterRun.revision)===openRevision&&runCosts.length===2&&runCosts.every(row=>row.state==='settled'&&row.charge_kind==='estimate'&&Number(row.charged_micro_usd)===Number(row.upper_bound_micro_usd));
   // A separately reviewed early invocation is conclusive not-due work, not an
   // uncertain capture. Keep both full estimates and never touch object IO.
   const earlyConfiguration={...resources,sourceConnection:connectionString,archiveConnection:archiveUrl.toString(),keyReference:'TURAS_RECOVERY_MASTER_1',keyVersion:'1',cost:runBinding};
   const earlyReview={currentScopeDigest:runBinding.scopeDigest,currentConfigurationDigest:recoveryDigest(earlyConfiguration),currentSourceCommit:'a'.repeat(40),currentSourceDigest:'b'.repeat(64),currentCatalogDigest:'c'.repeat(64),hostingBudgetId:runBinding.hostingBudgetId,blobBudgetId:runBinding.blobBudgetId,contract:'pilot-work-backup-reviewed-manual-v1',id:randomUUID(),installationId,sourceProjectId:resources.sourceProjectId,environmentId,previousScopeDigest:binding.scopeDigest,previousOperationDigest:review.operationDigest,previousReservationIds:reserved,previousOperatorReviewDigest:review.operatorReviewDigest,previousChargeEvidenceDigest:review.chargeEvidenceDigest,operatorReviewDigest:'7'.repeat(64),recordedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),maximumCaptureRequests:1,automaticRetry:false,scheduledSlotSucceeded:false};
   const beforeEarly={archives:Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.capture_receipts')).rows[0].n),health:Number((await writer.query('SELECT count(*) AS n FROM operations_backup_observations')).rows[0].n)};
   const noObjectIO=new Proxy(objects,{get(){throw Error('Not-due invocation must not access objects');}});
   const early=await runOwnedScheduledWorkBackup({configuration:earlyConfiguration,source:{sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:candidate.ledgerDigest},assetRoot:'/native-client',objects:noObjectIO,key:{master,reference:'TURAS_RECOVERY_MASTER_1',version:'1'},signal:AbortSignal.timeout(60000),manualReview:earlyReview});
   const afterEarlyCosts=(await archiveDb.query('SELECT state,charged_micro_usd,upper_bound_micro_usd,charge_kind FROM turas_backup.cost_reservations WHERE budget_id=ANY($1::uuid[])',[runAuthorization.budgets.map(row=>row.id)])).rows;
   notDueRunVerified=early.state==='not_due'&&early.capturePerformed===false&&Date.parse(early.nextEligibleAt)===Date.parse(run.capturedAt)+43200000&&afterEarlyCosts.length===4&&afterEarlyCosts.every(row=>row.state==='settled'&&row.charge_kind==='estimate'&&Number(row.charged_micro_usd)===Number(row.upper_bound_micro_usd))&&Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.capture_receipts')).rows[0].n)===beforeEarly.archives&&Number((await writer.query('SELECT count(*) AS n FROM operations_backup_observations')).rows[0].n)===beforeEarly.health;
   if(!notDueRunVerified)throw Error('Not-due full-estimate settlement or absence of capture proof differs');
   const manualResources={...resources,sourceProjectId:'prj_syntheticManualRunner'},manualBinding={...runBinding,hostingBudgetId:randomUUID(),blobBudgetId:randomUUID(),scopeDigest:workBackupScopeDigest(manualResources)},manualAuthorization={...authorization,budgets:authorization.budgets.map(row=>({...row,id:row.category==='hosting'?manualBinding.hostingBudgetId:manualBinding.blobBudgetId,authorizationDigest:'8'.repeat(64),scopeDigest:manualBinding.scopeDigest}))};await provisionWorkBackupCostAuthority(archiveDb,manualAuthorization);
   const manualConfiguration={...manualResources,sourceConnection:connectionString,archiveConnection:archiveUrl.toString(),keyReference:'TURAS_RECOVERY_MASTER_1',keyVersion:'1',cost:manualBinding};
   const manualReview={currentScopeDigest:manualBinding.scopeDigest,currentConfigurationDigest:recoveryDigest(manualConfiguration),currentSourceCommit:'a'.repeat(40),currentSourceDigest:'b'.repeat(64),currentCatalogDigest:'c'.repeat(64),hostingBudgetId:manualBinding.hostingBudgetId,blobBudgetId:manualBinding.blobBudgetId,contract:'pilot-work-backup-reviewed-manual-v1',id:randomUUID(),installationId,sourceProjectId:manualResources.sourceProjectId,environmentId,previousScopeDigest:binding.scopeDigest,previousOperationDigest:review.operationDigest,previousReservationIds:reserved,previousOperatorReviewDigest:review.operatorReviewDigest,previousChargeEvidenceDigest:review.chargeEvidenceDigest,operatorReviewDigest:'7'.repeat(64),recordedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),maximumCaptureRequests:1,automaticRetry:false,scheduledSlotSucceeded:false};
   const manualInput={configuration:manualConfiguration,source:{sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),ledgerDigest:candidate.ledgerDigest},assetRoot:'/native-client',objects,key:{master,reference:'TURAS_RECOVERY_MASTER_1',version:'1'},signal:AbortSignal.timeout(60000),manualReview};let manualTamperDenied=0;const manualChanges=[{currentScopeDigest:'e'.repeat(64)},{currentConfigurationDigest:'e'.repeat(64)},{currentSourceCommit:'e'.repeat(40)},{currentSourceDigest:'e'.repeat(64)},{currentCatalogDigest:'e'.repeat(64)},{hostingBudgetId:randomUUID()},{previousOperatorReviewDigest:'e'.repeat(64)},{expiresAt:new Date(Date.now()-1).toISOString()}];for(const change of manualChanges){try{await runOwnedScheduledWorkBackup({...manualInput,manualReview:{...manualReview,...change}});}catch{manualTamperDenied++;}}if(Number((await archiveDb.query('SELECT count(*) AS n FROM turas_backup.cost_reservations WHERE budget_id=ANY($1::uuid[])',[manualAuthorization.budgets.map(row=>row.id)])).rows[0].n)!==0)throw Error('Rejected manual review reserved new cost');const manualRun=await runOwnedScheduledWorkBackup(manualInput);if(manualRun.state!=='captured')throw Error('Expected actual manual capture');let manualReplayDenied=false;try{await runOwnedScheduledWorkBackup({...manualInput,manualReview:{...manualReview,expiresAt:new Date(Date.now()+700000).toISOString()}});}catch{manualReplayDenied=true;}
   const manualCosts=(await archiveDb.query('SELECT state,charged_micro_usd,upper_bound_micro_usd FROM turas_backup.cost_reservations WHERE budget_id=ANY($1::uuid[])',[manualAuthorization.budgets.map(row=>row.id)])).rows;manualRunVerified=manualTamperDenied===manualChanges.length&&manualReplayDenied&&manualRun.coldDownloadAuthenticated&&manualRun.originalScheduledSlotSucceeded===false&&manualRun.invocationKind==='reviewed-manual'&&manualRun.reviewedManualCaptureId===manualReview.id&&manualCosts.length===2&&manualCosts.every(row=>row.state==='settled'&&Number(row.charged_micro_usd)===Number(row.upper_bound_micro_usd));
  }finally{await archiveDb.end();}
 }finally{key.fill(0);master.fill(0);scheduledKey?.fill(0);}
 await writeFile('/output/result.json',JSON.stringify({dump,snapshotContentRestored,sourceContentRetained,cancellationDenied,cancelledOutputAbsent,matchedCaptureVerified,scheduledCaptureVerified,coldCopyVerified,costAdmissionVerified,coldReadVerified,costProvisionVerified,scheduledRunVerified,notDueRunVerified,manualRunVerified,hostedVerified:false}),{mode:0o600,flag:'wx'});
}finally{await db.end();await writer.end();}
