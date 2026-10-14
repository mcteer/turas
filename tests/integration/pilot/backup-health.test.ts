import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {recordVerifiedBackup,readVerifiedBackupHealth} from '../../../lib/server/operations/backup-health';
async function fixture(run:(owner:Client,runtime:Client,id:string,env:NodeJS.ProcessEnv)=>Promise<void>){await withPilotEnvironment(async environment=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
 try{await run(owner,runtime,environment.environmentId,{...process.env,TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'synthetic-controlled'});}finally{await runtime.end();await owner.end();}
},{postgresMajor:18,deadlineMs:120000});}
const input=async(owner:Client,id:string,env:NodeJS.ProcessEnv)=>({archiveId:randomUUID(),environmentId:id,storeId:env.BLOB_STORE_ID!,sourceCommit:env.TURAS_CODE_VERSION!,capturedAt:(await owner.query('SELECT clock_timestamp() AS captured_at')).rows[0].captured_at.toISOString(),encryptedDigest:'a'.repeat(64),candidateDigest:'b'.repeat(64),reservationIds:[randomUUID(),randomUUID()]});
// Owner-created observation fixtures test reads/privileges, not cold capture.
// Actual encryption/cold-copy/cost settlement is checked by native-postgres.
it('requires a current exact-store owner observation and rejects other deployment or environment',async()=>fixture(async(owner,_runtime,id,env)=>{
 const db=owner as unknown as PoolClient;expect(await readVerifiedBackupHealth(db,id,env.TURAS_CODE_VERSION!,env)).toBe('unverified');
 await recordVerifiedBackup(owner,await input(owner,id,env));expect(await readVerifiedBackupHealth(db,id,env.TURAS_CODE_VERSION!,env)).toBe('healthy');
 expect(await readVerifiedBackupHealth(db,id,'c'.repeat(40),env)).toBe('unverified');
 expect(await readVerifiedBackupHealth(db,id,env.TURAS_CODE_VERSION!,{...env,BLOB_STORE_ID:'other-store'})).toBe('unverified');
 expect(await readVerifiedBackupHealth(db,'foreign',env.TURAS_CODE_VERSION!,env)).toBe('unverified');
}),150000);
it('runtime cannot record or alter owner backup observations',async()=>fixture(async(owner,runtime,id,env)=>{
 const row=await input(owner,id,env);await expect(recordVerifiedBackup(runtime,row)).rejects.toThrow('source owner');await recordVerifiedBackup(owner,row);
 await expect(runtime.query('UPDATE operations_backup_observations SET proof_digest=$2 WHERE id=$1',[row.archiveId,'d'.repeat(64)])).rejects.toMatchObject({code:'42501'});
 await expect(runtime.query('DELETE FROM operations_backup_observations WHERE id=$1',[row.archiveId])).rejects.toMatchObject({code:'42501'});
 await expect(owner.query('DELETE FROM operations_backup_observations WHERE id=$1',[row.archiveId])).rejects.toThrow('immutable');
}),150000);
it('backup recording is idempotent and refuses changed replay evidence',async()=>fixture(async(owner,_runtime,id,env)=>{
 const row=await input(owner,id,env);await recordVerifiedBackup(owner,row);await recordVerifiedBackup(owner,row);
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_backup_observations')).rows[0].n).toBe(1);
 await expect(recordVerifiedBackup(owner,{...row,encryptedDigest:'e'.repeat(64)})).rejects.toThrow('replay differs');
}),150000);
it('restored old observations cannot prove health after a recovery lock',async()=>fixture(async(owner,_runtime,id,env)=>{
 await recordVerifiedBackup(owner,await input(owner,id,env));
 await owner.query("INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest) VALUES($1,$2,'quiescing','locked',2,$3,$4)",[randomUUID(),id,randomUUID(),'e'.repeat(64)]);
 expect(await readVerifiedBackupHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('unverified');
 await recordVerifiedBackup(owner,await input(owner,id,env));expect(await readVerifiedBackupHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('healthy');
}),150000);
it('stale or future captured backup timestamps cannot be admitted',async()=>fixture(async(owner,_runtime,id,env)=>{
 const row=await input(owner,id,env);
 for(const delta of [-25*3600000,3600000])await expect(recordVerifiedBackup(owner,{...row,capturedAt:new Date(Date.parse(row.capturedAt)+delta).toISOString()})).rejects.toMatchObject({code:'23514'});
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_backup_observations')).rows[0].n).toBe(0);
}),150000);
