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
export const workBackupConfigurationSchema=z.strictObject({contract:z.literal('pilot-work-backup-config-v1'),operatorProjectId:project,sourceProjectId:project,environmentId:identity,installationId:z.uuid(),storeId:z.string().regex(/^[A-Za-z0-9-]{1,128}$/),sourceConnection:connection,archiveConnection:connection,maximumArchiveBytes:z.number().int().min(1048576).max(419430400),maximumObjectBytes:z.number().int().min(0).max(25165824),maximumObjects:z.number().int().min(1).max(256),keyReference:identity,keyVersion:identity,cost:workBackupCostBindingSchema}).superRefine((value,ctx)=>{
 if(value.operatorProjectId===value.sourceProjectId||new URL(value.sourceConnection).hostname===new URL(value.archiveConnection).hostname||value.cost.installationId!==value.installationId||value.cost.environmentId!==value.environmentId)ctx.addIssue({code:'custom',message:'Independent exact work backup scope required'});
 if(value.cost.scopeDigest!==workBackupScopeDigest(value))ctx.addIssue({code:'custom',message:'Backup budget resource bounds differ'});
 const prices=workBackupCostCeilings(value.maximumObjectBytes);if(value.cost.pricingDigest!==workBackupPricingDigest()||value.cost.hostingCeilingMicroUsd<prices.hostingMinimumMicroUsd||value.cost.blobCeilingMicroUsd<prices.blobMinimumMicroUsd)ctx.addIssue({code:'custom',message:'Published on-demand work ceilings required'});
});
export function workBackupScopeDigest(value:{operatorProjectId:string;sourceProjectId:string;environmentId:string;installationId:string;storeId:string;maximumArchiveBytes:number;maximumObjectBytes:number;maximumObjects:number}){
 return recoveryDigest({contract:'pilot-work-backup-scope-v1',operatorProjectId:value.operatorProjectId,sourceProjectId:value.sourceProjectId,environmentId:value.environmentId,installationId:value.installationId,storeId:value.storeId,maximumArchiveBytes:value.maximumArchiveBytes,maximumObjectBytes:value.maximumObjectBytes,maximumObjects:value.maximumObjects,intervalHours:12,maximumSeconds:280,platformDeadlineSeconds:300,maximumMemoryMiB:4096,maximumCpu:2,blobRetries:0,maximumBlobListRequests:32,maximumBlobReadRequests:1280,maximumReadsPerObject:5,concurrentJobs:1});
}
export const workBackupBuildSourceSchema=z.strictObject({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,ledgerDigest:digest});

/** Deterministic backup handler: no model, mail, customer-supplied operation or
 * source runtime credentials enter a processing job. No automatic retry.
 * Placement and actual cron invocation are separately collected platform proofs. */
