import type {PoolClient} from 'pg';
import type {ReportSourceScope,ReportSource} from './sources';
import {reportSourceClosures,reportSourceEligibility,verifyReportSources} from './sources';
import {reportSourceAudience} from './policy';
import {nativeSourceKey} from './native-sources';
import {HttpFailure} from '../../contracts/http';
export async function selectReportDeliveryRecords(db:PoolClient,scope:ReportSourceScope,engagementIds:string[]){
 const selected=(await db.query(`SELECT r.id,r.kind,r.baseline_id,r.accepted_revision_id AS revision_id,v.revision_number,v.content_digest,v.engagement_id,v.event_date::text,
   (SELECT d.id FROM execution_review_decisions d WHERE d.revision_id=v.id AND d.action='accept' ORDER BY d.created_at DESC LIMIT 1) AS decision_id
 FROM execution_records r JOIN execution_record_revisions v ON v.id=r.accepted_revision_id
 WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.customer_id=$3 AND r.engagement_id=ANY($4::uuid[]) AND v.audience=ANY($5::text[])
 ORDER BY v.engagement_id,v.event_date,r.id LIMIT 1001`,[scope.environmentId,scope.workspaceId,scope.customerId,engagementIds,reportSourceAudience(scope.audience)])).rows;
 if(selected.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the report delivery scope');
 const eligible:Array<{id:string;kind:string;baselineId:string;revisionId:string;eventDate:string;engagementId:string;content:Record<string,unknown>}> = [],dependencies=new Map<string,ReportSource>();
 const refs:ReportSource[]=selected.map(row=>({kind:'execution_record',id:row.id,revisionId:row.revision_id,generation:Number(row.revision_number),contentDigest:row.content_digest,engagementId:row.engagement_id,decisionId:row.decision_id}));
 const graph=await reportSourceClosures(db,scope,refs),eligibility=await reportSourceEligibility(db,scope,graph.sources);
 const baselines=new Map((await db.query('SELECT id,active_baseline_id FROM engagements WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 ORDER BY id FOR SHARE',[engagementIds,scope.environmentId,scope.workspaceId,scope.customerId])).rows.map(row=>[row.id,row.active_baseline_id]));
 const admitted=selected.filter((row,index)=>baselines.get(row.engagement_id)===row.baseline_id && graph.closures.get(nativeSourceKey(refs[index]))!.every(ref=>eligibility.get(nativeSourceKey(ref))));
 const payloads=new Map((await db.query('SELECT revision_id,content FROM execution_record_payloads WHERE revision_id=ANY($1::uuid[])',[admitted.map(row=>row.revision_id)])).rows.map(row=>[row.revision_id,row.content]));
 let reviewRequired=selected.length-admitted.length;
 for(const row of admitted){
  const ref=refs.find(ref=>ref.revisionId===row.revision_id)!;const content=payloads.get(row.revision_id);if(!content){reviewRequired++;continue;}
  for(const source of graph.closures.get(nativeSourceKey(ref))!)dependencies.set(`${source.kind}:${source.revisionId}`,source);
  if(dependencies.size>2000)throw new HttpFailure(422,'scope_too_large','Narrow the report source scope');
  eligible.push({id:row.id,kind:row.kind,baselineId:row.baseline_id,revisionId:row.revision_id,eventDate:row.event_date,engagementId:row.engagement_id,content});
 }
 return {records:eligible,sources:[...dependencies.values()],coverage:{selectedRecords:selected.length,eligibleRecords:eligible.length,reviewRequiredRecords:reviewRequired}};
}

export async function validateReportSelection(db:PoolClient,scope:ReportSourceScope,selection:{engagementIds:string[];workloadIds:string[];includeCustomerLevel:boolean}){
 if(scope.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw new HttpFailure(409,'source_changed','Report environment changed');
 const rows=(await db.query(`SELECT e.id,e.workload_id FROM engagements e WHERE e.environment_id=$1 AND e.workspace_id=$2 AND e.customer_id=$3 AND e.id=ANY($4::uuid[]) ORDER BY id FOR SHARE`,[scope.environmentId,scope.workspaceId,scope.customerId,selection.engagementIds])).rows;
 if(rows.length!==selection.engagementIds.length)throw new HttpFailure(404,'not_found','Resource not found');
 if(rows.some(row=>row.workload_id===null && !selection.includeCustomerLevel) || rows.some(row=>row.workload_id!==null && !selection.workloadIds.includes(row.workload_id)))throw new HttpFailure(422,'invalid_input','Engagement workload selection does not match');
 const workloads=(await db.query(`SELECT w.id FROM customer_workloads w WHERE w.workspace_id=$1 AND w.customer_id=$2 AND w.id=ANY($3::uuid[]) AND w.lifecycle='active' AND EXISTS(SELECT 1 FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id WHERE r.workload_id=w.id AND r.kind='workload_details') ORDER BY w.id FOR SHARE`,[scope.workspaceId,scope.customerId,selection.workloadIds])).rows;
 if(workloads.length!==selection.workloadIds.length)throw new HttpFailure(422,'invalid_input','Select accepted workloads in this customer');
 const workloadSources:ReportSource[]=[];
 if(selection.workloadIds.length){
  const references=(await db.query(`SELECT DISTINCT ON(r.workload_id) r.workload_id,v.id,v.revision_number,v.content_digest,decision.revision_id AS decision_id
   FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
   JOIN profile_review_decisions decision ON decision.revision_id=v.id AND decision.decision='accept'
   WHERE r.workspace_id=$1 AND r.customer_id=$2 AND r.kind='workload_details' AND r.workload_id=ANY($3::uuid[])
   ORDER BY r.workload_id,v.revision_number DESC,decision.decided_at DESC,decision.revision_id`,[scope.workspaceId,scope.customerId,selection.workloadIds])).rows;
  if(references.length!==selection.workloadIds.length)throw new HttpFailure(409,'source_changed','Selected workload evidence requires current review');
  workloadSources.push(...references.map(row=>({kind:'workload_identity',id:row.id,revisionId:row.id,generation:Number(row.revision_number),contentDigest:row.content_digest,engagementId:null,decisionId:row.decision_id})));
  await verifyReportSources(db,scope,workloadSources);
 }
 return {engagements:rows,sources:workloadSources};
}
