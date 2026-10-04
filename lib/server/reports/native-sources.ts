import type {PoolClient} from 'pg';import type {ReportSource,ReportSourceScope} from './sources';
export function nativeSourceKey(ref:ReportSource){return JSON.stringify([ref.kind,ref.revisionId,ref.generation,ref.contentDigest,ref.engagementId,ref.decisionId]);}
/** Batch immutable header comparisons; no delivery or workforce prose is retrieved. */
export async function eligibleNativeReportSources(db:PoolClient,scope:ReportSourceScope,sources:readonly ReportSource[]){
 const eligible=new Set<string>(),audience=scope.audience==='delivery'?'delivery':'internal';
 const recordset=`jsonb_to_recordset($1::jsonb) AS x(revision_id uuid,generation bigint,content_digest text,engagement_id uuid,decision_id uuid)`;
 for(const kind of ['approved_time','execution_record','milestone_baseline']){
  const refs=sources.filter(ref=>ref.kind===kind);if(!refs.length)continue;
  const input=JSON.stringify(refs.map(ref=>({revision_id:ref.revisionId,generation:ref.generation,content_digest:ref.contentDigest,engagement_id:ref.engagementId,decision_id:ref.decisionId})));
  const match=`v.id=x.revision_id AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=x.engagement_id AND v.revision_number=x.generation AND v.content_digest=x.content_digest`;
  let sql:string;
  if(kind==='execution_record')sql=`SELECT x.* FROM ${recordset} JOIN execution_record_revisions v ON ${match} JOIN execution_records r ON r.accepted_revision_id=v.id JOIN execution_record_payloads p ON p.revision_id=v.id
   WHERE (v.audience='delivery' OR $5='internal') AND EXISTS(SELECT 1 FROM execution_review_decisions d WHERE d.revision_id=v.id AND d.action='accept' AND (x.decision_id IS NULL OR d.id=x.decision_id)) ORDER BY r.id FOR SHARE OF r`;
  else if(kind==='approved_time')sql=`SELECT x.* FROM ${recordset} JOIN execution_time_revisions v ON ${match} JOIN execution_time_entries e ON e.approved_revision_id=v.id JOIN execution_actual_days a ON a.revision_id=v.id AND a.minutes=v.minutes JOIN execution_time_decisions d ON d.id=a.decision_id AND d.action='approve'
   WHERE d.id=x.decision_id AND $5::text IN ('internal','delivery') ORDER BY e.id FOR SHARE OF e`;
  else sql=`SELECT x.* FROM ${recordset} JOIN milestone_baselines b ON b.id=x.revision_id AND b.environment_id=$2 AND b.workspace_id=$3 AND b.customer_id=$4 AND b.engagement_id=x.engagement_id AND b.baseline_number=x.generation AND b.content_digest=x.content_digest
   JOIN engagements e ON e.active_baseline_id=b.id JOIN milestone_baseline_payloads p ON p.baseline_id=b.id JOIN delivery_plans plan ON plan.id=b.plan_id
   WHERE (plan.audience='delivery' OR $5='internal') AND (x.decision_id IS NULL OR b.decision_id=x.decision_id) ORDER BY e.id FOR SHARE OF e,plan`;
  const rows=(await db.query(sql,[input,scope.environmentId,scope.workspaceId,scope.customerId,audience])).rows;
  for(const row of rows)eligible.add(nativeSourceKey({kind,id:row.revision_id,revisionId:row.revision_id,generation:Number(row.generation),contentDigest:row.content_digest,engagementId:row.engagement_id,decisionId:row.decision_id}));
 }
 return eligible;
}
