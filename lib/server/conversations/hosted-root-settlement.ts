import type {Client,PoolClient} from 'pg';

type Operation={id:string;budgetId:string;amount:number};
type Accounting={operation:Operation;row:{budget_id:string;ceiling_micro_usd:string;actual_micro_usd:string|null;settled_at:Date|null};budget:{state:string}};
/** Both provider completion and owner reconciliation retain this lock order.
 * The caller owns the transaction; neither helper commits or rolls it back. */
export async function lockHostedRootAccounting(db:Client|PoolClient,operation:Operation):Promise<Accounting>{
 const budget=(await db.query('SELECT state FROM parity_evaluation_budgets WHERE id=$1 FOR UPDATE',[operation.budgetId])).rows[0];
 const row=(await db.query('SELECT budget_id,ceiling_micro_usd,actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1 FOR UPDATE',[operation.id])).rows[0];
 if(!budget||!row||row.budget_id!==operation.budgetId||Number(row.ceiling_micro_usd)!==operation.amount)throw Error('Original hosted root accounting required');
 return {operation,row,budget};
}
export async function settleLockedHostedRoot(db:Client|PoolClient,locked:Accounting,actual:number){
 if(!Number.isSafeInteger(actual)||actual<0)throw Error('Finite actual hosted root charge required');
 const {operation,row,budget}=locked,overrun=actual>operation.amount;
 const discrepancy=row.settled_at!==null&&(row.actual_micro_usd===null||Number(row.actual_micro_usd)!==actual);
 let refund=0;
 // A conflicting authoritative receipt must remain durable and block further
 // dispatch. Preserve the first charge rather than manufacturing a correction.
 if(discrepancy||overrun)await db.query("UPDATE parity_evaluation_budgets SET state='overrun' WHERE id=$1",[operation.budgetId]);
 if(row.settled_at===null){
  await db.query('UPDATE parity_evaluation_operations SET actual_micro_usd=$2,settled_at=clock_timestamp() WHERE id=$1',[operation.id,actual]);
  const recovered=(await db.query("SELECT 1 FROM operations_recovery_model_holds WHERE operation_kind='parity_dollars' AND scope_id=$1 LIMIT 1",[operation.budgetId])).rowCount;
  if(!overrun&&!recovered&&budget.state==='open'){
   refund=operation.amount-actual;
   await db.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=reserved_micro_usd-$2 WHERE id=$1',[operation.budgetId,refund]);
  }
 }
 return {overrun,discrepancy,releasedExcessMicroUsd:refund,reconciliationSuccessful:!overrun&&!discrepancy};
}
