import {expect,it} from 'vitest';
import type {Client,PoolClient} from 'pg';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {storageCutoverPlanSchema,type StorageCutoverPlan} from '../../../lib/contracts/pilot-storage-cutover';
import {admitStorageCutover,copyStorageCutover} from '../../../lib/server/operations/storage-cutover';
import {recordPilotCost} from '../../../scripts/pilot-cost';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../../../lib/server/storage/inventory';
import {environmentObjectId,objectKey} from '../../../lib/server/storage/private-objects';

// Actual isolated database and bytes; local adapters exercise the copy/fence/
// accounting mechanism. These assertions never claim actual Blob acceptance.
async function fixture(run:(f:{owner:Client;runtime:Client;db:PoolClient;environmentId:string;plan:StorageCutoverPlan;source:()=>LocalPrivateObjects;destination:()=>LocalPrivateObjects})=>Promise<void>){
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const root=await mkdtemp(resolve('local-artifacts/016/storage-cutover-')),sourceRoot=join(root,'source'),destinationRoot=join(root,'destination');
  try{
   for(const path of [sourceRoot,destinationRoot]){await mkdir(path,{mode:0o700});for(const namespace of activeObjectNamespaces)await mkdir(join(path,'e_'+environmentObjectId(environmentId),namespace),{recursive:true,mode:0o700});}
   const source=()=>new LocalPrivateObjects(sourceRoot,environmentId,10485760),destination=()=>new LocalPrivateObjects(destinationRoot,environmentId,10485760);
   for(const namespace of activeObjectNamespaces){const bytes=Buffer.from('Controlled storage copy '+namespace);await source().put(objectKey(environmentId,namespace,randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')});}
   const image='vcr.vercel.com/synthetic/image@sha256:'+'a'.repeat(64),budgetId=randomUUID(),scopeDigest='b'.repeat(64),pricingDigest='c'.repeat(64);
   const plan=storageCutoverPlanSchema.parse({contract:'pilot-storage-cutover-plan-v1',id:randomUUID(),environmentId,sourceCommit:'d'.repeat(40),sourceDigest:'e'.repeat(64),target:'preview',origin:'https://synthetic.vercel.app/',source:{backend:'local',root:sourceRoot},destination:{backend:'blob',storeId:'synthetic-destination'},expectedConfiguration:{contract:'pilot-hosted-configuration-v1',environmentMarker:environmentId,projectId:'prj_synthetic',teamId:'team_synthetic',storeId:'synthetic-destination',objectBackend:'blob',executor:'sandbox',dispatcherEnabled:false,images:{scanner:image,parser:image,renderer:image},maximumConcurrentJobs:2,maximumDeadlineMs:300000,maximumInputBytes:10485760,maximumOutputBytes:52428800,maximumSandboxDispatches:32,costBudgetId:randomUUID(),costScopeDigest:scopeDigest,costPricingDigest:pricingDigest,embeddingProviderConfigured:false,blobSdkRetries:0},budgetId,scopeDigest,pricingDigest,upperBoundMicroUsd:10000,maximumObjects:10,maximumBytes:1048576,expiresAt:new Date(Date.now()+60000).toISOString(),originalsRetained:true,automaticTopUp:false});
   await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'provision',budget:{contract:'pilot-cost-v1',id:budgetId,environmentId,category:'blob',authorizationDigest:'f'.repeat(64),scopeDigest,pricingDigest,capMicroUsd:10000,expiresAt:new Date(Date.now()+60000).toISOString()}});
   await run({owner,runtime,db:owner as unknown as PoolClient,environmentId,plan,source,destination});
  }finally{await rm(root,{recursive:true,force:true});}
 });
}

