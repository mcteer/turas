import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { ExecutionActor } from "./policy";
import { requireExecutionCapability } from "./policy";
import type { ExecutionCommand,ExecutionRecordContent } from "./schema";
import { executionDigest } from "./commands";
import { executionBaseline,lockExecutionHead,advanceExecution } from "./baselines";
import { executionRecordHead,validateRecordContent,lockRecordContext } from "./records";
import {closeoutReviewInputs,recordCloseout} from "./closeout";
import {effortReviewInputs,acceptEffort} from "./effort";
import {registerReviewInputs,applyDecisionSupersessions} from "./registers";
import { verifyExecutionSources } from "./sources";
import { assertExecutionPreview } from "./previews";
import { applyActivityMilestone } from "./milestones";
import { enqueueExecutionSourceInvalidation } from "./invalidation";
import {refreshReportScopeWatches} from '../reports/invalidation';
type RecordReview = Extract<ExecutionCommand,{action:'record.accept'|'record.reject'|'record.retract'}>;
export async function recordReviewInputs(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:Pick<RecordReview,'action'|'expectedVersions'|'payload'>) {
  requireExecutionCapability(actor,'review');
  const record=await executionRecordHead(db,actor,engagementId,command.payload.recordId);
  let baseline=await executionBaseline(db,actor,customerId,engagementId,record.baseline_id);
  const revision=(await db.query<{content_digest:string;content:ExecutionRecordContent}>(`SELECT v.content_digest,p.content FROM execution_record_revisions v
    LEFT JOIN execution_record_payloads p ON p.revision_id=v.id WHERE v.id=$1 AND v.record_id=$2`,[command.payload.revisionId,record.id])).rows[0];
  if (!revision) throw hiddenRecord();
  let sourceDigest:string|null=null;
  let effectiveBaselineId=baseline.id;
  if (command.action==='record.accept') {
    if (!revision.content) throw new HttpFailure(409,'source_changed','Candidate content unavailable');
    const context=await lockRecordContext(db,actor,customerId,engagementId,baseline.id,revision.content,command.payload.revisionId);
    sourceDigest=context.sourceDigest;baseline=context.baseline;effectiveBaselineId=context.effectiveBaselineId;
  } else {await db.query("SELECT id FROM delivery_plans WHERE id=$1 FOR UPDATE",[baseline.plan_id]);await db.query('SELECT id FROM engagements WHERE id=$1 FOR UPDATE',[engagementId]);}
  const execution=await lockExecutionHead(db,actor,engagementId,command.expectedVersions.execution);
  const effort=command.action==='record.accept'?await effortReviewInputs(db,engagementId,baseline.id,record.id,revision.content):null;
  const targetIds=command.action==='record.accept'&&revision.content.kind==='decision'?revision.content.supersededDecisionIds??[]:[];
  await db.query("SELECT id FROM execution_records WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[record.id,...targetIds,...(effort?.previous??[]).map(r=>r.id)].sort()]);
  const current=await executionRecordHead(db,actor,engagementId,record.id,true);
  const exactRevision=command.action==='record.retract'?current.accepted_revision_id:current.current_revision_id;
  if (Number(current.version)!==command.expectedVersions.record || exactRevision!==command.payload.revisionId || revision.content_digest!==command.payload.contentDigest)
    throw new HttpFailure(409,'stale_version','Review candidate changed; refresh');
  if (command.action!=='record.retract' && current.state!=='submitted') throw new HttpFailure(422,'approval_blocked','Submitted candidate required');
  if (command.action==='record.accept') {
    if(revision.content.kind==='activity'&&revision.content.subtype!=='work'&&baseline.audience==='delivery'&&revision.content.audience!=='delivery')throw new HttpFailure(422,'approval_blocked','Delivery milestone changes require delivery-safe evidence');
    if (execution.current_baseline_id!==effectiveBaselineId) throw new HttpFailure(409,'source_changed','Reconcile the current baseline');
    await validateRecordContent(db,actor,customerId,engagementId,baseline.id,revision.content);
  }
  const superseded=command.action==='record.accept'?[...await registerReviewInputs(db,actor,engagementId,record.id,revision.content),...(effort?.previous??[])]:[];
  const milestone = revision.content?.kind==='activity' && revision.content.subtype!=='work' ?
    (await db.query('SELECT id,version,state FROM execution_milestone_heads WHERE baseline_id=$1 AND milestone_key=$2 FOR UPDATE',[baseline.id,revision.content.milestoneKey])).rows[0]:null;
  if (command.action==='record.accept' && milestone && revision.content.kind==='activity'&&revision.content.subtype!=='work' && Number(milestone.version)!==revision.content.milestoneVersion)
    throw new HttpFailure(409,'stale_version','Milestone changed; refresh');
  const closeout=command.action==='record.accept'?await closeoutReviewInputs(db,actor,customerId,engagementId,baseline.id,revision.content):null;
  return {execution,record:current,revision,baseline,milestone,superseded,closeout,inputs:{action:command.action,expectedVersions:command.expectedVersions,payload:command.payload,
    acceptedRevisionId:current.accepted_revision_id,sourceDigest,baselineId:baseline.id,activeBaselineId:baseline.active_baseline_id,
    generation:Number(execution.generation),closeoutDigest:closeout?.inputDigest??null,effortHead:effort?.head??null,milestoneVersion:milestone?Number(milestone.version):null,superseded}};
}
export async function reviewRecord(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:RecordReview) {
  const context=await recordReviewInputs(db,actor,customerId,engagementId,command);
  assertExecutionPreview(actor,context.inputs,command);
  const {record,execution,revision,milestone}=context,version=Number(record.version)+1;
  if (command.action==='record.accept') {
    if (milestone&&revision.content.kind==='activity') await applyActivityMilestone(db,actor,customerId,engagementId,context.baseline.id,milestone,revision.content,command);
    await acceptEffort(db,actor,customerId,engagementId,context.baseline.id,command.payload.revisionId,revision.content);
    await db.query("UPDATE execution_records SET accepted_revision_id=$2,state='accepted',version=$3 WHERE id=$1",[record.id,command.payload.revisionId,version]);
  } else if (command.action==='record.reject') await db.query("UPDATE execution_records SET state='rejected',version=$2 WHERE id=$1",[record.id,version]);
  else await db.query("UPDATE execution_records SET accepted_revision_id=NULL,state=CASE WHEN current_revision_id=accepted_revision_id THEN 'retracted' ELSE state END,version=$2 WHERE id=$1",[record.id,version]);
  const id=randomUUID();
  await db.query(`INSERT INTO execution_review_decisions(id,environment_id,workspace_id,customer_id,engagement_id,record_id,revision_id,action,expected_version,request_key,preview_digest,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,record.id,command.payload.revisionId,
      command.action.slice(7),command.expectedVersions.record,command.requestKey,command.previewDigest,actor.membershipId]);
  await db.query('INSERT INTO execution_review_payloads(decision_id,rationale) VALUES($1,$2)',[id,command.rationale]);
  if(record.accepted_revision_id && ((command.action==='record.accept'&&record.accepted_revision_id!==command.payload.revisionId)||command.action==='record.retract'))
    await enqueueExecutionSourceInvalidation(db,'execution_record',record.accepted_revision_id);
  const superseded=await applyDecisionSupersessions(db,actor,customerId,engagementId,context.superseded,command);
  const next=await advanceExecution(db,execution,command.action!=='record.reject');
  if(context.closeout)await recordCloseout(db,execution.id,command.payload.revisionId,context.closeout);
  if(command.action!=='record.reject')await refreshReportScopeWatches(db,actor.workspaceId,customerId,engagementId);
  return {state:'committed' as const,executionGeneration:next.generation,changed:[{id:record.id,version},...superseded,{id:execution.id,version:next.version}]};
}
