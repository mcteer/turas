import {blobMock} from '../../fixtures/pilot/blob-mock';
import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {readHostedImageHealth} from '../../../lib/server/operations/image-health';
import {admitHostedJob,startHostedJob,hostedSandboxLease,publishHostedOutput,type ServiceBudgetAuthority} from '../../../lib/server/operations/hosted-jobs';
const digests=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],version='d'.repeat(40);
// Controlled provider/budget callbacks exercise SQL publication boundaries;
// these fixtures are not actual Sandbox or cost acceptance.
const budget:ServiceBudgetAuthority={verifyReserved:async()=>true,markDispatch:async()=>{},holdUnknown:async()=>{},isSettled:async()=>true,releaseUndispatched:async()=>{}};
async function fixture(run:(owner:Client,id:string)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  Object.assign(process.env,{TURAS_CODE_VERSION:version,TURAS_JOB_EXECUTOR:'sandbox',TURAS_PILOT_SCANNER_IMAGE:'vcr.vercel.com/synthetic/scanner@sha256:'+digests[0],TURAS_PILOT_PARSER_IMAGE:'vcr.vercel.com/synthetic/parser@sha256:'+digests[1],TURAS_PILOT_RENDERER_IMAGE:'vcr.vercel.com/synthetic/renderer@sha256:'+digests[2],TURAS_PILOT_SCANNER_SIGNATURE_JSON:JSON.stringify({version:'1',builtAt:new Date().toISOString(),snapshotDigest:'f'.repeat(64),scannerDigest:digests[0]})});
  try{await run(owner,environment.environmentId);}finally{await owner.end();}
 },{postgresMajor:18,deadlineMs:120000});
}
async function complete(owner:Client,id:string,imageDigest:string,valid=true){
 const db=owner as unknown as PoolClient,transaction=async<T>(run:(db:PoolClient)=>Promise<T>)=>{await owner.query('BEGIN');try{const result=await run(db);await owner.query('COMMIT');return result;}catch(error){await owner.query('ROLLBACK');throw error;}};
 const handle=await transaction(db=>admitHostedJob(db,{environmentId:id,domainKind:'artifact',domainJobId:randomUUID(),sourceGeneration:1,sourceDigest:'e'.repeat(64),imageDigest,inputDigest:'f'.repeat(64),inputBytes:16,deadlineAt:new Date(Date.now()+30000).toISOString(),reservationId:randomUUID()},budget,async()=>true));
 await transaction(db=>startHostedJob(db,handle,budget,async()=>true));
 expect(await hostedSandboxLease(handle,transaction,budget,async()=>true).bindProvider('synthetic_'+handle.id)).toBe(true);
 const publish=()=>transaction(db=>publishHostedOutput(db,handle,{exitCode:0,durationMs:1,stdout:Buffer.from('Synthetic verified result'),files:{}},async()=>true,async()=>{if(!valid)throw Error('Synthetic invalid domain format');}));
 if(valid)await publish();else await expect(publish()).rejects.toThrow('invalid domain');
 return handle;
}
it('pinned configuration without validated provider jobs remains unverified',async()=>fixture(async(owner,id)=>{expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('unverified');}),150000);
it('requires every current image and invalidates previous deployment or recovery proof',async()=>fixture(async(owner,id)=>{
 for(const digest of digests.slice(0,2))await complete(owner,id,digest);
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('unverified');
 await complete(owner,id,digests[2]);expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('healthy');
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,'e'.repeat(40))).toBe('unverified');
 await owner.query("INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest) VALUES($1,$2,'quiescing','locked',2,$3,$4)",[randomUUID(),id,randomUUID(),'e'.repeat(64)]);
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('unverified');
 for(const digest of digests)await complete(owner,id,digest);
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('healthy');
}),150000);
it('a newer unvalidated job cannot borrow an earlier successful image result',async()=>fixture(async(owner,id)=>{
 for(const digest of digests)await complete(owner,id,digest);
 await complete(owner,id,digests[0],false);
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('unverified');
}),150000);
it('image provenance and job code identity remain exact and immutable',async()=>fixture(async(owner,id)=>{
 const handle=await complete(owner,id,digests[0]);expect((await owner.query('SELECT code_version FROM operations_hosted_jobs WHERE id=$1',[handle.id])).rows[0].code_version).toBe(version);
 await expect(owner.query('UPDATE operations_hosted_jobs SET code_version=$2 WHERE id=$1',[handle.id,'e'.repeat(40)])).rejects.toThrow('immutable');
 for(const digest of digests.slice(1))await complete(owner,id,digest);
 process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON=JSON.stringify({version:'1',builtAt:new Date(Date.now()-8*86400000).toISOString(),snapshotDigest:'f'.repeat(64),scannerDigest:digests[0]});
 expect(await readHostedImageHealth(owner as unknown as PoolClient,id,version)).toBe('unverified');
}),150000);