it('copies fenced originals with fresh clients and preserves the entire admitted ceiling for accounting',async()=>fixture(async f=>{
 const before=await verifiedObjectInventory(f.source(),f.environmentId),admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId);
 const result=await copyStorageCutover(f.db,{...f,source:f.source,destination:f.destination,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:AbortSignal.timeout(60000)});
 expect(result).toMatchObject({objectCount:6,copied:6,inventoryDigest:before.digest,coldParityVerified:true,configurationChanged:false,cutoverVerified:false,serviceOpened:false});
 expect((await verifiedObjectInventory(f.source(),f.environmentId)).digest).toBe(before.digest);
 expect((await verifiedObjectInventory(f.destination(),f.environmentId)).digest).toBe(before.digest);
 expect((await f.owner.query('SELECT state,upper_bound_micro_usd,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[admission.reservationId])).rows[0]).toEqual({state:'unknown',upper_bound_micro_usd:'10000',charged_micro_usd:null});
 await expect(copyStorageCutover(f.db,{...f,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:AbortSignal.timeout(60000)})).rejects.toThrow('Exact admitted');
}),210000);

it('denies changed recovery scope before byte writes and never resets its paid hold',async()=>fixture(async f=>{
 const admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId);
 await expect(copyStorageCutover(f.db,{...f,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision+1,signal:AbortSignal.timeout(60000)})).rejects.toThrow('Exact locked capture boundary');
 expect((await verifiedObjectInventory(f.destination(),f.environmentId)).objects).toHaveLength(0);
 expect((await f.owner.query('SELECT state FROM operations_cost_reservations WHERE id=$1',[admission.reservationId])).rows[0].state).toBe('unknown');
}),210000);

it('refuses stale cost authority without changing admission or original bytes',async()=>fixture(async f=>{
 await f.owner.query("UPDATE operations_cost_budgets SET state='revoked' WHERE id=$1",[f.plan.budgetId]);
 await expect(admitStorageCutover(f.db,f.plan)).rejects.toThrow('Applicable cost authority unavailable');
 expect((await f.owner.query('SELECT count(*)::int AS n FROM operations_cost_reservations')).rows[0].n).toBe(0);
 expect((await verifiedObjectInventory(f.source(),f.environmentId)).objects).toHaveLength(6);
}),210000);

it('retains originals and the full hold when provider IO fails',async()=>fixture(async f=>{
 const before=await verifiedObjectInventory(f.source(),f.environmentId),admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId);
 const destination=()=>{const store=f.destination();store.put=async()=>{throw Error('Synthetic provider unavailable');};return store;};
 await expect(copyStorageCutover(f.db,{...f,destination,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:AbortSignal.timeout(60000)})).rejects.toThrow('Synthetic provider unavailable');
 expect((await verifiedObjectInventory(f.source(),f.environmentId)).digest).toBe(before.digest);
 expect((await f.owner.query('SELECT state,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[admission.reservationId])).rows[0]).toEqual({state:'unknown',charged_micro_usd:null});
 expect((await f.owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);

it('keeps partial copied bytes and the full hold after cancellation during IO',async()=>fixture(async f=>{
 const before=await verifiedObjectInventory(f.source(),f.environmentId),admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId),controller=new AbortController();
 const destination=()=>{const store=f.destination(),put=store.put.bind(store);store.put=async(...args)=>{const result=await put(...args);controller.abort(Error('Synthetic copy interrupted'));return result;};return store;};
 await expect(copyStorageCutover(f.db,{...f,destination,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:controller.signal})).rejects.toThrow('Synthetic copy interrupted');
 expect((await verifiedObjectInventory(f.source(),f.environmentId)).digest).toBe(before.digest);
 expect((await verifiedObjectInventory(f.destination(),f.environmentId)).objects).toHaveLength(1);
 expect((await f.owner.query('SELECT state,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[admission.reservationId])).rows[0]).toEqual({state:'unknown',charged_micro_usd:null});
}),210000);

it('rejects a concurrent copy of the same admitted operation',async()=>fixture(async f=>{
 const {Client:OwnerConnection}=await import('pg'),{requireOwnedPilotDatabase}=await import('../../../scripts/pilot-environment');
 const admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId),competitor=new OwnerConnection({connectionString:requireOwnedPilotDatabase(process.env,true)});
 let entered!:()=>void,release!:()=>void;const writing=new Promise<void>(done=>{entered=done;}),gate=new Promise<void>(done=>{release=done;});
 const destination=()=>{const store=f.destination(),put=store.put.bind(store);store.put=async(...args)=>{entered();await gate;return put(...args);};return store;};
 const input={...f,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:AbortSignal.timeout(60000)},first=copyStorageCutover(f.db,{...input,destination});
 try{
  await Promise.race([writing,first.then(()=>{throw Error('Copy unexpectedly finished before its IO gate');})]);
  await competitor.connect();
  await expect(copyStorageCutover(competitor as unknown as PoolClient,input)).rejects.toThrow('Storage copy already running');
 }finally{release();await competitor.end();}
 expect(await first).toMatchObject({copied:6,coldParityVerified:true});
}),210000);

it('expires admitted authority during IO without releasing its ceiling',async()=>fixture(async f=>{
 // Expiry is applied to the bounded operator plan before admission; the actual
 // budget is still independently checked at the database boundary.
 f.plan.expiresAt=new Date(Date.now()+5000).toISOString();
 const admission=await admitStorageCutover(f.db,f.plan),locked=await lockAuthorityTarget(f.owner,f.environmentId);
 const destination=()=>{const store=f.destination(),put=store.put.bind(store);store.put=async(...args)=>{await new Promise(done=>setTimeout(done,Math.max(1,Date.parse(f.plan.expiresAt)-Date.now()+50)));return put(...args);};return store;};
 await expect(copyStorageCutover(f.db,{...f,destination,plan:f.plan,reservationId:admission.reservationId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,signal:AbortSignal.timeout(60000)})).rejects.toThrow();
 expect((await f.owner.query('SELECT state,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[admission.reservationId])).rows[0]).toEqual({state:'unknown',charged_micro_usd:null});
 expect((await verifiedObjectInventory(f.source(),f.environmentId)).objects).toHaveLength(6);
}),210000);
