import {WORK_BACKUP_LIMITS} from './work-backup-limits';
import {constants} from 'node:fs';
import {open,lstat,realpath,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {Client} from 'pg';
import {z} from 'zod';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const neonArchiveScopeSchema=z.strictObject({
 contract:z.literal('pilot-neon-archive-v1'),installationId:z.uuid(),id:z.uuid(),
 environmentId:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),
 capturedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
 ciphertextDigest:digest,headerDigest:digest,sizeBytes:z.number().int().min(68).max(WORK_BACKUP_LIMITS.encryptedArchiveBytes),
}).superRefine((value,ctx)=>{if(Date.parse(value.expiresAt)-Date.parse(value.capturedAt)!==7*86400000)ctx.addIssue({code:'custom',message:'Managed archive retention differs'});});
export type NeonArchiveScope=z.infer<typeof neonArchiveScopeSchema>;
const chunkBytes=1048576;
async function requireArchiveContract(db:Client,scope:Pick<NeonArchiveScope,'contract'|'installationId'>){
 const rows=(await db.query(`SELECT version,installation_id,maximum_bytes,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) AS owner
 FROM turas_backup.contract`)).rows;
 if(rows.length!==1||rows[0].version!==scope.contract||rows[0].installation_id!==scope.installationId||rows[0].owner!==true)throw Error('Exact independent archive owner installation required');
 const maximumBytes=Number(rows[0].maximum_bytes);
 if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1048576||maximumBytes>WORK_BACKUP_LIMITS.maximumRetainedBytes)throw Error('Bounded archive capacity policy required');
 return maximumBytes;
}
async function readArchive(db:Client,scope:NeonArchiveScope,signal:AbortSignal,consume?:(bytes:Buffer)=>Promise<void>){
 const row=(await db.query('SELECT * FROM turas_backup.archives WHERE id=$1',[scope.id])).rows[0];
 const chunkCount=Math.ceil(scope.sizeBytes/chunkBytes);
 if(!row||row.environment_id!==scope.environmentId||row.captured_at.toISOString()!==new Date(scope.capturedAt).toISOString()||row.expires_at.toISOString()!==new Date(scope.expiresAt).toISOString()||row.ciphertext_digest!==scope.ciphertextDigest||row.header_digest!==scope.headerDigest||Number(row.size_bytes)!==scope.sizeBytes||row.chunk_count!==chunkCount)throw Error('Exact encrypted archive identity differs');
 const hash=createHash('sha256');let size=0;
 for(let ordinal=0;ordinal<chunkCount;ordinal++){
  signal.throwIfAborted();
  const chunks=(await db.query('SELECT ciphertext FROM turas_backup.chunks WHERE archive_id=$1 AND ordinal=$2',[scope.id,ordinal])).rows;
  const bytes=chunks[0]?.ciphertext;
  if(chunks.length!==1||!Buffer.isBuffer(bytes)||bytes.length!==Math.min(chunkBytes,scope.sizeBytes-size))throw Error('Encrypted archive chunk missing or changed');
  size+=bytes.length;hash.update(bytes);if(consume)await consume(bytes);
 }
 if(Number((await db.query('SELECT count(*) AS n FROM turas_backup.chunks WHERE archive_id=$1',[scope.id])).rows[0].n)!==chunkCount||size!==scope.sizeBytes||hash.digest('hex')!==scope.ciphertextDigest)throw Error('Encrypted archive byte verification differs');
 return {encryptedBytesVerified:true as const,chunkCount,sizeBytes:size};
}
/** Bounded ciphertext storage only. Independent cloud placement, key availability,
 * current authority, scheduled capture and recovery acceptance are separate proofs.
 * Schema installation is explicit; this function cannot create or repair tables. */
