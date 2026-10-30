import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {encryptRecoveryFile,encryptRecoveryStream} from '../../../lib/server/operations/backup-crypto';
import {putNeonEncryptedArchive,verifyNeonEncryptedArchive,downloadNeonEncryptedArchive,expireNeonManagedArchives,retainNeonAuthoritySnapshot,type NeonArchiveScope} from '../../../lib/server/operations/neon-archive';
async function fixture(run:(owner:Client,runtime:Client,scope:NeonArchiveScope,file:string)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});
  await owner.connect();await runtime.connect();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/neon-archive-test-'));
  const key=randomBytes(32);
  try{
   await owner.query(await readFile(resolve('infra/pilot/neon-archive.sql'),'utf8'));
   const installationId=randomUUID();await owner.query('INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,$1,$2,8388608)',['pilot-neon-archive-v1',installationId]);
   const plain=join(root,'synthetic.archive'),file=join(root,'synthetic.encrypted');await writeFile(plain,randomBytes(1048576+123),{mode:0o600});
   const headerDigest='a'.repeat(64),encrypted=await encryptRecoveryFile(plain,file,key,headerDigest,environment.signal),capturedAt=new Date(Date.now()-1000).toISOString();
   const scope:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId,id:randomUUID(),environmentId:environment.environmentId,capturedAt,expiresAt:new Date(Date.parse(capturedAt)+7*86400000).toISOString(),ciphertextDigest:encrypted.digest,headerDigest,sizeBytes:encrypted.sizeBytes};
   await run(owner,runtime,scope,file);
  }finally{key.fill(0);await runtime.end();await owner.end();await rm(root,{recursive:true,force:true});}
 },{postgresMajor:18,deadlineMs:180000});
}
it('stores and cold verifies exact multi chunk encrypted bytes with immutable replay',async()=>fixture(async(owner,runtime,scope,file)=>{
 const first=await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));
 expect(first).toMatchObject({encryptedBytesVerified:true,chunkCount:2,replayed:false,independentPlacementVerified:false,restorationReady:false});
 expect(await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000))).toMatchObject({...first,replayed:true});
 const cold=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await cold.connect();
 try{
  expect(await verifyNeonEncryptedArchive(cold,scope,AbortSignal.timeout(30000))).toMatchObject({encryptedBytesVerified:true,chunkCount:2,restorationReady:false});
  const downloaded=file+'.download';
  await downloadNeonEncryptedArchive(cold,scope,downloaded,AbortSignal.timeout(30000));
  expect(await readFile(downloaded)).toEqual(await readFile(file));
  await expect(downloadNeonEncryptedArchive(cold,scope,downloaded,AbortSignal.timeout(30000))).rejects.toMatchObject({code:'EEXIST'});
  expect(await readFile(downloaded)).toEqual(await readFile(file));
 }finally{await cold.end();}
 await expect(owner.query('UPDATE turas_backup.chunks SET ciphertext=$1 WHERE archive_id=$2',[Buffer.from('changed'),scope.id])).rejects.toThrow('immutable');
 await expect(owner.query('DELETE FROM turas_backup.chunks WHERE archive_id=$1',[scope.id])).rejects.toThrow('has not expired');
 await expect(runtime.query('SELECT ciphertext FROM turas_backup.chunks')).rejects.toMatchObject({code:'42501'});
}),210000);
it('rolls back tampered ciphertext and refuses a foreign archive installation',async()=>fixture(async(owner,runtime,scope,file)=>{
 const bytes=await readFile(file);bytes[100]^=1;await writeFile(file,bytes,{mode:0o600});
 await expect(putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000))).rejects.toThrow('source digest differs');
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.archives')).rows[0].n).toBe(0);
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.chunks')).rows[0].n).toBe(0);
 await expect(putNeonEncryptedArchive(owner,{...scope,installationId:randomUUID()},file,AbortSignal.timeout(30000))).rejects.toThrow('installation required');
}),210000);
it('rejects missing cold chunks and never silently repairs conflicting archive identity',async()=>fixture(async(owner,runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));
 // Exact disposable owner fixture simulates corruption; application paths cannot
 // bypass the seven-day archive deletion fence.
 await owner.query('ALTER TABLE turas_backup.chunks DISABLE TRIGGER archive_chunk_expiry');
 try{await owner.query('DELETE FROM turas_backup.chunks WHERE archive_id=$1 AND ordinal=1',[scope.id]);}
 finally{await owner.query('ALTER TABLE turas_backup.chunks ENABLE TRIGGER archive_chunk_expiry');}
 await expect(verifyNeonEncryptedArchive(owner,scope,AbortSignal.timeout(30000))).rejects.toThrow('chunk missing');
 const failed=file+'.partial';
 await expect(downloadNeonEncryptedArchive(owner,scope,failed,AbortSignal.timeout(30000))).rejects.toThrow('chunk missing');
 await expect(readFile(failed)).rejects.toMatchObject({code:'ENOENT'});
 await expect(putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000))).rejects.toThrow('chunk missing');
 await expect(putNeonEncryptedArchive(owner,{...scope,environmentId:'foreign'},file,AbortSignal.timeout(30000))).rejects.toThrow('identity differs');
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.chunks')).rows[0].n).toBe(1);
}),210000);
it('rejects expired captures capacity exhaustion and cancellation without retaining partial rows',async()=>fixture(async(owner,runtime,scope,file)=>{
 const capturedAt=new Date(Date.now()-8*86400000).toISOString();
 await expect(putNeonEncryptedArchive(owner,{...scope,capturedAt,expiresAt:new Date(Date.parse(capturedAt)+7*86400000).toISOString()},file,AbortSignal.timeout(30000))).rejects.toThrow('expired');
 await owner.query('UPDATE turas_backup.contract SET maximum_bytes=1048576');
 await expect(putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000))).rejects.toThrow('capacity exceeded');
 const controller=new AbortController();controller.abort(new Error('Synthetic cancellation'));
 await expect(putNeonEncryptedArchive(owner,scope,file,controller.signal)).rejects.toThrow('Synthetic cancellation');
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.archives')).rows[0].n).toBe(0);
}),210000);
it('expires only elapsed managed archives and preserves fresh encrypted bytes',async()=>fixture(async(owner,runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));
 const expiredId=randomUUID();
 // Owner fixture models an archive captured eight days ago without changing the
 // actual server clock or mutating the freshly captured immutable receipt.
 await owner.query(`INSERT INTO turas_backup.archives(id,environment_id,captured_at,expires_at,ciphertext_digest,header_digest,size_bytes,chunk_count)
 SELECT $1,environment_id,captured_at-interval '8 days',expires_at-interval '8 days',ciphertext_digest,header_digest,size_bytes,chunk_count FROM turas_backup.archives WHERE id=$2`,[expiredId,scope.id]);
 await owner.query('INSERT INTO turas_backup.chunks(archive_id,ordinal,ciphertext) SELECT $1,ordinal,ciphertext FROM turas_backup.chunks WHERE archive_id=$2',[expiredId,scope.id]);
 await expect(expireNeonManagedArchives(runtime,scope.installationId,AbortSignal.timeout(30000))).rejects.toMatchObject({code:'42501'});
 expect(await expireNeonManagedArchives(owner,scope.installationId,AbortSignal.timeout(30000))).toMatchObject({expiredArchiveIds:[expiredId],deletedChunks:2,operatorArchivesDeleted:false,independentAuthorityDeleted:false,scheduleExecutionVerified:false});
 expect(await verifyNeonEncryptedArchive(owner,scope,AbortSignal.timeout(30000))).toMatchObject({encryptedBytesVerified:true});
 expect(await expireNeonManagedArchives(owner,scope.installationId,AbortSignal.timeout(30000))).toMatchObject({expiredArchiveIds:[],deletedChunks:0});
 expect((await owner.query('SELECT id FROM turas_backup.archives')).rows.map(row=>row.id)).toEqual([scope.id]);
}),210000);
it('migrates bounded capacity explicitly without changing encrypted archives or replaying policy history',async()=>fixture(async(owner,runtime,scope,file)=>{
 await owner.query('UPDATE turas_backup.contract SET maximum_bytes=209715200');
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));
 const migration=await readFile(resolve('infra/pilot/neon-archive-002-capacity.sql'),'utf8');
 await expect(runtime.query(migration)).rejects.toMatchObject({code:'42501'});await runtime.query('ROLLBACK');
 await owner.query(migration);
 const history=(await owner.query('SELECT * FROM turas_backup.capacity_changes')).rows;
 expect(history).toHaveLength(1);expect(Number(history[0].maximum_bytes)).toBe(419430400);
 await owner.query(migration);
 expect((await owner.query('SELECT * FROM turas_backup.capacity_changes')).rows).toEqual(history);
 expect((await owner.query('SELECT capacity_policy_version,maximum_bytes FROM turas_backup.contract')).rows[0]).toMatchObject({capacity_policy_version:2,maximum_bytes:'419430400'});
 expect(await verifyNeonEncryptedArchive(owner,scope,AbortSignal.timeout(30000))).toMatchObject({encryptedBytesVerified:true,chunkCount:2});
 await expect(owner.query('DELETE FROM turas_backup.capacity_changes')).rejects.toThrow('immutable');
}),210000);

