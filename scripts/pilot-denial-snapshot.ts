import {observeRecoveryConnection} from '../lib/server/operations/recovery-connection';
import {requireAuthenticatedRetainedDenials} from './pilot-denial-reader';
import {Client} from 'pg';
import {resolve,dirname,basename,join} from 'node:path';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding,createWorkRecoveryKey,readWorkRecoveryKey} from './pilot-database-safety-copy';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {captureRecoveryDenialSnapshot,verifyRecoveryDenialSnapshot} from '../lib/server/operations/recovery-denial-snapshot';
import {putNeonEncryptedArchive,downloadNeonEncryptedArchive,retainNeonAuthoritySnapshot,type NeonArchiveScope} from '../lib/server/operations/neon-archive';
import {encryptRecoveryFile,decryptRecoveryFile} from '../lib/server/operations/backup-crypto';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
const captureSources=new WeakMap<object,{sourceDigest:string;environmentId:string;snapshotDigest:string}>();
function sourceIdentity(source:{databaseUrl:string;projectId:string;target:string;environmentId:string;schemaVersion:number}){
 const url=new URL(source.databaseUrl);url.hostname=url.hostname.replace('-pooler.','.');
 return createHash('sha256').update(JSON.stringify({host:url.hostname,port:url.port||'5432',database:decodeURIComponent(url.pathname),projectId:source.projectId,target:source.target,environmentId:source.environmentId,schemaVersion:source.schemaVersion})).digest('hex');
}
export function requireOriginalWorkDenialSource(original:Parameters<typeof sourceIdentity>[0],restored:Parameters<typeof sourceIdentity>[0]){
 const a=new URL(original.databaseUrl),b=new URL(restored.databaseUrl);
 if(original.environmentId!==restored.environmentId||original.schemaVersion!==79||restored.schemaVersion!==79)throw Error('Exact original denial source environment and schema required');
 if(a.hostname.replace('-pooler.','.')===b.hostname.replace('-pooler.','.') && decodeURIComponent(a.pathname)===decodeURIComponent(b.pathname))throw Error('Original denial source must differ from restored target');
}
/** Only an actual in-process independently retained capture can bind refreshed
 * authority to the explicitly selected original source. JSON receipts cannot. */
export function requireOriginalWorkDenialCapture(receipt:object,original:Parameters<typeof sourceIdentity>[0],restored:Parameters<typeof sourceIdentity>[0],retained:import('./pilot-denial-reader').RetainedWorkDenials){
 requireAuthenticatedRetainedDenials(retained,original.environmentId);
 requireOriginalWorkDenialSource(original,restored);
 const actual=captureSources.get(receipt);
 if(!actual||actual.sourceDigest!==sourceIdentity(original)||actual.environmentId!==original.environmentId||actual.snapshotDigest!==retained.contextDigest||retained.snapshot.environmentId!==original.environmentId)throw Error('Genuine original-source current denial capture required');
}
/** Actual read-only minimized current-state capture into the separate work
 * archive. No database dump/customer payload retention or restored-target write.
 * This retains proof; reconciliation and any release decision remain separate. */
