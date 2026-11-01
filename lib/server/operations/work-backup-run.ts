import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {reviewedManualBackupOperation} from './work-backup-manual';
import {recordWorkBackupFailure,type WorkBackupStage} from './work-backup-diagnostics';
import {WORK_BACKUP_LIMITS,workBackupListLimit,type WorkBackupConfigurationVersion} from './work-backup-limits';
import {Client} from 'pg';
import {recordVerifiedBackup} from './backup-health';
import {z} from 'zod';
import {randomUUID,hkdfSync} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {captureWorkRecoveryCandidate} from './capture-work-candidate';
import {copyWorkCapture} from './work-capture-copy';
import {expireNeonManagedArchives} from './neon-archive';
import {workBackupCostBindingSchema,reserveWorkBackupCost,transitionWorkBackupCost} from './work-backup-cost';
import {verifyWorkBackupPricing,workBackupPricingDigest,workBackupCostCeilings} from './work-backup-pricing';
import {BoundedWorkBackupObjects} from './work-backup-objects';
import {BlobPrivateObjects} from '../storage/blob-objects';
import type {PrivateObjects} from '../storage/private-objects';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
const digest=z.string().regex(/^[a-f0-9]{64}$/),identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),project=z.string().regex(/^prj_[A-Za-z0-9]+$/);
const connection=z.string().max(4096).refine(raw=>{try{const url=new URL(raw);return ['postgres:','postgresql:'].includes(url.protocol)&&url.hostname.endsWith('.neon.tech')&&!url.hostname.includes('-pooler.')&&url.searchParams.get('sslmode')==='verify-full';}catch{return false;}},'Explicit unpooled verified Neon connection required');
export const workBackupConfigurationSchema=z.strictObject({contract:z.enum(['pilot-work-backup-config-v1','pilot-work-backup-config-v2']),operatorProjectId:project,sourceProjectId:project,environmentId:identity,installationId:z.uuid(),storeId:z.string().regex(/^[A-Za-z0-9-]{1,128}$/),sourceConnection:connection,archiveConnection:connection,maximumArchiveBytes:z.number().int().min(1048576).max(WORK_BACKUP_LIMITS.maximumRetainedBytes),maximumObjectBytes:z.number().int().min(0).max(WORK_BACKUP_LIMITS.objectBytes),maximumObjects:z.number().int().min(1).max(256),keyReference:identity,keyVersion:identity,cost:workBackupCostBindingSchema}).superRefine((value,ctx)=>{
 if(value.contract==='pilot-work-backup-config-v1'&&(value.maximumObjectBytes>WORK_BACKUP_LIMITS.legacyObjectBytes||value.maximumArchiveBytes>WORK_BACKUP_LIMITS.legacyRetainedBytes))ctx.addIssue({code:'custom',message:'Expanded work objects require explicit v2 configuration'});
 if(value.operatorProjectId===value.sourceProjectId||new URL(value.sourceConnection).hostname===new URL(value.archiveConnection).hostname||value.cost.installationId!==value.installationId||value.cost.environmentId!==value.environmentId)ctx.addIssue({code:'custom',message:'Independent exact work backup scope required'});
 if(value.cost.scopeDigest!==workBackupScopeDigest(value))ctx.addIssue({code:'custom',message:'Backup budget resource bounds differ'});
 const prices=workBackupCostCeilings(value.maximumObjectBytes,value.contract);if(value.cost.pricingDigest!==workBackupPricingDigest()||value.cost.hostingCeilingMicroUsd<prices.hostingMinimumMicroUsd||value.cost.blobCeilingMicroUsd<prices.blobMinimumMicroUsd)ctx.addIssue({code:'custom',message:'Published on-demand work ceilings required'});
});
export function workBackupScopeDigest(value:{contract?:string;operatorProjectId:string;sourceProjectId:string;environmentId:string;installationId:string;storeId:string;maximumArchiveBytes:number;maximumObjectBytes:number;maximumObjects:number}){
 return recoveryDigest({contract:value.contract==='pilot-work-backup-config-v2'?'pilot-work-backup-scope-v2':'pilot-work-backup-scope-v1',...(value.contract==='pilot-work-backup-config-v2'?{maximumEncryptedArchiveBytes:WORK_BACKUP_LIMITS.encryptedArchiveBytes}:{}),operatorProjectId:value.operatorProjectId,sourceProjectId:value.sourceProjectId,environmentId:value.environmentId,installationId:value.installationId,storeId:value.storeId,maximumArchiveBytes:value.maximumArchiveBytes,maximumObjectBytes:value.maximumObjectBytes,maximumObjects:value.maximumObjects,intervalHours:12,maximumSeconds:280,platformDeadlineSeconds:300,maximumMemoryMiB:4096,maximumCpu:2,blobRetries:0,maximumBlobListRequests:workBackupListLimit(value.contract==='pilot-work-backup-config-v2'?'pilot-work-backup-config-v2':'pilot-work-backup-config-v1'),maximumBlobReadRequests:1280,maximumReadsPerObject:5,concurrentJobs:1});
}
export const workBackupBuildSourceSchema=z.strictObject({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,ledgerDigest:digest});

