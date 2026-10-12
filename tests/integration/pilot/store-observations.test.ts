import {blobMock} from '../../fixtures/pilot/blob-mock';
import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {BlobPrivateObjects} from '../../../lib/server/storage/blob-objects';
import {objectKey} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {privateStoreObserver,privateStoreBinding,readPrivateStoreHealth} from '../../../lib/server/operations/store-observations';
const bytes=Buffer.from('Synthetic verified private store observation'),expected={sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')};
async function fixture(run:(owner:Client,runtime:Client,environmentId:string,env:NodeJS.ProcessEnv,store:BlobPrivateObjects)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  blobMock.objects.clear();const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
  const env={...process.env,BLOB_STORE_ID:'controlled-store',TURAS_PRIVATE_OBJECT_BACKEND:'blob'};
  const store=new BlobPrivateObjects(environment.environmentId,'synthetic-no-provider-token',1024,privateStoreObserver(environment.environmentId,env));
  try{await run(owner,runtime,environment.environmentId,env,store);}finally{await runtime.end();await owner.end();}
 },{postgresMajor:18,deadlineMs:120000});
}
const source=()=> (async function*(){yield bytes;})();
async function writeAll(store:BlobPrivateObjects,environmentId:string){for(const namespace of activeObjectNamespaces)await store.put(objectKey(environmentId,namespace,randomUUID()),source(),expected);}
it('requires actual adapter write/read verification in every namespace before store health passes',async()=>fixture(async(owner,_runtime,id,env,store)=>{
 for(const namespace of activeObjectNamespaces.slice(0,-1))await store.put(objectKey(id,namespace,randomUUID()),source(),expected);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('unverified');
 await store.put(objectKey(id,activeObjectNamespaces.at(-1)!,randomUUID()),source(),expected);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('healthy');
 const rows=(await owner.query('SELECT * FROM operations_store_observations')).rows;expect(rows).toHaveLength(6);expect(rows.every(row=>row.proof_digest.length===64&&row.store_binding_digest===privateStoreBinding(id,env.BLOB_STORE_ID!))).toBe(true);
 expect(JSON.stringify(rows)).not.toContain(bytes.toString());expect(JSON.stringify(rows)).not.toContain('synthetic-no-provider-token');
}),150000);
it('rejects invalid bytes without recording an observation',async()=>fixture(async(owner,_runtime,id,_env,store)=>{
 await expect(store.put(objectKey(id,'artifact',randomUUID()),source(),{...expected,digest:'a'.repeat(64)})).rejects.toThrow();
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_store_observations')).rows[0].n).toBe(0);
}),150000);
it('does not observe a provider conflict containing different private bytes',async()=>fixture(async(owner,_runtime,id,_env,store)=>{
 const key=objectKey(id,'artifact',randomUUID());blobMock.objects.set(key,Buffer.from('Different synthetic existing object'));
 await expect(store.put(key,source(),expected)).rejects.toThrow('Immutable');
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_store_observations')).rows[0].n).toBe(0);
}),150000);
it('cannot reuse a store observation for another store code version or environment',async()=>fixture(async(owner,_runtime,id,env,store)=>{
 await writeAll(store,id);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,'b'.repeat(40),env)).toBe('unverified');
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,{...env,BLOB_STORE_ID:'different-store'})).toBe('unverified');
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,'foreign-environment',env.TURAS_CODE_VERSION!,env)).toBe('unverified');
}),150000);
it('runtime cannot forge observation times or change or delete retained proof',async()=>fixture(async(owner,runtime,id,env,store)=>{
 await writeAll(store,id);const row=(await owner.query('SELECT * FROM operations_store_observations LIMIT 1')).rows[0];
 await expect(runtime.query('UPDATE operations_store_observations SET proof_digest=$2 WHERE id=$1',[row.id,'c'.repeat(64)])).rejects.toMatchObject({code:'42501'});
 await expect(runtime.query('DELETE FROM operations_store_observations WHERE id=$1',[row.id])).rejects.toMatchObject({code:'42501'});
 await expect(runtime.query("INSERT INTO operations_store_observations(id,environment_id,namespace,store_binding_digest,code_version,proof_digest,sampled_at) VALUES($1,$2,'artifact',$3,$4,$5,clock_timestamp())",[randomUUID(),id,row.store_binding_digest,env.TURAS_CODE_VERSION,row.proof_digest])).rejects.toMatchObject({code:'42501'});
 await expect(owner.query('UPDATE operations_store_observations SET sampled_at=clock_timestamp() WHERE id=$1',[row.id])).rejects.toThrow('immutable');
}),150000);
it('raw independent backup adapters never write application observation rows',async()=>fixture(async(owner,_runtime,id,_env)=>{
 await writeAll(new BlobPrivateObjects(id,'synthetic-no-provider-token',1024),id);
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_store_observations')).rows[0].n).toBe(0);
}),150000);
it('expires only the bounded old observations and refuses stale proof as healthy',async()=>fixture(async(owner,runtime,id,env,store)=>{
 await writeAll(store,id);const binding=privateStoreBinding(id,env.BLOB_STORE_ID!);
 for(let i=0;i<7;i++)await owner.query("INSERT INTO operations_store_observations(id,environment_id,namespace,store_binding_digest,code_version,proof_digest,sampled_at) VALUES($1,$2,'artifact',$3,$4,$5,clock_timestamp()-interval '100 days')",[randomUUID(),id,binding,'b'.repeat(40),'d'.repeat(64)]);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,'b'.repeat(40),env)).toBe('unverified');
 expect(Number((await runtime.query('SELECT turas_expire_store_observations($1,5) AS n',[id])).rows[0].n)).toBe(5);
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_store_observations')).rows[0].n).toBe(8);
 await expect(runtime.query('SELECT turas_expire_store_observations($1,101)',[id])).rejects.toThrow('Invalid operational expiry');
}),150000);

it('requires fresh observations after the latest recovery lock',async()=>fixture(async(owner,_runtime,id,env,store)=>{
 await writeAll(store,id);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('healthy');
 await owner.query("INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest) VALUES($1,$2,'quiescing','locked',2,$3,$4)",[randomUUID(),id,randomUUID(),'e'.repeat(64)]);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('unverified');
 await writeAll(store,id);
 expect(await readPrivateStoreHealth(owner as unknown as PoolClient,id,env.TURAS_CODE_VERSION!,env)).toBe('healthy');
}),150000);
