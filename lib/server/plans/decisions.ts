import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ZodError } from "zod";
import { HttpFailure } from "../../contracts/http";
import { planDecisionSchema,planReviewPreviewSchema,planSha256,
  type PlanDecisionInput } from "../../contracts/plans";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import type { PlanActor,PlanScope } from "./policy";
import { lockPlanActor,requirePlanCapability } from "./policy";
import { loadPlan,latestPlanRevision } from "./repository";
import { currentPlanSourceDigest } from "./sources";
import { planAcceptanceReadiness,type PlanReadiness } from "./validation";
import { planDraftContentSchema } from "../../contracts/plan-content";
import { assessPlanEvidence } from "./sources";
import { prepareBaseline,persistBaseline,type BaselineTarget } from "./baselines";
import { recordPlanMetric } from "./telemetry";

type PreviewInput=typeof planReviewPreviewSchema._output;
export type PlanPreview={contractVersion:"delivery-plan-v1";previewId:string;
  planId:string;revisionId:string;contentDigest:string;aggregateVersion:number;
  sourceStateDigest:string;expiresAt:string;readiness:PlanReadiness;
  content:unknown};
export type PlanDecisionResult={contractVersion:"delivery-plan-v1";decisionId:string;
  planId:string;revisionId:string;action:PlanDecisionInput["action"];
  aggregateVersion:number;engagementId:string|null;baselineId:string|null};

function parse<T>(raw:unknown,schema:{parse:(input:unknown)=>T}):T {
  try {return schema.parse(raw);}
  catch(error) {
    if (error instanceof ZodError) throw new HttpFailure(422,"invalid_plan_decision",
      "Invalid plan review request");
    throw error;
  }
}
async function inSavepoint<T>(client:PoolClient,run:()=>Promise<T>):Promise<T> {
  await client.query("SAVEPOINT turas_plan_review");
  try {
    const result=await run();
    await client.query("RELEASE SAVEPOINT turas_plan_review");
    return result;
  } catch(error) {
    await client.query("ROLLBACK TO SAVEPOINT turas_plan_review");
    await client.query("RELEASE SAVEPOINT turas_plan_review");
    throw error;
  }
}
async function receipt(client:PoolClient,actor:PlanActor,plan:PlanScope,
  requestKey:string,digest:string):Promise<Record<string,unknown>|null> {
  const prior=await client.query<{request_digest:string;result_ids:Record<string,unknown>}>(
    `SELECT request_digest,result_ids FROM plan_command_receipts
      WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3
        AND request_key=$4`,
    [plan.environment_id,plan.workspace_id,actor.membershipId,requestKey]);
  if (!prior.rows[0]) return null;
  if (prior.rows[0].request_digest!==digest) throw new HttpFailure(409,
    "request_key_conflict","Request key already used");
  return prior.rows[0].result_ids;
}
async function storeReceipt(client:PoolClient,actor:PlanActor,plan:PlanScope,
  requestKey:string,requestDigest:string,action:string,result:object,version:number) {
  await client.query(`INSERT INTO plan_command_receipts
    (id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,
     action,request_digest,plan_id,result_ids,result_version,outcome_code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed')`,
  [randomUUID(),plan.environment_id,plan.workspace_id,plan.customer_id,
    actor.membershipId,requestKey,action,requestDigest,plan.id,
    JSON.stringify(result),version]);
}
async function reviewBody(client:PoolClient,plan:PlanScope,revisionId:string,
  contentDigest:string,version:number):Promise<Record<string,unknown>> {
  if (plan.working_revision_id!==revisionId || Number(plan.aggregate_version)!==version) {
    throw new HttpFailure(409,"stale_plan","Plan changed; reload before review");
  }
  const revision=await latestPlanRevision(client,plan.id,revisionId);
  if (revision.content_digest!==contentDigest) {
    throw new HttpFailure(409,"stale_plan","Plan changed; reload before review");
  }
  const state=await client.query<{state:string}>(`SELECT state FROM plan_revision_events
    WHERE revision_id=$1 ORDER BY event_order DESC LIMIT 1`,[revisionId]);
  if (state.rows[0]?.state!=="in_review") {
    throw new HttpFailure(409,"stale_review","Revision is no longer in review");
  }
  const payload=await client.query<{content:Record<string,unknown>}>(
    "SELECT content FROM plan_revision_payloads WHERE revision_id=$1",[revisionId]);
  if (!payload.rows[0]) throw new HttpFailure(409,"plan_purged","Plan content unavailable");
  const stored=payload.rows[0].content;
  return {...stored,sections:Array.isArray(stored.sections) ? stored.sections.filter((item)=>
    typeof item==="object" && item!==null &&
    !["evidence","decision"].includes((item as {key?:string}).key ?? "")):[]};
}

