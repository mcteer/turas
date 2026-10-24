import {Client} from 'pg';
import {z} from 'zod';
import {resolve,join} from 'node:path';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {putNeonEncryptedArchive,downloadNeonEncryptedArchive,type NeonArchiveScope} from './neon-archive';
import {verifyRecoveryCandidate} from './candidate-verification';
import {withPrivateRecoveryKey} from './recovery-key';
import {sealWorkCandidate,unsealWorkCandidate} from './work-candidate-capsule';

/** Actual ciphertext copy plus a fresh-connection download/authentication.
 * Deployment/resource placement must still be independently proved by the
 * operator. This cannot certify cron, current authority or full restoration. */
export async function copyWorkCapture(input:{candidate:unknown;sourceProjectId:string;installationId:string;connectionString:string;maximumBytes:number;bundle:string;keyFile:string;coldOutput:string;signal:AbortSignal}){
 const candidate=workCaptureCandidateSchema.parse(input.candidate),project=z.string().regex(/^prj_[A-Za-z0-9]+$/).parse(input.sourceProjectId),installationId=z.uuid().parse(input.installationId);
 if(!Number.isSafeInteger(input.maximumBytes)||input.maximumBytes<1048576||input.maximumBytes>419430400)throw Error('Exact bounded work archive capacity required');
 await verifyRecoveryCandidate({candidate,environmentId:candidate.environmentId,bundle:input.bundle,keyFile:input.keyFile,signal:input.signal});
 const capsule=await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[resolve(input.bundle,'..'),resolve(input.coldOutput)],signal:input.signal},async key=>sealWorkCandidate(candidate,key));
 const scope:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId,id:candidate.id,environmentId:candidate.environmentId,capturedAt:candidate.capturedAt,expiresAt:new Date(Date.parse(candidate.capturedAt)+7*86400000).toISOString(),ciphertextDigest:candidate.encryptedBundle.digest,headerDigest:candidate.encryptedBundle.headerDigest,sizeBytes:candidate.encryptedBundle.sizeBytes};
 const first=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:10000});
 try{await first.connect();
  const owner=(await first.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.capture_receipts'::regclass")).rows[0]?.owner;
  if(owner!==true)throw Error('Explicitly migrated work capture receipt owner required');
  if((await first.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.capture_capsules'::regclass")).rows[0]?.owner!==true)throw Error('Explicitly migrated encrypted capsule owner required');
  if(Number((await first.query('SELECT maximum_bytes FROM turas_backup.contract WHERE installation_id=$1',[installationId])).rows[0]?.maximum_bytes)!==input.maximumBytes)throw Error('Work archive capacity differs');await putNeonEncryptedArchive(first,scope,resolve(input.bundle),input.signal);
 }finally{await first.end();}
 // A distinct connection and downloaded file prove a cold path; source bytes
 // cannot accidentally satisfy verification of the destination copy.
 const cold=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:10000}),download=join(resolve(input.coldOutput),'candidate.encrypted');
 try{
  await cold.connect();await downloadNeonEncryptedArchive(cold,scope,download,input.signal);
  const verified=await verifyRecoveryCandidate({candidate,environmentId:candidate.environmentId,bundle:download,keyFile:input.keyFile,signal:input.signal});
  input.signal.throwIfAborted();
  await cold.query('BEGIN');
  try{
   await cold.query("SET LOCAL lock_timeout='3s'");await cold.query("SET LOCAL statement_timeout='10s'");
   const owner=(await cold.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.capture_receipts'::regclass")).rows[0]?.owner;
   if(owner!==true)throw Error('Explicitly migrated work capture receipt owner required');
   const values=[candidate.id,installationId,project,candidate.environmentId,candidate.sourceCommit,candidate.sourceDigest,candidate.catalogDigest,recoveryDigest(candidate),candidate.key.reference,candidate.key.version,candidate.capturedAt];
   await cold.query('INSERT INTO turas_backup.capture_capsules(archive_id,ciphertext) VALUES($1,$2) ON CONFLICT(archive_id) DO NOTHING',[candidate.id,capsule]);
   const stored=(await cold.query('SELECT ciphertext FROM turas_backup.capture_capsules WHERE archive_id=$1',[candidate.id])).rows[0]?.ciphertext;
   if(!Buffer.isBuffer(stored))throw Error('Encrypted work candidate capsule unavailable');
   await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[resolve(input.bundle,'..'),resolve(input.coldOutput)],signal:input.signal},async key=>{unsealWorkCandidate(stored,key,{archiveId:candidate.id,candidateDigest:recoveryDigest(candidate)});});
   await cold.query('INSERT INTO turas_backup.capture_receipts(archive_id,installation_id,source_project_id,environment_id,source_commit,source_digest,catalog_digest,candidate_digest,key_reference,key_version,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(archive_id) DO NOTHING',values);
   const row=(await cold.query('SELECT installation_id,source_project_id,environment_id,source_commit,source_digest,catalog_digest,candidate_digest,key_reference,key_version,captured_at FROM turas_backup.capture_receipts WHERE archive_id=$1',[candidate.id])).rows[0];
   if(!row||JSON.stringify([row.installation_id,row.source_project_id,row.environment_id,row.source_commit,row.source_digest,row.catalog_digest,row.candidate_digest,row.key_reference,row.key_version,row.captured_at.toISOString()])!==JSON.stringify(values.slice(1)))throw Error('Immutable work capture receipt differs');
   input.signal.throwIfAborted();await cold.query('COMMIT');
  }catch(error){await cold.query('ROLLBACK');throw error;}
  return {contract:'pilot-work-capture-copy-v1' as const,archiveId:candidate.id,installationId,encryptedDigest:scope.ciphertextDigest,coldDownloadAuthenticated:verified.archiveIntegrityVerified,captureProvenanceVerified:verified.captureProvenanceVerified,immutableReceiptRecorded:true,independentPlacementVerified:false,currentAuthorityVerified:false,scheduledBackupVerified:false,restorationReady:false};
 }finally{await cold.end();}
}