export async function runScheduledWorkBackup(input:{configuration:unknown;source:unknown;assetRoot:string;signal:AbortSignal;objects:PrivateObjects;key:{master:Uint8Array;reference:string;version:string}}){
 const config=workBackupConfigurationSchema.parse(input.configuration);
 if(process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Bounded operator Blob retry policy required');
 return runWorkBackup(input,config,true);
}
/** Actual local runner proof only. Hosted handlers never route here. Requires
 * owning-runner identity, an exact loopback source and a separate test database;
 * it cannot accept remote connections or run within a Vercel deployment. */
export async function runOwnedScheduledWorkBackup(input:Parameters<typeof runScheduledWorkBackup>[0]){
 if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV!=='test')throw Error('Disposable local work backup runner required');
 const sourceConnection=requireOwnedPilotDatabase(process.env,true),local=z.string().refine(raw=>{try{const url=new URL(raw);return ['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&!url.search;}catch{return false;}});
 const config=z.strictObject({...workBackupConfigurationSchema.shape,sourceConnection:local,archiveConnection:local}).parse(input.configuration),sourceUrl=new URL(sourceConnection),archiveUrl=new URL(config.archiveConnection);
 if(config.sourceConnection!==sourceConnection||config.environmentId!==process.env.TURAS_ENVIRONMENT_ID||archiveUrl.port!==sourceUrl.port||archiveUrl.username!==sourceUrl.username||archiveUrl.password!==sourceUrl.password||archiveUrl.pathname!=='/native_archive'||config.operatorProjectId===config.sourceProjectId||config.cost.installationId!==config.installationId||config.cost.environmentId!==config.environmentId||config.cost.scopeDigest!==workBackupScopeDigest(config))throw Error('Exact owned work backup fixture scope required');
 return runWorkBackup(input,config);
}
async function runWorkBackup(input:Parameters<typeof runScheduledWorkBackup>[0],config:z.infer<typeof workBackupConfigurationSchema>,verifyPrices=false){
 const source=workBackupBuildSourceSchema.parse(input.source),slot=new Date(Math.floor(Date.now()/43200000)*43200000).toISOString();
 input.signal.throwIfAborted();
 if(input.key.master.byteLength!==32||input.key.reference!==config.keyReference||input.key.version!==config.keyVersion)throw Error('Exact separate operator master key required');
 const archive=new Client({connectionString:config.archiveConnection,connectionTimeoutMillis:5000,statement_timeout:10000});
 let reservations:string[]|undefined,dispatched=false,root:string|undefined,key:Buffer|undefined,pricing:Awaited<ReturnType<typeof verifyWorkBackupPricing>>|undefined;
 try{
  await archive.connect();
  reservations=await reserveWorkBackupCost(archive,config.cost,recoveryDigest({contract:'pilot-work-backup-slot-v1',installationId:config.installationId,environmentId:config.environmentId,slot}));
  if(verifyPrices){
   // The hosted Function is already consuming its reserved hosting allowance.
   // A missing/changed pricing response cannot release that charge as unused.
   await transitionWorkBackupCost(archive,config.cost,reservations,'dispatched');dispatched=true;
   pricing=await verifyWorkBackupPricing({...config.cost,maximumObjectBytes:config.maximumObjectBytes},input.signal);
  }
  // Source admission is read-only and precedes the actual bounded operation.
  const primary=new Client({connectionString:config.sourceConnection,connectionTimeoutMillis:5000,statement_timeout:5000});let revision:number;
  try{await primary.connect();const rows=(await primary.query('SELECT c.mode,c.revision,e.schema_version FROM operations_control c JOIN turas_environment e ON e.environment_id=c.environment_id WHERE c.environment_id=$1',[config.environmentId])).rows;
   if(rows.length!==1||rows[0].mode!=='open'||Number(rows[0].schema_version)!==57)throw Error('Current open work backup source required');revision=Number(rows[0].revision);
  }finally{await primary.end();}
  if(!dispatched){await transitionWorkBackupCost(archive,config.cost,reservations,'dispatched');dispatched=true;}
  const id=randomUUID();key=deriveWorkBackupKey(input.key.master,{installationId:config.installationId,environmentId:config.environmentId,archiveId:id});
  const retained={reference:config.keyReference+':'+id,version:config.keyVersion};
  root=await mkdtemp(join(await realpath(tmpdir()),'turas-work-backup-'));for(const name of ['capture','cold','keys'])await mkdir(join(root,name),{mode:0o700});
  const keyFile=join(root,'keys','separate.key');await writeFile(keyFile,key,{mode:0o600,flag:'wx'});
  await expireNeonManagedArchives(archive,config.installationId,input.signal);
  const candidate=await captureWorkRecoveryCandidate({scope:{...source,environmentId:config.environmentId,recoveryId:id,controlRevision:revision,purpose:'scheduled-backup',sourceProjectId:config.sourceProjectId,storeId:config.storeId,keyReference:retained.reference,keyVersion:retained.version},connectionString:config.sourceConnection,assetRoot:input.assetRoot,output:join(root,'capture'),objects:input.objects,key,signal:input.signal,maximumObjects:config.maximumObjects,maximumObjectBytes:config.maximumObjectBytes,archiveId:id});
  const copy=await copyWorkCapture({candidate,sourceProjectId:config.sourceProjectId,installationId:config.installationId,connectionString:config.archiveConnection,maximumBytes:config.maximumArchiveBytes,bundle:join(root,'capture','candidate.encrypted'),keyFile,coldOutput:join(root,'cold'),signal:input.signal});
  input.signal.throwIfAborted();await rm(root,{recursive:true,force:true});root=undefined;
  await transitionWorkBackupCost(archive,config.cost,reservations,'settled');
  if(!copy.coldDownloadAuthenticated||!copy.captureProvenanceVerified||!copy.immutableReceiptRecorded)throw Error('Complete cold backup verification required');
  const observation=new Client({connectionString:config.sourceConnection,connectionTimeoutMillis:5000,statement_timeout:5000});
  try{await observation.connect();await recordVerifiedBackup(observation,{archiveId:candidate.id,environmentId:config.environmentId,storeId:config.storeId,sourceCommit:source.sourceCommit,capturedAt:candidate.capturedAt,encryptedDigest:copy.encryptedDigest,candidateDigest:recoveryDigest(candidate),reservationIds:reservations});}finally{await observation.end();}
  return {...(pricing?{pricing}:{}),contract:'pilot-work-backup-run-v1' as const,archiveId:candidate.id,capturedAt:candidate.capturedAt,slot,...source,coldDownloadAuthenticated:copy.coldDownloadAuthenticated,completeCostCeilingsRetained:true,actualInvoiceVerified:false,temporaryBytesRemoved:true,independentPlacementVerified:false,separateKeyRetentionVerified:false,currentAuthorityVerified:false,scheduledInvocationVerified:false,restorationReady:false};
 }catch(error){
  if(reservations)await transitionWorkBackupCost(archive,config.cost,reservations,dispatched?'unknown':'released').catch(()=>{});
  throw error;
 }finally{key?.fill(0);try{if(root)await rm(root,{recursive:true,force:true});}finally{await archive.end();}}
}

export function workBackupPrivateObjects(environmentId:string,storeId:string,maximumObjects=256,maximumBytes=25165824){
 return new BoundedWorkBackupObjects(new BlobPrivateObjects(environmentId,{storeId},10485760),environmentId,maximumObjects,maximumBytes);
}
export function deriveWorkBackupKey(master:Uint8Array,input:{installationId:string;environmentId:string;archiveId:string}){
 if(master.byteLength!==32)throw Error('Work backup master key required');z.uuid().parse(input.installationId);identity.parse(input.environmentId);z.uuid().parse(input.archiveId);
 return Buffer.from(hkdfSync('sha256',master,Buffer.from(input.installationId),Buffer.from('turas-016-work-backup-key-v1:'+input.environmentId+':'+input.archiveId),32));
}