export async function pilotDenialSnapshot(args:string[],parentSignal?:AbortSignal){
 parentSignal?.throwIfAborted();
 if(args.length!==7||args[0]!=='--capture-work-denials'||args[1]!=='--source'||args[3]!=='--destination'||args[5]!=='--output'||args.slice(1).some((value,index)=>index%2===1&&(!value||value.startsWith('--'))))throw Error('Explicit current denial source destination and output required');
 const sourceFile=resolve(args[2]),destinationFile=resolve(args[4]),root=resolve(args[6]);
 const scope=databaseSafetyCaptureSourceSchema.parse(await readEvidence(dirname(sourceFile),basename(sourceFile))),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(destinationFile),basename(destinationFile)));
 if(scope.projectId!==destination.sourceProjectId||new URL(scope.databaseUrl).hostname===new URL(destination.databaseUrl).hostname)throw Error('Exact separate current denial snapshot scope required');
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(180000,async parent=>{
  const connectionLost=new AbortController(),signal=AbortSignal.any([parent,connectionLost.signal]);
  const staging=await mkdtemp(join(root,'private-staging-')),key=randomBytes(32);let coldKey:Buffer|undefined,stage='destination';
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal);stage='source_binding';const binding=await verifyDatabaseSafetySourceBinding(scope,destination.teamId,signal);
   const after=new Date().toISOString(),owner=new Client({connectionString:scope.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});observeRecoveryConnection(owner,connectionLost);let snapshot;
   try{await owner.connect();stage='source_capture';snapshot=await captureRecoveryDenialSnapshot(owner,scope.environmentId,signal);}finally{await owner.end();}
   if(snapshot.schemaVersion!==scope.schemaVersion)throw Error('Exact denial source schema differs');
   const bytes=Buffer.from(JSON.stringify(snapshot));if(bytes.length>8388608)throw Error('Minimized denial capture exceeds bound');
   stage='encryption';await writeFile(join(staging,'denials.json'),bytes,{flag:'wx',mode:0o600});const encrypted=await encryptRecoveryFile(join(staging,'denials.json'),join(staging,'denials.encrypted'),key,snapshot.snapshotDigest,signal);
   stage='independent_key';const reference=await createWorkRecoveryKey({projectId:destination.operatorProjectId,teamId:destination.teamId,id:snapshot.id,key,staging},signal);await writeEvidence(root,'key-reference.json',{contract:'pilot-work-key-reference-v1',id:snapshot.id,...reference,keyBytesIncluded:false});
   coldKey=await readWorkRecoveryKey(reference,destination.teamId,destination.operatorProjectId,signal);if(!coldKey.equals(key))throw Error('Separate denial snapshot key differs');
   const archive:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId:destination.installationId,id:snapshot.id,environmentId:scope.environmentId,capturedAt:snapshot.capturedAt,expiresAt:new Date(Date.parse(snapshot.capturedAt)+7*86400000).toISOString(),ciphertextDigest:encrypted.digest,headerDigest:snapshot.snapshotDigest,sizeBytes:encrypted.sizeBytes};
   stage='cloud_copy';const destinationOwner=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});observeRecoveryConnection(destinationOwner,connectionLost);
   try{await destinationOwner.connect();const contract=(await destinationOwner.query('SELECT maximum_bytes FROM turas_backup.contract WHERE installation_id=$1',[destination.installationId])).rows;if(contract.length!==1||Number(contract[0].maximum_bytes)!==destination.maximumBytes)throw Error('Exact current archive capacity required');await putNeonEncryptedArchive(destinationOwner,archive,join(staging,'denials.encrypted'),signal);}finally{await destinationOwner.end();}
   stage='cold_verification';const cold=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});observeRecoveryConnection(cold,connectionLost);try{await cold.connect();await downloadNeonEncryptedArchive(cold,archive,join(staging,'cold.encrypted'),signal);}finally{await cold.end();}
   await decryptRecoveryFile(join(staging,'cold.encrypted'),join(staging,'cold.json'),coldKey,snapshot.snapshotDigest,signal);
   const coldBytes=await readFile(join(staging,'cold.json'));if(!coldBytes.equals(bytes))throw Error('Cold minimized denial bytes differ');const verified=verifyRecoveryDenialSnapshot(JSON.parse(coldBytes.toString()),{environmentId:scope.environmentId,contextDigest:archive.headerDigest,after,now:Date.now()});
   stage='independent_retention';const retain=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});observeRecoveryConnection(retain,connectionLost);let retained;try{await retain.connect();retained=await retainNeonAuthoritySnapshot(retain,archive,archive.headerDigest,signal);}finally{await retain.end();}
   stage='final_binding';signal.throwIfAborted();if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Denial snapshot source destination or protected checkout changed');
   const receipt={contract:'pilot-work-denial-snapshot-v1',id,...source,cloud,archive,keyReference:reference,snapshotId:snapshot.id,snapshotDigest:snapshot.snapshotDigest,capturedAt:snapshot.capturedAt,recordedAt:new Date().toISOString(),sourceEnvironmentId:scope.environmentId,sourceSchema:scope.schemaVersion,sourceConnectionBinding:scope.connectionBinding,...binding,minimizedBytes:bytes.length,tableCount:verified.tableCount,coldDecryptionVerified:true,independentRetentionVerified:retained.independentRetentionVerified,primaryDatabaseChanged:false,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false};
   await writeEvidence(root,'snapshot.json',receipt);console.info(JSON.stringify({independentRetentionVerified:true,coldDecryptionVerified:true,minimizedBytes:bytes.length,tableCount:verified.tableCount,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false}));Object.freeze(receipt);signal.throwIfAborted();captureSources.set(receipt,{sourceDigest:sourceIdentity(scope),environmentId:scope.environmentId,snapshotDigest:snapshot.snapshotDigest});return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',stage,safeFailure:'incomplete_work_denial_snapshot',primaryDatabaseChanged:false,restorationReady:false});throw error;}
  finally{key.fill(0);coldKey?.fill(0);await rm(staging,{recursive:true,force:true});}
 },parentSignal);
}