it('service availability and strict assurance retain their own infrastructure and maintenance checks',async()=>fixture(async(owner,id)=>{
 const {BlobPrivateObjects}=await import('../../../lib/server/storage/blob-objects');
 const {objectKey}=await import('../../../lib/server/storage/private-objects');
 const {activeObjectNamespaces}=await import('../../../lib/server/storage/inventory');
 const {privateStoreObserver}=await import('../../../lib/server/operations/store-observations');
 const {recordVerifiedBackup}=await import('../../../lib/server/operations/backup-health');
 const {createMaintenanceBindings}=await import('../../../lib/server/operations/maintenance-bindings');
 const {runMaintenanceClass}=await import('../../../lib/server/operations/maintenance');
 const {GET}=await import('../../../app/api/health/ready/route');
 const {sha256}=await import('../../../lib/server/jobs/executor');
 Object.assign(process.env,{TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'synthetic-controlled',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_synthetic-controlled_fixture'});
 blobMock.objects.clear();const store=new BlobPrivateObjects(id,'synthetic-no-provider-token',1024,privateStoreObserver(id));
 const bytes=Buffer.from('Synthetic store capability fixture');
 for(const namespace of activeObjectNamespaces)await store.put(objectKey(id,namespace,randomUUID()),(async function*(){yield bytes;})(),{digest:sha256(bytes),sizeBytes:bytes.length});
 for(const digest of digests)await complete(owner,id,digest);
 // Owner fixture observation; native-postgres independently verifies its actual producer.
 const capturedAt=(await owner.query('SELECT clock_timestamp() AS captured_at')).rows[0].captured_at.toISOString();
 await recordVerifiedBackup(owner,{archiveId:randomUUID(),environmentId:id,storeId:process.env.BLOB_STORE_ID!,sourceCommit:version,capturedAt,encryptedDigest:'a'.repeat(64),candidateDigest:'b'.repeat(64),reservationIds:[randomUUID(),randomUUID()]});
 expect((await GET()).status).toBe(503);
 for(const binding of createMaintenanceBindings())expect((await runMaintenanceClass(id,version,binding)).state).toBe('pass');
 expect((await GET()).status).toBe(503); // No paid dispatch authority yet.
 const {sandboxScopeDigest}=await import('../../../lib/server/jobs/governed');
 const {costOperationDigest}=await import('../../../lib/contracts/pilot-cost');
 Object.assign(process.env,{TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',VERCEL_TOKEN:'synthetic-no-provider-token',VERCEL_PROJECT_ID:'prj_synthetic',VERCEL_TEAM_ID:'team_synthetic'});
 const budgetId=randomUUID(),scopeDigest=sandboxScopeDigest(),costSourceDigest='e'.repeat(64),bounds={'artifact-scan':1,'artifact-parse':1,'workforce-parse':1,'report-render':1,'report-office-check':1};
 const pricingDigest=costOperationDigest({contract:'pilot-sandbox-bounds-v1',costSourceDigest,bounds});
 process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify({budgetId,scopeDigest,pricingDigest,costSourceDigest,bounds});
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$4,$5,100,clock_timestamp()+interval '1 hour')",[budgetId,id,'a'.repeat(64),scopeDigest,pricingDigest]);
 const ready=await GET();expect(ready.status).toBe(200);expect(await ready.json()).toEqual({ready:true});
 expect((await (await import('../../../lib/server/operations/health')).readOperationalHealth()).assurance.ready).toBe(true);
 process.env.BLOB_STORE_ID='different-controlled-store';expect((await GET()).status).toBe(503);
 process.env.BLOB_STORE_ID='synthetic-controlled';
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[id]);
 expect((await GET()).status).toBe(503);
}),150000);
