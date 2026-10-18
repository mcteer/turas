import type {PoolClient} from 'pg';
import {storageCutoverPlanSchema,type StorageCutoverPlan} from '../../contracts/pilot-storage-cutover';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {reserveServiceCost} from './cost';
import {withRecoveryDatabaseCheckpoint} from './database-checkpoint';
import {requiredRecoveryObjects} from './required-objects';
import {copyVerifiedObjects} from '../storage/inventory';
import type {PrivateObjects} from '../storage/private-objects';

export const storageCutoverOperationDigest=(plan:StorageCutoverPlan)=>recoveryDigest(storageCutoverPlanSchema.parse(plan));
async function ownerTarget(db:PoolClient,plan:StorageCutoverPlan){
 const rows=(await db.query(`SELECT environment_id,schema_version,
  current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner FROM turas_environment`)).rows;
 if(rows.length!==1||rows[0].environment_id!==plan.environmentId||Number(rows[0].schema_version)!==79||rows[0].owner!==true)throw Error('Exact storage cutover owner target required');
 if(Date.parse(plan.expiresAt)<=Date.now())throw Error('Storage cutover plan expired');
}
/** Admit the entire finite copy before quiescing. Persist the cost hold before
 * any provider IO; interruption never turns it back into unused allowance. */
export async function admitStorageCutover(db:PoolClient,raw:unknown){
 const plan=storageCutoverPlanSchema.parse(raw),operationDigest=storageCutoverOperationDigest(plan);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL transaction_timeout='15s'");
  await ownerTarget(db,plan);
  const reservationId=await reserveServiceCost(db,{budgetId:plan.budgetId,environmentId:plan.environmentId,category:'blob',scopeDigest:plan.scopeDigest,pricingDigest:plan.pricingDigest,operationDigest},plan.upperBoundMicroUsd);
  await db.query("UPDATE operations_cost_reservations SET state='dispatched',job_id=$2,dispatched_at=clock_timestamp() WHERE id=$1 AND state='reserved'",[reservationId,plan.id]);
  await db.query('COMMIT');return {reservationId,operationDigest,providerCalls:0,providerIoStarted:false,fullCeilingHeld:true};
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Both adapters must be constructed from the exact plan by the operator CLI.
 * Database authority, required original ledgers and the exclusive IO fence are
 * checked here. This copies bytes only; deployment and unlock stay explicit. */
export async function copyStorageCutover(db:PoolClient,input:{plan:StorageCutoverPlan;reservationId:string;recoveryId:string;controlRevision:number;source:()=>PrivateObjects;destination:()=>PrivateObjects;signal:AbortSignal}){
 const plan=storageCutoverPlanSchema.parse(input.plan),operationDigest=storageCutoverOperationDigest(plan);
 input.signal.throwIfAborted();await ownerTarget(db,plan);
 const lease=(await db.query('SELECT pg_try_advisory_lock(hashtextextended($1,16026)) AS held',[plan.id])).rows[0]?.held;
 if(lease!==true)throw Error('Storage copy already running');
 let admitted=false;
 try{
  const reservations=(await db.query(`SELECT r.*,b.environment_id,b.category,b.scope_digest,b.pricing_digest,b.state AS budget_state,b.expires_at,clock_timestamp() AS db_now
   FROM operations_cost_reservations r JOIN operations_cost_budgets b ON b.id=r.budget_id WHERE r.id=$1`,[input.reservationId])).rows;
  const r=reservations[0];
  if(reservations.length!==1||r.state!=='dispatched'||r.job_id!==plan.id||r.operation_digest!==operationDigest||r.budget_id!==plan.budgetId||Number(r.upper_bound_micro_usd)!==plan.upperBoundMicroUsd||r.environment_id!==plan.environmentId||r.category!=='blob'||r.scope_digest!==plan.scopeDigest||r.pricing_digest!==plan.pricingDigest||r.budget_state!=='active'||r.expires_at<=r.db_now)throw Error('Exact admitted storage copy cost required');
  if((await db.query("SELECT 1 FROM operations_cost_reservations WHERE budget_id=$1 AND id<>$2 AND state='unknown' LIMIT 1",[plan.budgetId,input.reservationId])).rowCount)throw Error('Unknown storage charges require reconciliation');
  admitted=true;
  const signal=AbortSignal.any([input.signal,AbortSignal.timeout(Math.max(1,Math.min(300000,Date.parse(plan.expiresAt)-Date.now(),r.expires_at.getTime()-Date.now())))]);
  const copied=await withRecoveryDatabaseCheckpoint(db,{environmentId:plan.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,signal},async()=>{
   const requiredObjects=await requiredRecoveryObjects(db,plan.environmentId),limits={maximumObjects:plan.maximumObjects,maximumBytes:plan.maximumBytes};
   const result=await copyVerifiedObjects({source:input.source(),destination:input.destination(),environmentId:plan.environmentId,signal,limits,requiredObjects});
   const cold=await copyVerifiedObjects({source:input.source(),destination:input.destination(),environmentId:plan.environmentId,signal,limits,requiredObjects});
   if(cold.copied!==0||cold.inventoryDigest!==result.inventoryDigest)throw Error('Cold storage copy parity differs');
   return result;
  });
  return {contract:'pilot-hosted-storage-copy-v1' as const,planId:plan.id,operationDigest,reservationId:input.reservationId,...copied,coldParityVerified:true,configurationChanged:false,cutoverVerified:false,serviceOpened:false};
 }finally{
  try{
   // Both conclusive copies and interrupted provider IO retain the full ceiling
   // until a separate explicit accounting receipt. Never synthesize a zero.
   if(admitted)await db.query("UPDATE operations_cost_reservations SET state='unknown' WHERE id=$1 AND state='dispatched'",[input.reservationId]);
  }finally{
   if((await db.query('SELECT pg_advisory_unlock(hashtextextended($1,16026)) AS released',[plan.id])).rows[0]?.released!==true)throw Error('Storage copy lease release unverified');
  }
 }
}
