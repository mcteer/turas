import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {reportDigest} from './commands';
import {reportSourceClosures,reportSourceEligibility,type ReportSource,type ReportSourceScope} from './sources';
import {nativeSourceKey} from './native-sources';
export function reportMilestoneDecisionDigest(row:{id:string;action:string;expected_version:string|number;evidence_revision_ids:string[];milestone_key:string;baseline_id:string}){
 return reportDigest({eventId:row.id,action:row.action,version:Number(row.expected_version),evidenceRevisionIds:[...row.evidence_revision_ids].sort(),milestoneKey:row.milestone_key,baselineId:row.baseline_id});
}
export async function selectReportMilestones(db:PoolClient,scope:ReportSourceScope,engagementIds:string[]){
 const rows=(await db.query(`SELECT v.id,v.action,v.expected_version,v.evidence_revision_ids,v.engagement_id,m.milestone_key,m.baseline_id,m.state FROM execution_milestone_heads m JOIN execution_milestone_events v ON v.id=m.current_event_id JOIN engagements e ON e.id=m.engagement_id AND e.active_baseline_id=m.baseline_id JOIN delivery_plans p ON p.id=e.plan_id
 WHERE m.environment_id=$1 AND m.workspace_id=$2 AND m.customer_id=$3 AND m.engagement_id=ANY($4::uuid[]) AND m.state IN ('accepted','waived') AND (p.audience='delivery' OR $5='internal') ORDER BY m.engagement_id,m.milestone_key LIMIT 1001`,[scope.environmentId,scope.workspaceId,scope.customerId,engagementIds,scope.audience==='delivery'?'delivery':'internal'])).rows;
 if(rows.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the reviewed milestone scope');
 const refs:ReportSource[]=rows.map(row=>({kind:'milestone_decision',id:row.id,revisionId:row.id,generation:Number(row.expected_version)+1,contentDigest:reportMilestoneDecisionDigest(row),engagementId:row.engagement_id,decisionId:row.id}));
 const graph=await reportSourceClosures(db,scope,refs),eligible=await reportSourceEligibility(db,scope,graph.sources);
 const admitted=rows.filter((_,index)=>graph.closures.get(nativeSourceKey(refs[index]))!.every(source=>eligible.get(nativeSourceKey(source))));
 return {milestones:admitted.map(row=>({engagementId:row.engagement_id,revisionId:row.id,key:row.milestone_key,state:row.state as 'accepted'|'waived'})),sources:[...new Map(admitted.flatMap(row=>graph.closures.get(nativeSourceKey(refs.find(ref=>ref.revisionId===row.id)!))!).map(source=>[nativeSourceKey(source),source])).values()],reviewRequired:rows.length-admitted.length};
}
