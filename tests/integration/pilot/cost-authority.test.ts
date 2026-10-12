import {readCapacityHealth} from '../../../lib/server/operations/capacity-health';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {recordPilotCost} from '../../../scripts/pilot-cost';
import {Client} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withTransaction,closeRuntimePool} from '../../../lib/server/db/client';
import {reserveServiceCost,serviceBudgetAuthority,sandboxOperationDigest,type CostBinding} from '../../../lib/server/operations/cost';
import {admitHostedJob,startHostedJob,cancelHostedJob,reconcileHostedJob,hostedSandboxLease} from '../../../lib/server/operations/hosted-jobs';
const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});
const digest='a'.repeat(64),environmentId=process.env.TURAS_ENVIRONMENT_ID!;
beforeAll(()=>owner.connect());afterAll(async()=>{await owner.end();await closeRuntimePool();});
async function budget(cap=1_000_000){const id=randomUUID();await owner.query(`INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,$4,clock_timestamp()+interval '1 hour')`,[id,environmentId,digest,cap]);return {budgetId:id,environmentId,category:'sandbox' as const,scopeDigest:digest,pricingDigest:digest,operationDigest:digest};}
it('consumes owner authority once and denies runtime provisioning or settlement',async()=>{
 const binding=await budget(),input={environmentId,domainKind:'artifact' as const,domainJobId:randomUUID(),sourceGeneration:1,sourceDigest:digest,imageDigest:digest,inputDigest:digest,inputBytes:16,deadlineAt:new Date(Date.now()+60000).toISOString()};
 binding.operationDigest=sandboxOperationDigest(input,'artifact-scan');
 await expect(withTransaction(db=>db.query("UPDATE operations_cost_budgets SET cap_micro_usd=2000000 WHERE id=$1",[binding.budgetId]))).rejects.toMatchObject({code:'42501'});
 const reservationId=await withTransaction(db=>reserveServiceCost(db,binding,400000));const authority=serviceBudgetAuthority(binding);
 const h=await withTransaction(db=>admitHostedJob(db,{...input,reservationId},authority,async()=>true));
 await withTransaction(db=>startHostedJob(db,h,authority,async()=>true));
 await expect(withTransaction(db=>startHostedJob(db,h,authority,async()=>true))).rejects.toThrow('dispatch denied');
 await expect(withTransaction(db=>db.query("UPDATE operations_cost_reservations SET state='settled',charged_micro_usd=0,charge_kind='actual' WHERE id=$1",[reservationId]))).rejects.toMatchObject({code:'42501'});
 await expect(withTransaction(db=>db.query("UPDATE operations_cost_reservations SET state='settled' WHERE id=$1",[reservationId]))).rejects.toThrow('Owner charge reconciliation');
 await withTransaction(db=>cancelHostedJob(db,h,authority));
 expect((await owner.query('SELECT state FROM operations_cost_reservations WHERE id=$1',[reservationId])).rows[0].state).toBe('unknown');
 const health=await readCapacityHealth(owner as unknown as import('pg').PoolClient,environmentId);
 expect(health.costs.budgets.find(row=>row.id===binding.budgetId)).toMatchObject({admission:'held',unknownReservations:1,committedMicroUsd:'400000'});
 expect(health.quota.heavyJobs).toMatchObject({limit:2,active:1,available:1});
 await expect(withTransaction(db=>reserveServiceCost(db,binding,400000))).rejects.toThrow('authority unavailable');
 // Complete only controlled local reconciliation; this is no provider charge claim.
 await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'reconcile',budgetId:binding.budgetId,reservationId,operationDigest:binding.operationDigest,expectedState:'unknown',chargedMicroUsd:400000,chargeKind:'estimate',chargeEvidenceDigest:digest,operatorReviewDigest:digest});
 expect(await withTransaction(db=>authority.isSettled(db,reservationId))).toBe(true);
 await owner.query("UPDATE operations_hosted_jobs SET state='cancelled',finished_at=clock_timestamp() WHERE id=$1",[h.id]);
});
it('serializes reservations and retains dispatched upper bounds',async()=>{
 const binding=await budget(600000);const r=await withTransaction(db=>reserveServiceCost(db,binding,400000));
 const authority=serviceBudgetAuthority(binding);expect(await withTransaction(db=>authority.verifyReserved(db,r,randomUUID()))).toBe(true);
 await withTransaction(db=>authority.markDispatch(db,r));
 await expect(withTransaction(db=>reserveServiceCost(db,{...binding,operationDigest:'b'.repeat(64)},300000))).rejects.toThrow('Insufficient');
 const second=await withTransaction(db=>reserveServiceCost(db,{...binding,operationDigest:'c'.repeat(64)},200000));expect(second).toBeTruthy();
 await expect(withTransaction(db=>authority.releaseUndispatched(db,r))).rejects.toThrow('cannot be released');
});
it('keeps estimates conservative and prevents release or replay after dispatch',async()=>{
 const b=await budget(600000),r=await withTransaction(db=>reserveServiceCost(db,b,400000)),a=serviceBudgetAuthority(b);
 await withTransaction(async db=>{await a.verifyReserved(db,r,randomUUID());await a.markDispatch(db,r);await a.holdUnknown(db,r);});
 await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'reconcile',budgetId:b.budgetId,reservationId:r,operationDigest:b.operationDigest,expectedState:'unknown',chargedMicroUsd:100000,chargeKind:'estimate',chargeEvidenceDigest:digest,operatorReviewDigest:digest});
 await expect(withTransaction(db=>reserveServiceCost(db,{...b,operationDigest:'b'.repeat(64)},300000))).rejects.toThrow('Insufficient');
 await expect(owner.query("UPDATE operations_cost_reservations SET state='reserved' WHERE id=$1",[r])).rejects.toThrow('immutable');
 await expect(withTransaction(db=>reserveServiceCost(db,b,400000))).rejects.toThrow('already admitted');
});
it('denies mismatched category scope pricing and revoked authority',async()=>{
 const b=await budget();for(const patch of [{category:'model' as const},{scopeDigest:'b'.repeat(64)},{pricingDigest:'b'.repeat(64)},{environmentId:'foreign'}])await expect(withTransaction(db=>reserveServiceCost(db,{...b,...patch},100000))).rejects.toThrow('authority unavailable');
 const r=await withTransaction(db=>reserveServiceCost(db,b,100000)),a=serviceBudgetAuthority(b);
 await withTransaction(db=>a.verifyReserved(db,r,randomUUID()));await owner.query("UPDATE operations_cost_budgets SET state='revoked' WHERE id=$1",[b.budgetId]);
 await expect(withTransaction(db=>a.markDispatch(db,r))).rejects.toThrow('held');
 await expect(withTransaction(db=>db.query("UPDATE operations_cost_reservations SET state='dispatched',dispatched_at=clock_timestamp() WHERE id=$1",[r]))).rejects.toThrow('dispatch held');
});
it('stops an original orphan after owner cost settlement without reopening its ledger',async()=>{
 const b=await budget(),input={environmentId,domainKind:'artifact' as const,domainJobId:randomUUID(),sourceGeneration:1,sourceDigest:digest,imageDigest:digest,inputDigest:digest,inputBytes:16,deadlineAt:new Date(Date.now()+60000).toISOString()};
 b.operationDigest=sandboxOperationDigest(input,'artifact-parse');const a=serviceBudgetAuthority(b),reservationId=await withTransaction(db=>reserveServiceCost(db,b,100000));
 const handle=await withTransaction(db=>admitHostedJob(db,{...input,reservationId},a,async()=>true));await withTransaction(db=>startHostedJob(db,handle,a,async()=>true));
 expect(await hostedSandboxLease(handle,withTransaction,a,async()=>true).bindProvider('controlled-original-provider')).toBe(true);await withTransaction(db=>cancelHostedJob(db,handle,a));
 await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'reconcile',budgetId:b.budgetId,reservationId,operationDigest:b.operationDigest,expectedState:'unknown',chargedMicroUsd:100000,chargeKind:'estimate',chargeEvidenceDigest:digest,operatorReviewDigest:digest});let stopped=0;
 const result=await reconcileHostedJob(handle,withTransaction,a,{findByCreationTag:async tag=>({complete:true,items:[{id:'controlled-original-provider',persistent:false,tags:{turas_creation:tag,turas_job:handle.id,turas_environment:createHash('sha256').update(environmentId).digest('hex')}}]}),stopAndDelete:async id=>{expect(id).toBe('controlled-original-provider');stopped++;}},AbortSignal.timeout(1000));
 expect(result).toEqual({state:'stopped'});expect(stopped).toBe(1);expect((await owner.query('SELECT state FROM operations_cost_reservations WHERE id=$1',[reservationId])).rows[0].state).toBe('settled');
});
