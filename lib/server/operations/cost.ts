import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {costBudgetSchema,costOperationDigest,microUsd,type CostBudget} from '../../contracts/pilot-cost';
import type {ExecutionKind} from '../jobs/executor';
import type {JobAdmission,ServiceBudgetAuthority} from './hosted-jobs';
import {requireOperationalOpen} from './admission';

type BudgetRow={id:string;environment_id:string;category:CostBudget['category'];authorization_digest:string;scope_digest:string;pricing_digest:string;cap_micro_usd:string;expires_at:Date;state:string;db_now:Date};
type ReservationRow={id:string;budget_id:string;operation_digest:string;state:string;job_id:string|null;charged_micro_usd:string|null;charge_kind:string|null};
export type CostBinding={budgetId:string;environmentId:string;category:CostBudget['category'];scopeDigest:string;pricingDigest:string;operationDigest:string};
async function lockBudget(db:PoolClient,binding:CostBinding){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16018))',[binding.budgetId]);
 const row=(await db.query<BudgetRow>('SELECT *,clock_timestamp() AS db_now FROM operations_cost_budgets WHERE id=$1 FOR UPDATE',[binding.budgetId])).rows[0];
 if(!row)return undefined;
 costBudgetSchema.parse({contract:'pilot-cost-v1',id:row.id,environmentId:row.environment_id,category:row.category,authorizationDigest:row.authorization_digest,scopeDigest:row.scope_digest,pricingDigest:row.pricing_digest,capMicroUsd:Number(row.cap_micro_usd),expiresAt:row.expires_at.toISOString()});
 if(row.environment_id!==binding.environmentId||row.category!==binding.category||row.scope_digest!==binding.scopeDigest||row.pricing_digest!==binding.pricingDigest)return undefined;
 return row;
}
async function currentBudget(db:PoolClient,binding:CostBinding){
 const b=await lockBudget(db,binding);
 return b&&b.state==='active'&&b.expires_at>b.db_now&&!(await db.query("SELECT 1 FROM operations_cost_reservations WHERE budget_id=$1 AND state='unknown' LIMIT 1",[b.id])).rowCount?b:undefined;
}
/** Locks and reserves the complete documented upper bound; no provider call occurs. */
export async function reserveServiceCost(db:PoolClient,binding:CostBinding,upperBoundMicroUsd:number){
 microUsd.parse(upperBoundMicroUsd);
 await requireOperationalOpen(db);
 if(!await currentBudget(db,binding))throw Error('Applicable cost authority unavailable');
 const existing=(await db.query<ReservationRow>('SELECT * FROM operations_cost_reservations WHERE budget_id=$1 AND operation_digest=$2 FOR UPDATE',[binding.budgetId,binding.operationDigest])).rows[0];
 if(existing){if(existing.state!=='reserved'||existing.job_id!==null)throw Error('Paid operation already admitted; reconcile before retry');return existing.id;}
 const id=randomUUID();
 await db.query('INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,$3,$4)',[id,binding.budgetId,binding.operationDigest,upperBoundMicroUsd]);
 return id;
}
/** Stable explicit field order binds each program, image, source and original deadline. */
export function sandboxOperationDigest(input:Omit<JobAdmission,'reservationId'>,kind:ExecutionKind){
 return costOperationDigest({contract:'pilot-sandbox-cost-v1',environmentId:input.environmentId,kind,domainKind:input.domainKind,domainJobId:input.domainJobId,sourceGeneration:input.sourceGeneration,sourceDigest:input.sourceDigest,imageDigest:input.imageDigest,inputDigest:input.inputDigest,inputBytes:input.inputBytes,deadlineAt:input.deadlineAt});
}
/** A runtime worker can consume owner-provisioned authority, never grant or settle it. */
export function serviceBudgetAuthority(binding:CostBinding):ServiceBudgetAuthority{
 const reservation=async(db:PoolClient,id:string)=>{
  if(!await lockBudget(db,binding))return undefined;
  const row=(await db.query<ReservationRow>('SELECT * FROM operations_cost_reservations WHERE id=$1 AND budget_id=$2 AND operation_digest=$3 FOR UPDATE',[id,binding.budgetId,binding.operationDigest])).rows[0];return row;
 };
 return {
  verifyReserved:async(db,id,jobId)=>{
   if(!await currentBudget(db,binding))return false;
   const r=await reservation(db,id);if(!r||r.state!=='reserved'||r.job_id!==null&&r.job_id!==jobId)return false;
   if(!r.job_id)await db.query('UPDATE operations_cost_reservations SET job_id=$2 WHERE id=$1',[id,jobId]);return true;
  },
  markDispatch:async(db,id)=>{
   await requireOperationalOpen(db);
   if(!await currentBudget(db,binding))throw Error('Cost dispatch held');
   const r=await reservation(db,id);if(!r||r.state!=='reserved'||!r.job_id)throw Error('Cost reservation unavailable');
   await db.query("UPDATE operations_cost_reservations SET state='dispatched',dispatched_at=clock_timestamp() WHERE id=$1",[id]);
  },
  holdUnknown:async(db,id)=>{const r=await reservation(db,id);if(r?.state==='settled')return;if(!r||!['dispatched','unknown'].includes(r.state))throw Error('Unknown cost reconciliation required');if(r.state==='dispatched')await db.query("UPDATE operations_cost_reservations SET state='unknown' WHERE id=$1",[id]);},
  isSettled:async(db,id)=>{const r=await reservation(db,id);return Boolean(r&&r.state==='settled'&&r.charged_micro_usd!==null&&r.charge_kind!==null);},
  releaseUndispatched:async(db,id)=>{const budget=await lockBudget(db,binding);if(!budget||budget.state!=='active')throw Error('Revoked cost authority requires operator reconciliation');const r=await reservation(db,id);if(!r||r.state!=='reserved')throw Error('Dispatched cost cannot be released');await db.query("UPDATE operations_cost_reservations SET state='released' WHERE id=$1",[id]);},
 };
}
