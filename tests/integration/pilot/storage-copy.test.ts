import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pilotStorageMigrate} from '../../../scripts/pilot-storage-migrate';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../../../lib/server/storage/inventory';
import {objectKey,environmentObjectId} from '../../../lib/server/storage/private-objects';
let owner:Client,env:string;
async function fixture(run:(f:{root:string;source:string;destination:string;recoveryId:string;revision:number;args:(output:string)=>string[]})=>Promise<void>){
 await withPilotEnvironment(async scope=>{
 env=scope.environmentId;owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
 const root=await mkdtemp(resolve('local-artifacts/016/storage-copy-fixture-')),source=join(root,'source'),destination=join(root,'destination'),recoveryId=randomUUID();await mkdir(source,{mode:0o700});await mkdir(destination,{mode:0o700});
 const original=(await owner.query('SELECT * FROM operations_control WHERE environment_id=$1',[env])).rows[0];
 try{
  const revision=Number((await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[env,recoveryId])).rows[0].revision);
  for(const namespace of activeObjectNamespaces){await mkdir(join(source,'e_'+environmentObjectId(env),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Controlled synthetic '+namespace),digest=createHash('sha256').update(bytes).digest('hex');await new LocalPrivateObjects(source,env,10485760).put(objectKey(env,namespace,namespace.startsWith('artifact')?digest:randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});}
  await run({root,source,destination,recoveryId,revision,args:output=>['--copy-owned','--environment',env,'--recovery-id',recoveryId,'--control-revision',String(revision),'--source-root',source,'--destination-root',destination,'--output',join(root,output)]});
 }finally{await owner.query('UPDATE operations_control SET mode=$2,revision=$3,recovery_id=$4 WHERE environment_id=$1',[env,original.mode,original.revision,original.recovery_id]);await rm(root,{recursive:true,force:true});}
 }finally{await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
it('copies all six namespaces under the exact owner fence and verifies cold parity without cutover',async()=>fixture(async f=>{
 const before=await verifiedObjectInventory(new LocalPrivateObjects(f.source,env,10485760),env),receipt=await pilotStorageMigrate(f.args('first'));
 expect(receipt).toMatchObject({objectCount:6,copied:6,coldParityVerified:true,originalsRetained:true,configurationChanged:false,hostedCopyVerified:false,cutoverAuthorized:false,providerCalls:0});expect((await verifiedObjectInventory(new LocalPrivateObjects(f.source,env,10485760),env)).digest).toBe(before.digest);expect(JSON.parse(await readFile(join(f.root,'first/copy.json'),'utf8')).inventoryDigest).toBe(before.digest);
}));
it('reconciles an idempotent owned copy without replacing existing matching objects',async()=>fixture(async f=>{
 await pilotStorageMigrate(f.args('first'));const before=await verifiedObjectInventory(new LocalPrivateObjects(f.destination,env,10485760),env);expect(await pilotStorageMigrate(f.args('second'))).toMatchObject({copied:0,objectCount:6,inventoryDigest:before.digest});
}));
it('rejects changed control revision and open admission before copying bytes',async()=>fixture(async f=>{
 const args=f.args('wrong');args[6]=String(f.revision+1);await expect(pilotStorageMigrate(args)).rejects.toThrow('boundary');expect(await readdir(f.destination)).toEqual([]);
 await owner.query("UPDATE operations_control SET mode='open' WHERE environment_id=$1",[env]);await expect(pilotStorageMigrate(f.args('open'))).rejects.toThrow('boundary');expect(await readdir(f.destination)).toEqual([]);
}));
it('retains originals and refuses a conflicting destination inventory',async()=>fixture(async f=>{
 await pilotStorageMigrate(f.args('first'));const store=new LocalPrivateObjects(f.destination,env,10485760),bytes=Buffer.from('Controlled unmatched object'),digest=createHash('sha256').update(bytes).digest('hex');await store.put(objectKey(env,'report',randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});const before=await verifiedObjectInventory(store,env);await expect(pilotStorageMigrate(f.args('conflict'))).rejects.toThrow('Destination inventory differs');expect((await verifiedObjectInventory(store,env)).digest).toBe(before.digest);expect((await verifiedObjectInventory(new LocalPrivateObjects(f.source,env,10485760),env)).objects).toHaveLength(6);
}));
it('rejects incomplete source namespaces and never infers an empty-store rollback',async()=>fixture(async f=>{
 await rm(join(f.source,'e_'+environmentObjectId(env),'workforce-staging'),{recursive:true});await expect(pilotStorageMigrate(f.args('incomplete'))).rejects.toThrow();expect(await readdir(join(f.source,'e_'+environmentObjectId(env),'artifact'))).toHaveLength(1);expect(await readdir(join(f.root,'incomplete'))).toEqual(['failure.json']);expect(JSON.parse(await readFile(join(f.root,'incomplete','failure.json'),'utf8'))).toMatchObject({state:'fail',safeFailure:'incomplete_storage_copy',originalsRetained:true,configurationChanged:false,hostedCopyVerified:false,cutoverAuthorized:false});
}));
