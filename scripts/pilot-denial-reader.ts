import {Client} from 'pg';
import {resolve,dirname,basename,join} from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {z} from 'zod';
import {readEvidence} from './pilot-evidence';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {workRecoveryKeyReferenceSchema,readWorkRecoveryKey} from './pilot-database-safety-copy';
import {neonArchiveScopeSchema,downloadNeonEncryptedArchive} from '../lib/server/operations/neon-archive';
import {decryptRecoveryFile} from '../lib/server/operations/backup-crypto';
import {verifyRecoveryDenialSnapshot,recoveryDenialSnapshotSchema} from '../lib/server/operations/recovery-denial-snapshot';
const receiptSchema=z.strictObject({contract:z.literal('pilot-work-denial-snapshot-v1'),archive:neonArchiveScopeSchema,keyReference:workRecoveryKeyReferenceSchema,snapshotId:z.uuid(),snapshotDigest:z.string().regex(/^[a-f0-9]{64}$/),capturedAt:z.iso.datetime({offset:true}),sourceEnvironmentId:z.string().min(1).max(256),sourceSchema:z.union([z.literal(55),z.literal(57)]),minimizedBytes:z.number().int().positive().max(8388608)});
/** Actual fresh encrypted independent proof, never a snapshot-side healthy label.
 * Caller owns/removes the new private staging directory on every exit. */
export async function readRetainedWorkDenialSnapshot(input:{receipt:string;destination:string;staging:string;environmentId:string;after:string},signal:AbortSignal){
 const file=resolve(input.receipt),config=resolve(input.destination),raw=await readEvidence(dirname(file),basename(file)) as Record<string,unknown>;
 const receipt=receiptSchema.parse(Object.fromEntries(Object.keys(receiptSchema.shape).map(key=>[key,raw[key]]))),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(config),basename(config)));
 if(receipt.archive.id!==receipt.snapshotId||receipt.archive.headerDigest!==receipt.snapshotDigest||receipt.archive.capturedAt!==receipt.capturedAt||receipt.archive.environmentId!==input.environmentId||receipt.sourceEnvironmentId!==input.environmentId||receipt.archive.installationId!==destination.installationId||receipt.archive.sizeBytes!==receipt.minimizedBytes+68||receipt.keyReference.projectId!==destination.operatorProjectId||receipt.keyReference.name!=='TURAS_RECOVERY_KEY_'+receipt.snapshotId.replaceAll('-','').toUpperCase())throw Error('Exact independently retained denial snapshot required');
 const cloud=await verifyWorkNeonDestination(destination,signal),key=await readWorkRecoveryKey(receipt.keyReference,destination.teamId,destination.operatorProjectId,signal);
 try{
  const cold=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
  try{await cold.connect();const hold=(await cold.query('SELECT kind,context_digest FROM turas_backup.authority_holds WHERE archive_id=$1',[receipt.archive.id])).rows;if(hold.length!==1||hold[0].kind!=='denial-replay-snapshot'||hold[0].context_digest!==receipt.archive.headerDigest)throw Error('Actual independent denial retention unavailable');await downloadNeonEncryptedArchive(cold,receipt.archive,join(input.staging,'current-denials.encrypted'),signal);}finally{await cold.end();}
  const output=join(input.staging,'current-denials.json');await decryptRecoveryFile(join(input.staging,'current-denials.encrypted'),output,key,receipt.archive.headerDigest,signal);
  if((await stat(output)).size!==receipt.minimizedBytes)throw Error('Minimized denial snapshot size differs');
  const snapshot=recoveryDenialSnapshotSchema.parse(JSON.parse(await readFile(output,'utf8')));if(snapshot.schemaVersion!==receipt.sourceSchema||snapshot.id!==receipt.snapshotId||snapshot.capturedAt!==receipt.capturedAt)throw Error('Retained source snapshot identity differs');
  verifyRecoveryDenialSnapshot(snapshot,{environmentId:input.environmentId,contextDigest:receipt.archive.headerDigest,after:input.after,now:Date.now()});
  if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud))throw Error('Independent current denial destination changed');
  return {snapshot,contextDigest:receipt.archive.headerDigest,backupCapturedAt:input.after};
 }finally{key.fill(0);}
}