export async function createPlanReviewPreview(actor:PlanActor,planId:string,raw:unknown,
  existingClient?:PoolClient):Promise<PlanPreview> {
  const input=parse(raw,planReviewPreviewSchema);
  const run=async(client:PoolClient):Promise<PlanPreview>=>{
    const candidate=await loadPlan(client,actor,planId);
    await lockPlanActor(client,actor,candidate.customer_id,true,undefined,true);
    requirePlanCapability(actor,candidate,"review");
    const requestDigest=planSha256({action:"review_preview",...input,planId});
    const previous=await receipt(client,actor,candidate,input.requestKey,requestDigest);
    const plan=await loadPlan(client,actor,planId,true);
    const content=await reviewBody(client,plan,input.revisionId,
      input.contentDigest,input.expectedAggregateVersion);
    const sourceStateDigest=await currentPlanSourceDigest(client,actor,input.revisionId,
      plan.customer_id,plan.workload_id,plan.audience,true,true);
    const evidence=await assessPlanEvidence(client,actor,plan.customer_id,
      planDraftContentSchema.parse(content));
    const readiness=planAcceptanceReadiness(content,evidence.issues);
    if (previous) {
      const previewId=String(previous.previewId ?? "");
      const saved=await client.query<{expires_at:Date;actor_session_id:string;
        source_state_digest:string}>(`SELECT expires_at,actor_session_id,source_state_digest
        FROM plan_review_previews WHERE id=$1 AND plan_id=$2`,[previewId,plan.id]);
      if (!saved.rows[0] || saved.rows[0].expires_at.getTime()<=Date.now() ||
          saved.rows[0].actor_session_id!==actor.sessionId ||
          saved.rows[0].source_state_digest!==sourceStateDigest) {
        throw new HttpFailure(409,"stale_review","Review preview changed");
      }
      return {contractVersion:"delivery-plan-v1",previewId,planId:plan.id,
        revisionId:input.revisionId,contentDigest:input.contentDigest,
        aggregateVersion:input.expectedAggregateVersion,sourceStateDigest,
        expiresAt:saved.rows[0].expires_at.toISOString(),readiness,content};
    }
    const previewId=randomUUID();
    const inserted=await client.query<{expires_at:Date}>(`INSERT INTO plan_review_previews
      (id,environment_id,workspace_id,customer_id,plan_id,revision_id,
       actor_session_id,actor_membership_id,content_digest,aggregate_version,
       source_state_digest,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+interval '10 minutes')
      RETURNING expires_at`,
    [previewId,plan.environment_id,plan.workspace_id,plan.customer_id,plan.id,
      input.revisionId,actor.sessionId,actor.membershipId,input.contentDigest,
      input.expectedAggregateVersion,sourceStateDigest]);
    await storeReceipt(client,actor,plan,input.requestKey,requestDigest,
      "review_preview",{previewId},input.expectedAggregateVersion);
    return {contractVersion:"delivery-plan-v1",previewId,planId:plan.id,
      revisionId:input.revisionId,contentDigest:input.contentDigest,
      aggregateVersion:input.expectedAggregateVersion,sourceStateDigest,
      expiresAt:inserted.rows[0].expires_at.toISOString(),readiness,content};
  };
  return existingClient ? inSavepoint(existingClient,()=>run(existingClient)) : withTransaction(run);
}

