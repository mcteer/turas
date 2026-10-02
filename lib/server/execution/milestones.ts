import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { ExecutionActor } from "./policy";
import { requireExecutionCapability } from "./policy";
import type { ExecutionCommand,ExecutionRecordContent } from "./schema";
import { executionBaseline,lockExecutionHead,advanceExecution } from "./baselines";
import { verifyExecutionSources,type ExecutionSource } from "./sources";
import { assertExecutionPreview } from "./previews";
type MilestoneCommand=Extract<ExecutionCommand,{action:'milestone.decide'}>;
const transitions:Record<string,Partial<Record<string,string>>>={
  not_started:{start:'in_progress',waive:'waived'},in_progress:{block:'blocked',request_review:'ready_for_review',waive:'waived'},
  blocked:{resume:'in_progress',request_review:'ready_for_review',waive:'waived'},ready_for_review:{accept:'accepted',waive:'waived'},
  accepted:{reopen:'in_progress'},waived:{reopen:'in_progress'},
};
export function milestoneTransition(state:string,decision:string):string {
  const next=transitions[state]?.[decision];
  if (!next) throw new HttpFailure(422,'approval_blocked','Milestone transition is not available'); return next;
}
export async function milestoneReviewInputs(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:Pick<MilestoneCommand,'action'|'expectedVersions'|'payload'>) {
  requireExecutionCapability(actor,'review');
  const baseline=await executionBaseline(db,actor,customerId,engagementId,command.payload.baselineId,true);
  const refs:ExecutionSource[]=[{id:baseline.id,kind:'milestone_baseline',sourceRevisionId:baseline.id,generation:Number(baseline.baseline_number),contentDigest:baseline.content_digest}];
  if (command.payload.decision==='accept' && command.payload.evidenceRevisionIds.length===0) throw new HttpFailure(422,'approval_blocked','Reviewed evidence is required');
  const evidence=(await db.query<{id:string;revision_number:string;content_digest:string}>(`SELECT v.id,v.revision_number,v.content_digest FROM execution_record_revisions v
    JOIN execution_records r ON r.id=v.record_id WHERE v.id=ANY($1::uuid[]) AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4
      AND v.engagement_id=$5 AND v.baseline_id=$6 AND r.accepted_revision_id=v.id`,
    [command.payload.evidenceRevisionIds,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,baseline.id])).rows;
  if (evidence.length!==command.payload.evidenceRevisionIds.length) throw new HttpFailure(409,'source_changed','Reviewed evidence changed');
  for (const e of evidence) refs.push({id:e.id,kind:'execution_record',sourceRevisionId:e.id,generation:Number(e.revision_number),contentDigest:e.content_digest});
  const sourceDigest=await verifyExecutionSources(db,actor,customerId,engagementId,baseline.audience,refs,true);
  const execution=await lockExecutionHead(db,actor,engagementId,command.expectedVersions.execution);
  if (execution.current_baseline_id!==baseline.id) throw new HttpFailure(409,'source_changed','Reconcile the current baseline');
  const milestone=(await db.query<{id:string;version:string;state:string}>(`SELECT id,version,state FROM execution_milestone_heads
    WHERE baseline_id=$1 AND milestone_key=$2 AND engagement_id=$3 FOR UPDATE`,[baseline.id,command.payload.milestoneKey,engagementId])).rows[0];
  if (!milestone) throw hiddenRecord();
  if (Number(milestone.version)!==command.expectedVersions.milestone) throw new HttpFailure(409,'stale_version','Milestone changed; refresh');
  const next=milestoneTransition(milestone.state,command.payload.decision);
  return {execution,milestone,next,inputs:{action:command.action,expectedVersions:command.expectedVersions,payload:command.payload,
    sourceDigest,baselineId:baseline.id,activeBaselineId:baseline.active_baseline_id,generation:Number(execution.generation),state:milestone.state}};
}
async function appendMilestone(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,milestone:{id:string;version:string;state:string},decision:string,
  evidenceRevisionIds:string[],requestKey:string,rationale:string) {
  const id=randomUUID(),next=milestoneTransition(milestone.state,decision);
  await db.query(`INSERT INTO execution_milestone_events(id,environment_id,workspace_id,customer_id,engagement_id,milestone_id,action,expected_version,evidence_revision_ids,request_key,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,milestone.id,decision,
      Number(milestone.version),evidenceRevisionIds,requestKey,actor.membershipId]);
  await db.query('INSERT INTO execution_milestone_payloads(event_id,rationale) VALUES($1,$2)',[id,rationale]);
  await db.query('UPDATE execution_milestone_heads SET state=$2,current_event_id=$3,version=version+1 WHERE id=$1',[milestone.id,next,id]);
}
export async function decideMilestone(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:MilestoneCommand) {
  const context=await milestoneReviewInputs(db,actor,customerId,engagementId,command); assertExecutionPreview(actor,context.inputs,command);
  await appendMilestone(db,actor,customerId,engagementId,context.milestone,command.payload.decision,command.payload.evidenceRevisionIds,command.requestKey,command.rationale);
  const next=await advanceExecution(db,context.execution,true);
  return {state:'committed' as const,executionGeneration:next.generation,changed:[{id:context.milestone.id,version:Number(context.milestone.version)+1},{id:context.execution.id,version:next.version}]};
}
export async function applyActivityMilestone(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,milestone:{id:string;version:string;state:string},
  content:ExecutionRecordContent,command:Extract<ExecutionCommand,{action:'record.accept'|'record.reject'|'record.retract'}>) {
  if (content.subtype==='milestone_review_request') await appendMilestone(db,actor,customerId,engagementId,milestone,'request_review',[command.payload.revisionId],command.requestKey,command.rationale);
  else if (content.subtype==='milestone_plan') {
    if (Number(milestone.version)!==content.milestoneVersion) throw new HttpFailure(409,'stale_version','Milestone changed; refresh');
    await db.query('UPDATE execution_milestone_heads SET version=version+1 WHERE id=$1',[milestone.id]);
  }
  void baselineId;
}