async function installAuthorityRetention(owner:Client){
 await owner.query('UPDATE turas_backup.contract SET maximum_bytes=209715200');
 await owner.query(await readFile(resolve('infra/pilot/neon-archive-002-capacity.sql'),'utf8'));
 await owner.query(await readFile(resolve('infra/pilot/neon-archive-003-authority-holds.sql'),'utf8'));
}
it('permanently retains authentic authority snapshots without changing current authority claims',async()=>fixture(async(owner,runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));await installAuthorityRetention(owner);
 const result=await retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,AbortSignal.timeout(30000));
 expect(result).toMatchObject({encryptedBytesVerified:true,independentRetentionVerified:true,replayed:false,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false});
 const recorded=(await owner.query('SELECT * FROM turas_backup.authority_holds')).rows;
 expect(await retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,AbortSignal.timeout(30000))).toMatchObject({replayed:true});
 await owner.query(await readFile(resolve('infra/pilot/neon-archive-003-authority-holds.sql'),'utf8'));
 expect((await owner.query('SELECT * FROM turas_backup.authority_holds')).rows).toEqual(recorded);
 await expect(owner.query('UPDATE turas_backup.authority_holds SET retained_at=clock_timestamp()')).rejects.toThrow('immutable');
 await expect(owner.query('DELETE FROM turas_backup.authority_holds')).rejects.toThrow('immutable');
 await expect(retainNeonAuthoritySnapshot(runtime,scope,scope.headerDigest,AbortSignal.timeout(30000))).rejects.toMatchObject({code:'42501'});
}),210000);
it('excludes independently retained authority from expiry while deleting ordinary elapsed backups',async()=>fixture(async(owner,_runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));await installAuthorityRetention(owner);
 await retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,AbortSignal.timeout(30000));
 const ordinary=randomUUID();
 await owner.query(`INSERT INTO turas_backup.archives SELECT $1,environment_id,captured_at-interval '8 days',expires_at-interval '8 days',ciphertext_digest,header_digest,size_bytes,chunk_count FROM turas_backup.archives WHERE id=$2`,[ordinary,scope.id]);
 await owner.query('INSERT INTO turas_backup.chunks SELECT $1,ordinal,ciphertext FROM turas_backup.chunks WHERE archive_id=$2',[ordinary,scope.id]);
 // Only an isolated owner fixture advances this immutable archive's age; the
 // test never changes a server clock or a hosted archive.
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE turas_backup.archives DISABLE TRIGGER archive_immutable');await owner.query("UPDATE turas_backup.archives SET captured_at=captured_at-interval '8 days',expires_at=expires_at-interval '8 days' WHERE id=$1",[scope.id]);await owner.query('ALTER TABLE turas_backup.archives ENABLE TRIGGER archive_immutable');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const elapsed={...scope,capturedAt:new Date(Date.parse(scope.capturedAt)-8*86400000).toISOString(),expiresAt:new Date(Date.parse(scope.expiresAt)-8*86400000).toISOString()};
 expect(await expireNeonManagedArchives(owner,scope.installationId,AbortSignal.timeout(30000))).toMatchObject({expiredArchiveIds:[ordinary],deletedChunks:2,independentAuthorityDeleted:false});
 await expect(owner.query('DELETE FROM turas_backup.chunks WHERE archive_id=$1',[scope.id])).rejects.toThrow('permanently retained');
 await expect(owner.query('DELETE FROM turas_backup.archives WHERE id=$1',[scope.id])).rejects.toThrow('permanently retained');
 expect(await verifyNeonEncryptedArchive(owner,elapsed,AbortSignal.timeout(30000))).toMatchObject({encryptedBytesVerified:true});
 expect(await retainNeonAuthoritySnapshot(owner,elapsed,scope.headerDigest,AbortSignal.timeout(30000))).toMatchObject({replayed:true});
}),210000);
it('rejects missing damaged foreign and cancelled authority retention without inserting holds',async()=>fixture(async(owner,_runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));
 await expect(retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,AbortSignal.timeout(30000))).rejects.toThrow('migration required');
 await installAuthorityRetention(owner);
 await expect(retainNeonAuthoritySnapshot(owner,scope,'b'.repeat(64),AbortSignal.timeout(30000))).rejects.toThrow('context required');
 await expect(retainNeonAuthoritySnapshot(owner,{...scope,id:randomUUID()},scope.headerDigest,AbortSignal.timeout(30000))).rejects.toThrow('identity differs');
 await expect(retainNeonAuthoritySnapshot(owner,{...scope,installationId:randomUUID()},scope.headerDigest,AbortSignal.timeout(30000))).rejects.toThrow('installation required');
 const controller=new AbortController();controller.abort();await expect(retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,controller.signal)).rejects.toThrow();
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE turas_backup.chunks DISABLE TRIGGER archive_chunk_expiry');await owner.query('DELETE FROM turas_backup.chunks WHERE archive_id=$1 AND ordinal=1',[scope.id]);await owner.query('ALTER TABLE turas_backup.chunks ENABLE TRIGGER archive_chunk_expiry');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 await expect(retainNeonAuthoritySnapshot(owner,scope,scope.headerDigest,AbortSignal.timeout(30000))).rejects.toThrow('chunk missing');
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.authority_holds')).rows[0].n).toBe(0);
}),210000);
it('enforces authority hold owner and authenticated context even after accidental runtime grants',async()=>fixture(async(owner,runtime,scope,file)=>{
 await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));await installAuthorityRetention(owner);
 await owner.query('GRANT USAGE ON SCHEMA turas_backup TO turas_runtime');await owner.query('GRANT INSERT ON turas_backup.authority_holds TO turas_runtime');
 try{await expect(runtime.query("INSERT INTO turas_backup.authority_holds(archive_id,kind,context_digest) VALUES($1,'denial-replay-snapshot',$2)",[scope.id,scope.headerDigest])).rejects.toThrow('archive owner');}finally{await owner.query('REVOKE INSERT ON turas_backup.authority_holds FROM turas_runtime');await owner.query('REVOKE USAGE ON SCHEMA turas_backup FROM turas_runtime');}
 await expect(owner.query("INSERT INTO turas_backup.authority_holds(archive_id,kind,context_digest) VALUES($1,'denial-replay-snapshot',$2)",[scope.id,'c'.repeat(64)])).rejects.toThrow('context required');
 expect((await owner.query('SELECT count(*)::int AS n FROM turas_backup.authority_holds')).rows[0].n).toBe(0);
}),210000);