export async function decidePlan(actor:PlanActor,planId:string,raw:unknown,
  existingClient?:PoolClient):Promise<PlanDecisionResult> {
  const started=Date.now();
  const input=parse(raw,planDecisionSchema);
  const run=async(client:PoolClient):Promise<PlanDecisionResult>=>{
    const candidate=await loadPlan(client,actor,planId);
    await lockPlanActor(client,actor,candidate.customer_id,true,undefined,true);
    requirePlanCapability(actor,candidate,"review");
    const requestDigest=planSha256({...input,planId});
    const previous=await receipt(client,actor,candidate,input.requestKey,requestDigest);
    if (previous) {
      // A receipt preserves the decision identity, but cannot reopen source content
      // after a withdrawal or a grant change.
      await currentPlanSourceDigest(client,actor,input.revisionId,
        candidate.customer_id,candidate.workload_id,candidate.audience,false,true);
      return previous as PlanDecisionResult;
    }
    const plan=await loadPlan(client,actor,planId,true);
    const preview=await client.query<{revision_id:string;actor_session_id:string;
      actor_membership_id:string;content_digest:string;aggregate_version:string;
      source_state_digest:string;expires_at:Date;used_decision_id:string|null}>(
      `SELECT revision_id,actor_session_id,actor_membership_id,content_digest,
        aggregate_version,source_state_digest,expires_at,used_decision_id
        FROM plan_review_previews WHERE id=$1 AND plan_id=$2 FOR UPDATE`,
      [input.reviewPreviewId,plan.id]);
    const bound=preview.rows[0];
    if (!bound || bound.actor_session_id!==actor.sessionId ||
        bound.actor_membership_id!==actor.membershipId ||
        bound.revision_id!==input.revisionId ||
        bound.content_digest!==input.contentDigest ||
        Number(bound.aggregate_version)!==input.expectedAggregateVersion ||
        bound.used_decision_id || bound.expires_at.getTime()<=Date.now()) {
      throw new HttpFailure(409,"stale_review","Review preview expired or changed");
    }
    const content=await reviewBody(client,plan,input.revisionId,
      input.contentDigest,input.expectedAggregateVersion);
    const sourceStateDigest=await currentPlanSourceDigest(client,actor,input.revisionId,
      plan.customer_id,plan.workload_id,plan.audience,true,true);
    if (sourceStateDigest!==bound.source_state_digest) {
      throw new HttpFailure(409,"stale_review","Plan evidence changed");
    }
    if (input.action==="accept") {
      const evidence=await assessPlanEvidence(client,actor,plan.customer_id,
        planDraftContentSchema.parse(content));
      const readiness=planAcceptanceReadiness(content,evidence.issues);
      if (!readiness.ready) throw new HttpFailure(422,"plan_not_ready",
        `Plan needs review: ${readiness.issues[0]?.path ?? "content"}`);
      if (plan.audience==="delivery" && input.deliverySuitabilityConfirmed!==true) {
        throw new HttpFailure(422,"delivery_attestation_required",
          "Confirm delivery suitability before acceptance");
      }
    }
    const decisionId=randomUUID();
    const eventId=randomUUID();
    let baseline:BaselineTarget|null=null;
    if (input.action==="accept") {
      baseline=await prepareBaseline(client,plan,input.engagementId);
    }
    const engagementId=baseline?.engagementId ?? null;
    const baselineId=baseline?.baselineId ?? null;
    await client.query(`INSERT INTO plan_decisions
      (id,environment_id,workspace_id,customer_id,plan_id,revision_id,
       preview_id,actor_membership_id,actor_principal_id,action,content_digest,
       source_state_digest,engagement_id,baseline_id,request_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [decisionId,plan.environment_id,plan.workspace_id,plan.customer_id,plan.id,
      input.revisionId,input.reviewPreviewId,actor.membershipId,actor.principalId,
      input.action,input.contentDigest,sourceStateDigest,engagementId,baselineId,
      input.requestKey]);
    await client.query(`INSERT INTO plan_decision_payloads(decision_id,rationale) VALUES($1,$2)`,
      [decisionId,input.rationale]);
    await client.query(`INSERT INTO plan_revision_events
      (id,plan_id,revision_id,state,actor_membership_id,operation_id)
      VALUES($1,$2,$3,$4,$5,$6)`,
    [eventId,plan.id,input.revisionId,input.action==="accept" ? "accepted" :
      input.action==="reject" ? "rejected":"changes_requested",actor.membershipId,randomUUID()]);
    await client.query("INSERT INTO plan_event_payloads(event_id,rationale) VALUES($1,$2)",
      [eventId,input.rationale]);
    if (baseline) {
      await persistBaseline(client,plan,baseline,input.revisionId,
        input.contentDigest,decisionId,content);
      if (plan.accepted_revision_id) {
        await client.query(`INSERT INTO plan_revision_events
          (id,plan_id,revision_id,state,actor_membership_id,operation_id)
          VALUES($1,$2,$3,'superseded',$4,$5)`,
        [randomUUID(),plan.id,plan.accepted_revision_id,actor.membershipId,randomUUID()]);
      }
    }
    const version=Number(plan.aggregate_version)+1;
    await client.query(`UPDATE delivery_plans SET aggregate_version=$2,
      accepted_revision_id=COALESCE($3,accepted_revision_id),
      engagement_id=COALESCE($4,engagement_id),updated_at=now() WHERE id=$1`,
    [plan.id,version,input.action==="accept" ? input.revisionId:null,engagementId]);
    await client.query("UPDATE plan_review_previews SET used_decision_id=$2 WHERE id=$1",
      [input.reviewPreviewId,decisionId]);
    const result:PlanDecisionResult={contractVersion:"delivery-plan-v1",decisionId,
      planId:plan.id,revisionId:input.revisionId,action:input.action,
      aggregateVersion:version,engagementId,baselineId};
    await storeReceipt(client,actor,plan,input.requestKey,requestDigest,
      `decision_${input.action}`,result,version);
    recordPlanMetric("transition_count",1);
    return result;
  };
  try {
    return await (existingClient ? inSavepoint(existingClient,()=>run(existingClient)) :
      withTransaction(run));
  } catch(error) {
    if(error instanceof HttpFailure && error.status===409)
      recordPlanMetric("conflict_count",1);
    if ((error as {code?:string}).code==="55P03" ||
        (error instanceof Error &&
          error.message==="timeout exceeded when trying to connect")) {
      recordPlanMetric("conflict_count",1);
      throw new HttpFailure(409,"decision_conflict",
        "Plan decision is busy; reload and reconcile its receipt");
    }
    throw error;
  } finally {
    recordPlanMetric("decision_duration_ms",Math.max(0,Date.now()-started));
  }
}
