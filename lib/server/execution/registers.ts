import {randomUUID} from "node:crypto";
import {Temporal} from "@js-temporal/polyfill";
import type {PoolClient} from "pg";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import type {ExecutionActor} from "./policy";
import type {ExecutionRecordContent} from "./schema";
import {enqueueExecutionSourceInvalidation} from "./invalidation";
export async function validateRegisterContent(db:PoolClient,actor:ExecutionActor,engagementId:string,baselineId:string,content:ExecutionRecordContent){
  if(content.kind==="decision"&&Temporal.PlainDate.compare(content.decisionDate,Temporal.Now.plainDateISO(content.timezone))>0)
    throw new HttpFailure(422,"invalid_input","Decision date cannot be in the future");
  if(content.kind!=="scope_change")return;
  if(content.oldBaselineId!==baselineId)throw new HttpFailure(422,"invalid_input","Scope change must bind its exact original baseline");
  if(content.replacementBaselineId){
    const baseline=(await db.query(`SELECT id FROM milestone_baselines WHERE id=$1 AND engagement_id=$2 AND environment_id=$3 AND workspace_id=$4`,
      [content.replacementBaselineId,engagementId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
    if(!baseline)throw hiddenRecord();
  }
  if(content.state==="implemented"){
    const reconciled=await db.query(`SELECT 1 FROM execution_reconciliations r JOIN execution_workspaces e ON e.engagement_id=r.engagement_id
      JOIN engagements g ON g.id=r.engagement_id WHERE r.engagement_id=$1 AND r.old_baseline_id=$2 AND r.new_baseline_id=$3
      AND e.current_baseline_id=r.new_baseline_id AND g.active_baseline_id=r.new_baseline_id`,[engagementId,baselineId,content.replacementBaselineId]);
    if(!reconciled.rowCount)throw new HttpFailure(422,"approval_blocked","Accept the replacement through planning and reconcile every item before implementation");
  }
}
type Superseded={id:string;accepted_revision_id:string;current_revision_id:string;version:string;content_digest:string};
export async function registerReviewInputs(db:PoolClient,actor:ExecutionActor,engagementId:string,recordId:string,content:ExecutionRecordContent):Promise<Superseded[]>{
  if(content.kind!=="decision"||!content.supersededDecisionIds?.length)return [];
  if(content.supersededDecisionIds.includes(recordId))throw new HttpFailure(422,"approval_blocked","A decision cannot supersede itself");
  const rows=(await db.query<Superseded>(`SELECT r.id,r.accepted_revision_id,r.current_revision_id,r.version,v.content_digest
    FROM execution_records r JOIN execution_record_revisions v ON v.id=r.accepted_revision_id WHERE r.id=ANY($1::uuid[]) AND r.kind='decision'
      AND r.engagement_id=$2 AND r.workspace_id=$3 AND r.environment_id=$4 AND (v.audience='delivery' OR $5='internal') ORDER BY r.id FOR UPDATE OF r`,
    [content.supersededDecisionIds,engagementId,actor.workspaceId,process.env.TURAS_ENVIRONMENT_ID,content.audience])).rows;
  if(rows.length!==content.supersededDecisionIds.length)throw hiddenRecord();
  if(content.references.some(ref=>rows.some(row=>row.accepted_revision_id===ref.sourceRevisionId)))
    throw new HttpFailure(422,"approval_blocked","A decision cannot use the acceptance it supersedes as supporting evidence");
  return rows;
}
export async function applyDecisionSupersessions(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,rows:Superseded[],
  command:{requestKey:string;previewDigest:string;rationale:string}){
  const changed=[];
  for(const row of rows){
    const id=randomUUID(),version=Number(row.version)+1;
    await db.query(`UPDATE execution_records SET accepted_revision_id=NULL,state=CASE WHEN current_revision_id=accepted_revision_id THEN 'superseded' ELSE state END,
      version=$2 WHERE id=$1`,[row.id,version]);
    await db.query(`INSERT INTO execution_review_decisions(id,environment_id,workspace_id,customer_id,engagement_id,record_id,revision_id,action,expected_version,
      request_key,preview_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,'retract',$8,$9,$10,$11)`,
      [id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,row.id,row.accepted_revision_id,Number(row.version),command.requestKey,command.previewDigest,actor.membershipId]);
    await db.query("INSERT INTO execution_review_payloads(decision_id,rationale) VALUES($1,$2)",[id,command.rationale]);
    await enqueueExecutionSourceInvalidation(db,"execution_record",row.accepted_revision_id);changed.push({id:row.id,version});
  }
  return changed;
}