export async function putNeonEncryptedArchive(db:Client,raw:NeonArchiveScope,filePath:string,signal:AbortSignal){
 const scope=neonArchiveScopeSchema.parse(raw),target=resolve(filePath),parent=dirname(target);
 signal.throwIfAborted();const directory=await lstat(parent);
 if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o777)!==0o700||await realpath(parent)!==parent)throw Error('Private encrypted archive directory required');
 const file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 let transaction=false;
 try{
  const info=await file.stat();
  if(!info.isFile()||info.nlink!==1||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size!==scope.sizeBytes)throw Error('Private encrypted archive file differs');
  const prefix=Buffer.alloc(52);const prefixRead=await file.read(prefix,0,prefix.length,0);
  if(prefixRead.bytesRead!==52||prefix.subarray(0,8).toString()!=='TURAS016'||prefix.subarray(20).toString('hex')!==scope.headerDigest)throw Error('Encrypted recovery archive header differs');
  await db.query('BEGIN');transaction=true;
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='180s'");
  const maximumBytes=await requireArchiveContract(db,scope);
  await db.query('LOCK TABLE turas_backup.archives IN SHARE ROW EXCLUSIVE MODE');
  const existing=(await db.query('SELECT id FROM turas_backup.archives WHERE id=$1',[scope.id])).rowCount!==0;
  if(!existing){
   const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
   if(Date.parse(scope.capturedAt)>now||Date.parse(scope.expiresAt)<=now)throw Error('Encrypted archive capture expired or future');
   const retained=Number((await db.query('SELECT COALESCE(sum(size_bytes),0) AS n FROM turas_backup.archives')).rows[0].n);
   if(!Number.isSafeInteger(retained)||retained+scope.sizeBytes>maximumBytes)throw Error('Independent archive capacity exceeded');
   await db.query('INSERT INTO turas_backup.archives(id,environment_id,captured_at,expires_at,ciphertext_digest,header_digest,size_bytes,chunk_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[scope.id,scope.environmentId,scope.capturedAt,scope.expiresAt,scope.ciphertextDigest,scope.headerDigest,scope.sizeBytes,Math.ceil(scope.sizeBytes/chunkBytes)]);
  }
  const hash=createHash('sha256'),buffer=Buffer.alloc(chunkBytes);let position=0,ordinal=0;
  while(position<scope.sizeBytes){
   signal.throwIfAborted();const length=Math.min(chunkBytes,scope.sizeBytes-position);let offset=0;
   while(offset<length){const read=await file.read(buffer,offset,length-offset,position+offset);if(!read.bytesRead)throw Error('Encrypted archive file changed');offset+=read.bytesRead;}
   const bytes=buffer.subarray(0,length);hash.update(bytes);
   if(!existing)await db.query('INSERT INTO turas_backup.chunks(archive_id,ordinal,ciphertext) VALUES($1,$2,$3)',[scope.id,ordinal,bytes]);
   position+=length;ordinal++;
  }
  if(hash.digest('hex')!==scope.ciphertextDigest||(await file.stat()).size!==info.size)throw Error('Encrypted archive source digest differs');
  const result=await readArchive(db,scope,signal);signal.throwIfAborted();await db.query('COMMIT');transaction=false;
  return {contract:scope.contract,archiveId:scope.id,installationId:scope.installationId,...result,replayed:existing,independentPlacementVerified:false,restorationReady:false};
 }catch(error){if(transaction)await db.query('ROLLBACK');throw error;}
 finally{await file.close();}
}
export async function verifyNeonEncryptedArchive(db:Client,raw:NeonArchiveScope,signal:AbortSignal){
 const scope=neonArchiveScopeSchema.parse(raw);signal.throwIfAborted();
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='180s'");
  await requireArchiveContract(db,scope);const result=await readArchive(db,scope,signal);signal.throwIfAborted();await db.query('COMMIT');
  return {contract:scope.contract,archiveId:scope.id,installationId:scope.installationId,...result,independentPlacementVerified:false,restorationReady:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
/** Writes only ciphertext to a new private file. A corrupt/missing chunk or an
 * interruption removes that new partial file; existing files are never replaced. */
export async function downloadNeonEncryptedArchive(db:Client,raw:NeonArchiveScope,output:string,signal:AbortSignal){
 const scope=neonArchiveScopeSchema.parse(raw),target=resolve(output),parent=dirname(target);
 signal.throwIfAborted();const directory=await lstat(parent);
 if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o777)!==0o700||await realpath(parent)!==parent)throw Error('Private archive download directory required');
 const file=await open(target,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);let complete=false,transaction=false;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='180s'");await requireArchiveContract(db,scope);
  let position=0;
  const result=await readArchive(db,scope,signal,async bytes=>{
   for(let offset=0;offset<bytes.length;){signal.throwIfAborted();const written=await file.write(bytes,offset,bytes.length-offset,position+offset);if(!written.bytesWritten)throw Error('Encrypted archive download incomplete');offset+=written.bytesWritten;}
   position+=bytes.length;
  });
  signal.throwIfAborted();await file.sync();await db.query('COMMIT');transaction=false;complete=true;
  return {contract:scope.contract,archiveId:scope.id,installationId:scope.installationId,...result,independentPlacementVerified:false,restorationReady:false};
 }catch(error){if(transaction)await db.query('ROLLBACK');throw error;}
 finally{await file.close();if(!complete)await unlink(target);}
}
/** Exact managed-archive retention only. Never scans or deletes operator files,
 * independent current-authority records, keys or any application database rows. */