/** Receipt rows are read only after archive-owner admission. Use the source
 * database clock, never the operator clock or a nominal cron slot. */
export function planWorkBackupCadence(receipts:unknown,scope:{installationId:string;sourceProjectId:string;environmentId:string},sourceNow:Date){
 const now=z.date().parse(sourceNow).getTime();
 const rows=z.array(z.strictObject({archive_id:z.uuid(),installation_id:z.uuid(),source_project_id:project,environment_id:identity,source_commit:z.string().regex(/^[a-f0-9]{40}$/),source_digest:digest,catalog_digest:digest,candidate_digest:digest,captured_at:z.date(),archive_captured_at:z.date(),archive_environment_id:identity})).max(1).parse(receipts);
 if(!rows.length)return {waitMilliseconds:0,notBeforeCapturedAt:undefined};
 const prior=rows[0],captured=prior.captured_at.getTime();
 if(prior.installation_id!==scope.installationId||prior.source_project_id!==scope.sourceProjectId||prior.environment_id!==scope.environmentId||prior.archive_environment_id!==scope.environmentId||prior.archive_captured_at.getTime()!==captured||captured>now)throw Error('Authenticated prior backup time differs');
 const notBefore=captured+43200000,waitMilliseconds=Math.max(0,notBefore-now);
 return {waitMilliseconds,notBeforeCapturedAt:new Date(notBefore).toISOString()};
}
/** One wait within the caller's existing deadline. No retry, SQL transaction,
 * source IO fence, or recovery lease is held during this delay. */
export async function waitForWorkBackupCadence(milliseconds:number,signal:AbortSignal){
 if(!Number.isSafeInteger(milliseconds)||milliseconds<0||milliseconds>60000)throw Error('Bounded scheduled backup wait required');
 signal.throwIfAborted();if(!milliseconds)return;
 await new Promise<void>((resolve,reject)=>{
  const aborted=()=>{clearTimeout(timer);signal.removeEventListener('abort',aborted);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},milliseconds);
  signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
 });
 signal.throwIfAborted();
}

/** Deterministic backup handler: no model, mail, customer-supplied operation or
 * source runtime credentials enter a processing job. No automatic retry.
 * Placement and actual cron invocation are separately collected platform proofs. */
