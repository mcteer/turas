import type {PoolClient} from 'pg';
import {hostedCostConfiguration,hostedExecutionCredentials} from '../jobs/governed';
/** Fixed bounded metadata for canonical administrators. Unknown reservations
 * remain held at their admitted upper bound; they never become zero spend. */
export async function readCapacityHealth(db:PoolClient,environmentId:string){
 const quota=(await db.query(`SELECT (SELECT count(*) FROM operations_hosted_jobs WHERE environment_id=$1 AND state IN('admitted','starting','running','reconciling'))+
  (SELECT count(*) FROM operations_local_jobs WHERE environment_id=$1 AND state IN('running','reconciling')) AS active`,[environmentId])).rows[0];
 const rows=(await db.query(`SELECT b.id,b.category,b.state,b.cap_micro_usd,b.expires_at,b.expires_at>clock_timestamp() AS current,
  COALESCE(sum(CASE WHEN r.state='released' THEN 0 WHEN r.state='settled' THEN r.charged_micro_usd ELSE r.upper_bound_micro_usd END),0) AS committed,
  count(*) FILTER(WHERE r.state='unknown') AS unknown_count
  FROM operations_cost_budgets b LEFT JOIN operations_cost_reservations r ON r.budget_id=b.id
  WHERE b.environment_id=$1 AND ((b.state='active' AND b.expires_at>clock_timestamp()) OR EXISTS(SELECT 1 FROM operations_cost_reservations held WHERE held.budget_id=b.id AND held.state='unknown')) GROUP BY b.id ORDER BY b.created_at DESC,b.id LIMIT 21`,[environmentId])).rows;
 return {quota:{heavyJobs:{limit:2,active:Number(quota.active),available:Math.max(0,2-Number(quota.active))}},costs:{truncated:rows.length>20,budgets:rows.slice(0,20).map(row=>({id:String(row.id),category:String(row.category),state:String(row.state),expiresAt:row.expires_at.toISOString(),capMicroUsd:String(row.cap_micro_usd),committedMicroUsd:String(row.committed),unknownReservations:Number(row.unknown_count),admission:row.state==='active'&&row.current&&Number(row.unknown_count)===0&&BigInt(row.committed)<BigInt(row.cap_micro_usd)?'available':'held'}))}};
}

/** Actual dispatcher configuration and exact active Sandbox budget are required;
 * successful past jobs cannot admit new paid jobs without current authority. */
export async function readHostedDispatchHealth(db:PoolClient,environmentId:string){
 if(process.env.TURAS_PILOT_HOSTED_JOBS_ENABLED!=='1'||process.env.TURAS_JOB_EXECUTOR!=='sandbox'||process.env.TURAS_PRIVATE_OBJECT_BACKEND!=='blob')return 'unavailable' as const;
 let config:ReturnType<typeof hostedCostConfiguration>;
 try{hostedExecutionCredentials();config=hostedCostConfiguration();}catch{return 'unavailable' as const;}
 const required=Math.max(...Object.values(config.bounds));
 const row=(await db.query(`SELECT b.cap_micro_usd-COALESCE(sum(CASE WHEN r.state='released' THEN 0 WHEN r.state='settled' THEN r.charged_micro_usd ELSE r.upper_bound_micro_usd END),0) AS remaining,
  count(*) FILTER(WHERE r.state='unknown') AS unknown_count
  FROM operations_cost_budgets b LEFT JOIN operations_cost_reservations r ON r.budget_id=b.id
  WHERE b.id=$1 AND b.environment_id=$2 AND b.category='sandbox' AND b.scope_digest=$3 AND b.pricing_digest=$4 AND b.state='active' AND b.expires_at>clock_timestamp() GROUP BY b.id`,[config.budgetId,environmentId,config.scopeDigest,config.pricingDigest])).rows[0];
 return row&&Number(row.unknown_count)===0&&BigInt(row.remaining)>=BigInt(required)?'ready' as const:'unavailable' as const;
}