export async function expireNeonManagedArchives(db:Client,installationId:string,signal:AbortSignal){
 z.uuid().parse(installationId);signal.throwIfAborted();await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='30s'");
  await requireArchiveContract(db,{contract:'pilot-neon-archive-v1',installationId});
  await db.query('LOCK TABLE turas_backup.archives IN SHARE ROW EXCLUSIVE MODE');
  const holdsInstalled=(await db.query("SELECT to_regclass('turas_backup.authority_holds') IS NOT NULL AS installed")).rows[0].installed===true;
  const retainedClause=holdsInstalled?' AND NOT EXISTS(SELECT 1 FROM turas_backup.authority_holds h WHERE h.archive_id=a.id)':'';
  const expired=(await db.query('SELECT a.id FROM turas_backup.archives a WHERE a.expires_at<=clock_timestamp()'+retainedClause+' ORDER BY a.expires_at,a.id LIMIT 100 FOR UPDATE OF a')).rows.map(row=>String(row.id));
  let deletedChunks=0;
  for(const id of expired){
   signal.throwIfAborted();
   if((await db.query("SELECT to_regclass('turas_backup.capture_capsules') IS NOT NULL AS installed")).rows[0].installed===true)await db.query('DELETE FROM turas_backup.capture_capsules WHERE archive_id=$1',[id]);
   deletedChunks+=(await db.query('DELETE FROM turas_backup.chunks WHERE archive_id=$1',[id])).rowCount??0;
   if((await db.query('DELETE FROM turas_backup.archives WHERE id=$1 AND expires_at<=clock_timestamp()',[id])).rowCount!==1)throw Error('Exact managed expiry changed');
  }
  signal.throwIfAborted();await db.query('COMMIT');
  return {contract:'pilot-neon-expiry-v1' as const,installationId,expiredArchiveIds:expired,deletedChunks,operatorArchivesDeleted:false,independentAuthorityDeleted:false,scheduleExecutionVerified:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Keep independently captured encrypted denial/replay bytes beyond managed
 * backup expiry. This never asserts freshness, reconciles a restored database,
 * grants source eligibility, or clears recovery quarantine. */
export async function retainNeonAuthoritySnapshot(db:Client,raw:NeonArchiveScope,contextDigest:string,signal:AbortSignal){
 const scope=neonArchiveScopeSchema.parse(raw);digest.parse(contextDigest);
 if(contextDigest!==scope.headerDigest)throw Error('Exact authority snapshot context required');
 signal.throwIfAborted();await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='180s'");
  await requireArchiveContract(db,scope);await db.query('LOCK TABLE turas_backup.archives IN SHARE ROW EXCLUSIVE MODE');
  if((await db.query("SELECT to_regclass('turas_backup.authority_holds') IS NOT NULL AS installed")).rows[0].installed!==true)throw Error('Explicit independent authority retention migration required');
  const verified=await readArchive(db,scope,signal);
  const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
  const prior=(await db.query('SELECT kind,context_digest,retained_at FROM turas_backup.authority_holds WHERE archive_id=$1',[scope.id])).rows[0];
  if(prior){if(prior.kind!=='denial-replay-snapshot'||prior.context_digest!==contextDigest)throw Error('Authority retention replay differs');}
  else{
   if(Date.parse(scope.capturedAt)>now||Date.parse(scope.expiresAt)<=now)throw Error('Unexpired authentic authority snapshot required');
   await db.query("INSERT INTO turas_backup.authority_holds(archive_id,kind,context_digest) VALUES($1,'denial-replay-snapshot',$2)",[scope.id,contextDigest]);
  }
  signal.throwIfAborted();await db.query('COMMIT');
  return {contract:'pilot-neon-authority-retention-v1' as const,archiveId:scope.id,...verified,replayed:Boolean(prior),independentRetentionVerified:true,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