export async function runScheduledWorkBackup(input:{configuration:unknown;source:unknown;assetRoot:string;signal:AbortSignal;objects:PrivateObjects;key:{master:Uint8Array;reference:string;version:string}}){
 const config=workBackupConfigurationSchema.parse(input.configuration);
 if(process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Bounded operator Blob retry policy required');
 return runWorkBackup(input,config,true);
}
/** Protected operator review is separate from scheduled admission and cannot
 * mark the failed slot successful or bypass the successful-capture cadence. */
export async function runReviewedWorkBackup(input:Parameters<typeof runScheduledWorkBackup>[0]&{manualReview:unknown}){
 const config=workBackupConfigurationSchema.parse(input.configuration);
 if(config.contract!=='pilot-work-backup-config-v2'||process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Explicit v2 manual operator scope required');
 return runWorkBackup(input,config,true,input.manualReview);
}
/** Actual local runner proof only. Hosted handlers never route here. Requires
 * owning-runner identity, an exact loopback source and a separate test database;
 * it cannot accept remote connections or run within a Vercel deployment. */
export async function runOwnedScheduledWorkBackup(input:Parameters<typeof runScheduledWorkBackup>[0]&{manualReview?:unknown}){
 if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV!=='test')throw Error('Disposable local work backup runner required');
 const sourceConnection=requireOwnedPilotDatabase(process.env,true),local=z.string().refine(raw=>{try{const url=new URL(raw);return ['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&!url.search;}catch{return false;}});
 const config=z.strictObject({...workBackupConfigurationSchema.shape,sourceConnection:local,archiveConnection:local}).parse(input.configuration),sourceUrl=new URL(sourceConnection),archiveUrl=new URL(config.archiveConnection);
 if(config.sourceConnection!==sourceConnection||config.environmentId!==process.env.TURAS_ENVIRONMENT_ID||archiveUrl.port!==sourceUrl.port||archiveUrl.username!==sourceUrl.username||archiveUrl.password!==sourceUrl.password||archiveUrl.pathname!=='/native_archive'||config.operatorProjectId===config.sourceProjectId||config.cost.installationId!==config.installationId||config.cost.environmentId!==config.environmentId||config.cost.scopeDigest!==workBackupScopeDigest(config))throw Error('Exact owned work backup fixture scope required');
 if(input.manualReview!==undefined&&config.contract!=='pilot-work-backup-config-v2')throw Error('Explicit v2 owned manual scope required');
 return runWorkBackup(input,config,false,input.manualReview);
}
async function runWorkBackup(input:Parameters<typeof runScheduledWorkBackup>[0],config:z.infer<typeof workBackupConfigurationSchema>,verifyPrices=false,manualReview?:unknown){
 let reviewedManualCaptureId:string|undefined;const source=workBackupBuildSourceSchema.parse(input.source),slot=new Date(Math.floor(Date.now()/43200000)*43200000).toISOString();
 input.signal.throwIfAborted();
 if(input.key.master.byteLength!==32||input.key.reference!==config.keyReference||input.key.version!==config.keyVersion)throw Error('Exact separate operator master key required');
 const archiveOptions={connectionString:config.archiveConnection,connectionTimeoutMillis:5000,statement_timeout:10000};let archive=new Client(archiveOptions);
 let stage:WorkBackupStage='archive-admission';let archiveConnected=false,reservations:string[]|undefined,dispatched=false,root:string|undefined,key:Buffer|undefined,pricing:Awaited<ReturnType<typeof verifyWorkBackupPricing>>|undefined;
 try{
  await archive.connect();archiveConnected=true;
  const manual=manualReview===undefined?undefined:await reviewedManualBackupOperation(archive,manualReview,{...config,...source,scopeDigest:config.cost.scopeDigest,configurationDigest:recoveryDigest(config),hostingBudgetId:config.cost.hostingBudgetId,blobBudgetId:config.cost.blobBudgetId});
  reviewedManualCaptureId=manual?.review.id;
  reservations=await reserveWorkBackupCost(archive,config.cost,manual?.operationDigest??recoveryDigest({contract:'pilot-work-backup-slot-v1',installationId:config.installationId,environmentId:config.environmentId,slot}));
  if(verifyPrices){
   // The hosted Function is already consuming its reserved hosting allowance.
   // A missing/changed pricing response cannot release that charge as unused.
   await transitionWorkBackupCost(archive,config.cost,reservations,'dispatched');dispatched=true;
   stage='pricing';pricing=await verifyWorkBackupPricing({...config.cost,maximumObjectBytes:config.maximumObjectBytes,configurationVersion:config.contract},input.signal);
  }
  stage='source-admission';
  // Source admission is read-only and precedes the actual bounded operation.
  if((await archive.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.capture_receipts'::regclass")).rows[0]?.owner!==true)throw Error('Explicit work capture receipt owner required');
  const receipts=(await archive.query('SELECT r.archive_id,r.installation_id,r.source_project_id,r.environment_id,r.source_commit,r.source_digest,r.catalog_digest,r.candidate_digest,r.captured_at,a.captured_at AS archive_captured_at,a.environment_id AS archive_environment_id FROM turas_backup.capture_receipts r JOIN turas_backup.archives a ON a.id=r.archive_id WHERE r.installation_id=$1 AND r.source_project_id=$2 AND r.environment_id=$3 ORDER BY r.captured_at DESC,r.archive_id DESC LIMIT 1',[config.installationId,config.sourceProjectId,config.environmentId])).rows;
  const primary=new Client({connectionString:config.sourceConnection,connectionTimeoutMillis:5000,statement_timeout:5000});let revision:number,cadence:ReturnType<typeof planWorkBackupCadence>;
  try{await primary.connect();const rows=(await primary.query("SELECT c.mode,c.revision,e.environment_id,e.schema_version,clock_timestamp() AS source_now,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner FROM operations_control c JOIN turas_environment e ON e.environment_id=c.environment_id WHERE c.environment_id=$1",[config.environmentId])).rows;
   if(rows.length!==1||rows[0].mode!=='open'||rows[0].environment_id!==config.environmentId||rows[0].owner!==true||Number(rows[0].schema_version)!==CURRENT_SCHEMA_VERSION)throw Error('Current open work backup source required');revision=Number(rows[0].revision);
   cadence=planWorkBackupCadence(receipts,config,rows[0].source_now);
  }finally{await primary.end();}
  stage='cadence';
  if(cadence.waitMilliseconds>60000){
   // This invocation ended conclusively without a capture. Retain both complete
   // admitted ceilings as estimates; a not-due cron is neither a refund nor an
   // unknown provider outcome, and it creates no backup/health observation.
   if(!dispatched){await transitionWorkBackupCost(archive,config.cost,reservations,'dispatched');dispatched=true;}
   await transitionWorkBackupCost(archive,config.cost,reservations,'settled');
   return {contract:'pilot-work-backup-not-due-v1' as const,state:'not_due' as const,slot,...source,nextEligibleAt:cadence.notBeforeCapturedAt!,capturePerformed:false as const,completeCostCeilingsRetained:true,actualInvoiceVerified:false};
  }
  if(cadence.waitMilliseconds){archiveConnected=false;await archive.end();await waitForWorkBackupCadence(cadence.waitMilliseconds,input.signal);archive=new Client(archiveOptions);await archive.connect();archiveConnected=true;}
  if(!dispatched){await transitionWorkBackupCost(archive,config.cost,reservations,'dispatched');dispatched=true;}
  const id=randomUUID();key=deriveWorkBackupKey(input.key.master,{installationId:config.installationId,environmentId:config.environmentId,archiveId:id});
  const retained={reference:config.keyReference+':'+id,version:config.keyVersion};
  root=await mkdtemp(join(await realpath(tmpdir()),'turas-work-backup-'));for(const name of ['capture','cold','keys'])await mkdir(join(root,name),{mode:0o700});
  const keyFile=join(root,'keys','separate.key');await writeFile(keyFile,key,{mode:0o600,flag:'wx'});
  stage='archive-expiry';await expireNeonManagedArchives(archive,config.installationId,input.signal);
  stage='capture';const candidate=await captureWorkRecoveryCandidate({scope:{...source,environmentId:config.environmentId,recoveryId:id,controlRevision:revision,purpose:'scheduled-backup',sourceProjectId:config.sourceProjectId,storeId:config.storeId,keyReference:retained.reference,keyVersion:retained.version},connectionString:config.sourceConnection,assetRoot:input.assetRoot,output:join(root,'capture'),objects:input.objects,key,signal:input.signal,maximumObjects:config.maximumObjects,maximumObjectBytes:config.maximumObjectBytes,maximumEncryptedArchiveBytes:config.contract==='pilot-work-backup-config-v2'?WORK_BACKUP_LIMITS.encryptedArchiveBytes:67108864,archiveId:id,scheduledNotBeforeCapturedAt:cadence.notBeforeCapturedAt});
  stage='cold-copy';const copy=await copyWorkCapture({candidate,sourceProjectId:config.sourceProjectId,installationId:config.installationId,connectionString:config.archiveConnection,maximumBytes:config.maximumArchiveBytes,bundle:join(root,'capture','candidate.encrypted'),keyFile,coldOutput:join(root,'cold'),consumeOwnedBundle:config.contract==='pilot-work-backup-config-v2',signal:input.signal});
  input.signal.throwIfAborted();await rm(root,{recursive:true,force:true});root=undefined;
  stage='settlement';await transitionWorkBackupCost(archive,config.cost,reservations,'settled');
  if(!copy.coldDownloadAuthenticated||!copy.captureProvenanceVerified||!copy.immutableReceiptRecorded)throw Error('Complete cold backup verification required');
  stage='health';const observation=new Client({connectionString:config.sourceConnection,connectionTimeoutMillis:5000,statement_timeout:5000});
  try{await observation.connect();await recordVerifiedBackup(observation,{archiveId:candidate.id,environmentId:config.environmentId,storeId:config.storeId,sourceCommit:source.sourceCommit,capturedAt:candidate.capturedAt,encryptedDigest:copy.encryptedDigest,candidateDigest:recoveryDigest(candidate),reservationIds:reservations});}finally{await observation.end();}
  return {...(pricing?{pricing}:{}),contract:'pilot-work-backup-run-v1' as const,state:'captured' as const,...(reviewedManualCaptureId?{invocationKind:'reviewed-manual' as const,reviewedManualCaptureId,originalScheduledSlotSucceeded:false}:{}),archiveId:candidate.id,capturedAt:candidate.capturedAt,slot,...source,coldDownloadAuthenticated:copy.coldDownloadAuthenticated,completeCostCeilingsRetained:true,actualInvoiceVerified:false,temporaryBytesRemoved:true,independentPlacementVerified:false,separateKeyRetentionVerified:false,currentAuthorityVerified:false,scheduledInvocationVerified:false,restorationReady:false};
 }catch(error){
  recordWorkBackupFailure(error,stage);
  // A disconnected wait failure retains the issued reservation for explicit review.
  if(reservations&&archiveConnected)await transitionWorkBackupCost(archive,config.cost,reservations,dispatched?'unknown':'released').catch(()=>{});
  throw error;
 }finally{key?.fill(0);try{if(root)await rm(root,{recursive:true,force:true});}finally{await archive.end();}}
}

export function workBackupPrivateObjects(environmentId:string,storeId:string,maximumObjects=256,maximumBytes=25165824,configurationVersion:WorkBackupConfigurationVersion='pilot-work-backup-config-v1'){
 return new BoundedWorkBackupObjects(new BlobPrivateObjects(environmentId,{storeId},10485760),environmentId,maximumObjects,maximumBytes,configurationVersion);
}
export function deriveWorkBackupKey(master:Uint8Array,input:{installationId:string;environmentId:string;archiveId:string}){
 if(master.byteLength!==32)throw Error('Work backup master key required');z.uuid().parse(input.installationId);identity.parse(input.environmentId);z.uuid().parse(input.archiveId);
 return Buffer.from(hkdfSync('sha256',master,Buffer.from(input.installationId),Buffer.from('turas-016-work-backup-key-v1:'+input.environmentId+':'+input.archiveId),32));
}
