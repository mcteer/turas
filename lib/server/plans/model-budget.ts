import { randomUUID } from "node:crypto";
import { wrapLanguageModel } from "ai";
import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { planLimits } from "../../contracts/plans";
import { assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { requirePlanningConversation } from "./context";
import { lockPlanActor,requireActivePlanWorkload,requirePlanCapability,
  type PlanActor } from "./policy";
import { loadPlan } from "./repository";
import { currentPlanSourceDigest } from "./sources";
import { recordPlanMetric } from "./telemetry";

type Model=Parameters<typeof wrapLanguageModel>[0]["model"];

/** Keep the planning output limit inside the provider call for both generate and stream. */
export function wrapPlanModel(model:Model):ReturnType<typeof wrapLanguageModel> {
  return wrapLanguageModel({model,middleware:{
    transformParams:async({params})=>({
      ...params,
      maxOutputTokens:Number.isSafeInteger(params.maxOutputTokens) &&
        (params.maxOutputTokens ?? 0)>0 ?
        Math.min(params.maxOutputTokens!,planLimits.outputTokensPerStep):
        planLimits.outputTokensPerStep,
    }),
  }});
}

export type PlanStepIdentity={nativeSessionId:string;responseAttemptId:string;
  turnId:string;stepIndex:number};

function reportedTokens(usage:unknown,key:"inputTokens"|"outputTokens"):
  number|null {
  if (typeof usage!=="object" || usage===null || !(key in usage)) return null;
  const value=(usage as Record<string,unknown>)[key];
  return typeof value==="number" && Number.isSafeInteger(value) && value>=0 ?
    value:null;
}

/** Native event IDs are deduplicated by the projection before this update runs. */
export async function reconcilePlanModelEvent(client:PoolClient,
  responseAttemptId:string,eventType:string,data:Record<string,unknown>):Promise<boolean|null> {
  const marker=await client.query<{schema_version:number}>(
    "SELECT schema_version FROM turas_environment LIMIT 1");
  if ((marker.rows[0]?.schema_version ?? 0)<31) return null;
  const found=await client.query<{id:string;state:string}>(
    "SELECT id,state FROM plan_drafting_attempts WHERE response_attempt_id=$1",
    [responseAttemptId]);
  const attempt=found.rows[0];
  if (!attempt) return null;
  if (["step.completed","step.failed"].includes(eventType)) {
    if (typeof data.turnId!=="string" || !Number.isSafeInteger(data.stepIndex)) {
      throw new Error("Plan model event identity unavailable");
    }
    const state=eventType==="step.completed" ? "completed":"failed";
    const changed=await client.query(`UPDATE plan_model_step_receipts SET
      provider_state=$4,input_tokens=$5,output_tokens=$6,completed_at=now()
      WHERE attempt_id=$1 AND turn_id=$2 AND step_index=$3
        AND provider_state='started'`,
    [attempt.id,data.turnId,data.stepIndex,state,
      reportedTokens(data.usage,"inputTokens"),
      reportedTokens(data.usage,"outputTokens")]);
    if (!changed.rowCount) {
      const prior=await client.query<{provider_state:string;input_tokens:number|null;
        output_tokens:number|null}>(`SELECT provider_state,input_tokens,output_tokens
        FROM plan_model_step_receipts WHERE attempt_id=$1 AND turn_id=$2
          AND step_index=$3`,[attempt.id,data.turnId,data.stepIndex]);
      if (prior.rows[0]?.provider_state!==state ||
          prior.rows[0]?.input_tokens!==reportedTokens(data.usage,"inputTokens") ||
          prior.rows[0]?.output_tokens!==reportedTokens(data.usage,"outputTokens")) {
        throw new Error("Plan model step receipt conflict");
      }
      return false;
    }
    if(state==="completed") {
      const input=reportedTokens(data.usage,"inputTokens");
      const output=reportedTokens(data.usage,"outputTokens");
      if(input!==null)recordPlanMetric("model_input_tokens",input);
      if(output!==null)recordPlanMetric("model_output_tokens",output);
    }
    return true;
  }
  if (["turn.completed","turn.failed","turn.cancelled"].includes(eventType)) {
    const state=eventType==="turn.cancelled" ? "cancelled":
      eventType==="turn.completed" ? "failed":"unconfirmed";
    await client.query(`UPDATE plan_drafting_attempts SET state=$2,
      safe_error_code=$3,updated_at=now()
      WHERE id=$1 AND state='running'`,
    [attempt.id,state,state==="failed" ? "no_draft_saved":state]);
  }
  return null;
}

/** Reserve one paid call before Eve invokes the provider. A replay never invokes it again. */
export async function admitPlanModelStep(client:PoolClient,actor:PlanActor,
  identity:PlanStepIdentity):Promise<void> {
  if (!Number.isSafeInteger(identity.stepIndex) || identity.stepIndex<0 ||
      identity.stepIndex>=planLimits.modelSteps) {
    throw new HttpFailure(429,"plan_step_budget","Plan drafting model limit reached");
  }
  if (!identity.turnId || identity.turnId.length>200) throw hiddenRecord();
  const selected=await client.query<{conversation_id:string;plan_id:string;
    customer_id:string}>(`SELECT conversation.id AS conversation_id,binding.plan_id,
      binding.customer_id FROM conversations conversation
      JOIN planning_conversation_bindings binding
        ON binding.conversation_id=conversation.id
      WHERE conversation.eve_session_id=$1 AND conversation.owner_principal_id=$2
        AND conversation.environment_id=binding.environment_id`,
  [identity.nativeSessionId,actor.principalId]);
  const bound=selected.rows[0];
  if (!bound) throw hiddenRecord();
  await lockPlanActor(client,actor,bound.customer_id,true,undefined,true);
  await client.query("SET LOCAL lock_timeout = '10000ms'");
  const plan=await loadPlan(client,actor,bound.plan_id,true);
  requirePlanCapability(actor,plan,"draft");
  await requireActivePlanWorkload(client,actor,plan.customer_id,plan.workload_id);
  const scope=await requirePlanningConversation(client,bound.conversation_id,actor);
  if (scope.planId!==plan.id || scope.customerId!==plan.customer_id ||
      scope.workloadId!==plan.workload_id || scope.audience!==plan.audience) {
    throw hiddenRecord();
  }
  const found=await client.query<{id:string;state:string;deadline_at:Date;
    base_revision_id:string;base_aggregate_version:string;
    result_revision_id:string|null;
    response_attempt_id:string|null;steps_admitted:number;
    actor_membership_id:string;actor_session_id:string;response_state:string;
    response_deadline_at:Date|null}>(`
    SELECT drafting.id,drafting.state,drafting.deadline_at,
      drafting.base_revision_id,drafting.base_aggregate_version,
      drafting.result_revision_id,
      drafting.response_attempt_id,drafting.steps_admitted,
      drafting.actor_membership_id,drafting.actor_session_id,
      response.response_state,response.deadline_at AS response_deadline_at
    FROM plan_drafting_attempts drafting
    JOIN response_attempts response ON response.id=drafting.response_attempt_id
    WHERE drafting.conversation_id=$1 AND drafting.plan_id=$2 FOR UPDATE OF drafting`,
  [bound.conversation_id,plan.id]);
  const attempt=found.rows[0];
  const expectedRevision=attempt?.state==="saved" ?
    attempt.result_revision_id:attempt?.base_revision_id;
  const expectedVersion=attempt?.state==="saved" ?
    Number(attempt.base_aggregate_version)+1:Number(attempt?.base_aggregate_version);
  if (!attempt || attempt.response_attempt_id!==identity.responseAttemptId ||
      attempt.actor_membership_id!==actor.membershipId ||
      attempt.actor_session_id!==actor.sessionId ||
      !["running","saved"].includes(attempt.state) ||
      attempt.deadline_at.getTime()<=Date.now() ||
      !["pending","running"].includes(attempt.response_state) ||
      (attempt.response_deadline_at &&
        attempt.response_deadline_at.getTime()<=Date.now()) ||
      Number(plan.aggregate_version)!==expectedVersion ||
      plan.working_revision_id!==expectedRevision) {
    throw new HttpFailure(409,"plan_draft_changed","Plan drafting context changed");
  }
  await currentPlanSourceDigest(client,actor,expectedRevision!,
    plan.customer_id,plan.workload_id,plan.audience,true);
  await assertArtifactDependenciesCurrent(client,bound.conversation_id);
  await assertRetrievalDependenciesCurrent(client,bound.conversation_id);
  const prior=await client.query(`SELECT 1 FROM plan_model_step_receipts
    WHERE attempt_id=$1 AND turn_id=$2 AND step_index=$3`,
  [attempt.id,identity.turnId,identity.stepIndex]);
  if (prior.rowCount) throw new HttpFailure(409,"plan_step_uncertain",
    "A previous model call may have run; review the saved result");
  if (Number(attempt.steps_admitted)>=planLimits.modelSteps) {
    throw new HttpFailure(429,"plan_step_budget","Plan drafting model limit reached");
  }
  await client.query(`INSERT INTO plan_model_step_receipts
    (attempt_id,turn_id,step_index,operation_id,provider_state,provider_started_at)
    VALUES($1,$2,$3,$4,'started',now())`,
  [attempt.id,identity.turnId,identity.stepIndex,randomUUID()]);
  await client.query(`UPDATE plan_drafting_attempts SET steps_admitted=steps_admitted+1,
    updated_at=now() WHERE id=$1`,[attempt.id]);
}
