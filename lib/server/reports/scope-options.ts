import type {CurrentSession} from '../auth/sessions';
import {reportTransaction} from './commands';
import {lockReportActor} from './policy';
import {HttpFailure} from '../../contracts/http';
export async function reportScopeOptions(actor:CurrentSession,customerId:string){
 return reportTransaction(async db=>{
  await lockReportActor(db,actor,customerId,'prepare','delivery');
  const rows=(await db.query(`SELECT e.id,e.workload_id FROM engagements e WHERE e.environment_id=$1 AND e.workspace_id=$2 AND e.customer_id=$3 AND e.active_baseline_id IS NOT NULL ORDER BY e.id LIMIT 1001`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rows;
  if(rows.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the customer engagement scope');
  const workloads=(await db.query(`SELECT w.id,w.display_name FROM customer_workloads w WHERE w.workspace_id=$1 AND w.customer_id=$2 AND w.lifecycle='active' AND EXISTS(SELECT 1 FROM profile_records r WHERE r.workload_id=w.id AND r.kind='workload_details' AND r.current_accepted_revision_id IS NOT NULL) ORDER BY w.id LIMIT 1001`,[actor.workspaceId,customerId])).rows;
  if(workloads.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the accepted workload scope');
  return {engagements:rows.map((row,index)=>({id:row.id,label:`Engagement ${index+1}`,workloadId:row.workload_id})),workloads:workloads.map(row=>({id:row.id,label:row.display_name}))};
 });
}