it('migrates complete capture capacity without altering old archives and cold-verifies more than 64 chunks',async()=>fixture(async(owner,runtime,scope,file)=>{
 await owner.query('UPDATE turas_backup.contract SET maximum_bytes=209715200');await putNeonEncryptedArchive(owner,scope,file,AbortSignal.timeout(30000));await owner.query(await readFile(resolve('infra/pilot/neon-archive-002-capacity.sql'),'utf8'));const originalArchive=(await owner.query('SELECT * FROM turas_backup.archives WHERE id=$1',[scope.id])).rows[0],oldHistory=(await owner.query('SELECT * FROM turas_backup.capacity_changes')).rows;
 const migration=await readFile(resolve('infra/pilot/neon-archive-003-complete-captures.sql'),'utf8');await expect(runtime.query(migration)).rejects.toMatchObject({code:'42501'});await runtime.query('ROLLBACK');await owner.query(migration);const history=(await owner.query('SELECT * FROM turas_backup.complete_capture_capacity_changes')).rows;expect(history).toHaveLength(1);await owner.query(migration);expect((await owner.query('SELECT * FROM turas_backup.complete_capture_capacity_changes')).rows).toEqual(history);expect((await owner.query('SELECT * FROM turas_backup.capacity_changes')).rows).toEqual(oldHistory);expect((await owner.query('SELECT * FROM turas_backup.archives WHERE id=$1',[scope.id])).rows[0]).toEqual(originalArchive);expect((await owner.query('SELECT capacity_policy_version,maximum_bytes FROM turas_backup.contract')).rows[0]).toMatchObject({capacity_policy_version:3,maximum_bytes:'6442450944'});
 const key=randomBytes(32),block=randomBytes(65536),largeFile=file+'.expanded',signal=AbortSignal.timeout(120000);try{const chunks=async function*(){for(let index=0;index<1024;index++)yield block;yield block.subarray(0,123);};const encrypted=await encryptRecoveryStream(chunks(),largeFile,key,scope.headerDigest,335544320-68,signal),large={...scope,id:randomUUID(),sizeBytes:encrypted.sizeBytes,ciphertextDigest:encrypted.digest};expect((await putNeonEncryptedArchive(owner,large,largeFile,signal)).chunkCount).toBe(65);const cold=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await cold.connect();try{expect(await verifyNeonEncryptedArchive(cold,large,signal)).toMatchObject({encryptedBytesVerified:true,chunkCount:65});const downloaded=largeFile+'.cold',originalQuery=cold.query.bind(cold);let chunkReads=0;cold.query=((...args:any[])=>{if(typeof args[0]==='string'&&args[0].includes('FROM turas_backup.chunks WHERE archive_id=')&&!args[0].includes('count('))chunkReads++;return (originalQuery as any)(...args);}) as typeof cold.query;await downloadNeonEncryptedArchive(cold,large,downloaded,signal);expect(chunkReads).toBeLessThanOrEqual(17);expect(createHash('sha256').update(await readFile(downloaded)).digest('hex')).toBe(encrypted.digest);cold.query=originalQuery;expect((await verifyNeonEncryptedArchive(cold,scope,signal)).encryptedBytesVerified).toBe(true);}finally{await cold.end();}}finally{key.fill(0);block.fill(0);}
 await expect(owner.query('DELETE FROM turas_backup.complete_capture_capacity_changes')).rejects.toThrow('immutable');await expect(owner.query('DELETE FROM turas_backup.archives WHERE id=$1',[scope.id])).rejects.toThrow('has not expired');
}),210000);
