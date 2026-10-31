import {withOperationalIo} from './admission';
import {query,withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {hostedExecutionCredentials,sandboxScopeDigest} from '../jobs/governed';
import {serviceBudgetAuthority,type CostBinding} from './cost';
import {reconcileHostedJob,type JobHandle} from './hosted-jobs';
import {sandboxProvider} from './sandbox-provider';

type Candidate={id:string;environment_id:string;lease_id:string;creation_tag:string;deadline_at:Date;budget_id:string;category:CostBinding['category'];scope_digest:string;pricing_digest:string;operation_digest:string};
/** Cleanup consumes the original reservation, independently of authoring enablement.
 * A changed provider scope is held rather than used to look up an old resource. */
export async function runHostedReconciliation(input:{limit:number;signal:AbortSignal}){
 return withOperationalIo(()=>reconcileOwnedHostedJobs(input),true);
}
async function reconcileOwnedHostedJobs(input:{limit:number;signal:AbortSignal}){
 if(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100)throw Error('Finite reconciliation batch required');
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 const rows=(await query<Candidate>(`SELECT j.id,j.environment_id,j.lease_id,j.creation_tag,j.deadline_at,
 b.id AS budget_id,b.category,b.scope_digest,b.pricing_digest,r.operation_digest
 FROM operations_hosted_jobs j JOIN operations_cost_reservations r ON r.id=j.budget_reservation_id
 JOIN operations_cost_budgets b ON b.id=r.budget_id AND b.environment_id=j.environment_id
 WHERE j.environment_id=$1 AND j.state IN ('starting','running','reconciling')
 AND (j.state='reconciling' OR j.deadline_at<=clock_timestamp() OR j.lease_expires_at<=clock_timestamp())
 ORDER BY j.deadline_at,j.id LIMIT $2`,[environmentId,input.limit+1])).rows;
 let held=0,stopped=0;
 for(const row of rows.slice(0,input.limit)){
  input.signal.throwIfAborted();
  // Credentials/configuration are checked only when a real orphan needs lookup.
  // No enabled flag, active-budget requirement, or replacement budget is used.
  if(row.category!=='sandbox'||row.scope_digest!==sandboxScopeDigest()){held++;continue;}
  const handle:JobHandle={id:row.id,environmentId:row.environment_id,leaseId:row.lease_id,creationTag:row.creation_tag,deadlineAt:row.deadline_at.toISOString()};
  const budget=serviceBudgetAuthority({budgetId:row.budget_id,environmentId:row.environment_id,category:row.category,scopeDigest:row.scope_digest,pricingDigest:row.pricing_digest,operationDigest:row.operation_digest});
  const result=await reconcileHostedJob(handle,withTransaction,budget,sandboxProvider(hostedExecutionCredentials(),handle),input.signal);
  if(result.state==='stopped')stopped++;else if(result.state==='held')held++;
 }
 return {backlog:held+(rows.length>input.limit?1:0),truncated:rows.length>input.limit,stopped};
}
