import {Client} from 'pg';
import {z} from 'zod';
import {mkdtemp,writeFile,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {unsealWorkCandidate} from './work-candidate-capsule';
import {deriveWorkBackupKey} from './work-backup-run';
import {downloadNeonEncryptedArchive,type NeonArchiveScope} from './neon-archive';
import {verifyRecoveryCandidate} from './candidate-verification';
import {decryptRecoveryFile} from './backup-crypto';
import {unpackBackupArchive} from './backup-archive';
const identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/);
/** Cold inspection of a separately retained archive and its derived-key
 * metadata. No source database, application process or local capture is read.
 * This never restores SQL, replays work, enables access or certifies authority. */
export async function readWorkCapture(input:{connectionString:string;installationId:string;archiveId:string;environmentId:string;sourceProjectId:string;master:Uint8Array;masterReference:string;masterVersion:string;output:string;signal:AbortSignal}){
 z.uuid().parse(input.installationId);z.uuid().parse(input.archiveId);identity.parse(input.environmentId);z.string().regex(/^prj_[A-Za-z0-9]+$/).parse(input.sourceProjectId);identity.parse(input.masterReference);identity.parse(input.masterVersion);
 input.signal.throwIfAborted();const root=resolve(input.output),info=await lstat(root);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700||await realpath(root)!==root||(await readdir(root)).length)throw Error('Fresh private cold inspection output required');
 const db=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:10000});let data:any;
 // A server transaction timeout can emit an error while the consumer writes a
 // chunk to disk. Keep it on the normal rejection/finally cleanup path.
 db.on('error',()=>{});
 try{
  await db.connect();
  const contract=(await db.query("SELECT installation_id,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) AS owner FROM turas_backup.contract")).rows;
  if(contract.length!==1||contract[0].installation_id!==input.installationId||contract[0].owner!==true)throw Error('Exact cold archive owner installation required');
  data=(await db.query(`SELECT a.*,r.source_project_id,r.source_commit,r.source_digest,r.catalog_digest,r.candidate_digest,r.key_reference,r.key_version,c.ciphertext AS capsule
   FROM turas_backup.archives a JOIN turas_backup.capture_receipts r ON r.archive_id=a.id JOIN turas_backup.capture_capsules c ON c.archive_id=a.id
   WHERE a.id=$1 AND r.installation_id=$2`,[input.archiveId,input.installationId])).rows[0];
  if(!data||data.environment_id!==input.environmentId||data.source_project_id!==input.sourceProjectId||data.key_reference!==input.masterReference+':'+input.archiveId||data.key_version!==input.masterVersion||!Buffer.isBuffer(data.capsule)||data.expires_at.getTime()<=Date.now()||data.captured_at.getTime()>Date.now())throw Error('Exact unexpired cold archive metadata required');
 }finally{await db.end();}
 const key=deriveWorkBackupKey(input.master,{installationId:input.installationId,environmentId:input.environmentId,archiveId:input.archiveId});let keys:string|undefined,downloaded=false;
 try{
  const candidate=unsealWorkCandidate(data.capsule,key,{archiveId:input.archiveId,candidateDigest:data.candidate_digest});
  if(candidate.environmentId!==data.environment_id||candidate.capturedAt!==data.captured_at.toISOString()||candidate.sourceCommit!==data.source_commit||candidate.sourceDigest!==data.source_digest||candidate.catalogDigest!==data.catalog_digest||candidate.key.reference!==data.key_reference||candidate.key.version!==data.key_version||candidate.encryptedBundle.digest!==data.ciphertext_digest||candidate.encryptedBundle.headerDigest!==data.header_digest||candidate.encryptedBundle.sizeBytes!==Number(data.size_bytes))throw Error('Authenticated cold capture metadata differs');
  keys=await mkdtemp(join(await realpath(tmpdir()),'turas-cold-work-key-'));const keyFile=join(keys,'key');await writeFile(keyFile,key,{mode:0o600,flag:'wx'});
  const scope:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId:input.installationId,id:input.archiveId,environmentId:input.environmentId,capturedAt:data.captured_at.toISOString(),expiresAt:data.expires_at.toISOString(),ciphertextDigest:data.ciphertext_digest,headerDigest:data.header_digest,sizeBytes:Number(data.size_bytes)};
  const cold=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:10000}),bundle=join(root,'candidate.encrypted');
  cold.on('error',()=>{});
  try{await cold.connect();await downloadNeonEncryptedArchive(cold,scope,bundle,input.signal);downloaded=true;}finally{await cold.end();}
  await verifyRecoveryCandidate({candidate,environmentId:input.environmentId,bundle,keyFile,signal:input.signal});
  const archive=join(root,'matched.archive');await decryptRecoveryFile(bundle,archive,key,candidate.encryptedBundle.headerDigest,input.signal);
  const header=await unpackBackupArchive({archive,target:join(root,'unpacked'),expectedHeaderDigest:candidate.encryptedBundle.headerDigest,environmentId:input.environmentId,checkpointId:input.archiveId,signal:input.signal});
  input.signal.throwIfAborted();
  return {contract:'pilot-work-cold-inspection-v1' as const,candidate,header,dump:join(root,'unpacked','database.dump'),encryptedArchiveVerified:true,captureMetadataVerified:true,sourceAccessed:false,separateKeyRetentionVerified:false,independentPlacementVerified:false,currentAuthorityVerified:false,databaseRestored:false,restorationReady:false};
 }catch(error){if(downloaded){await rm(join(root,'candidate.encrypted'),{force:true});await rm(join(root,'matched.archive'),{force:true});await rm(join(root,'unpacked'),{recursive:true,force:true});}throw error;}
 finally{key.fill(0);if(keys)await rm(keys,{recursive:true,force:true});}
}
