import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { requirePlanningConversation,planningScopeForConversation } from "./context";
import { requireActivePlanWorkload,requirePlanCapability } from "./policy";
import { loadPlan } from "./repository";
import { currentPlanSourceDigest } from "./sources";

/** A planning binding stays scoped through stream, history and tool replay. */
export async function assertPlanConversationFence(client:PoolClient,
  actor:CurrentSession,conversationId:string):Promise<void> {
  const scope=await planningScopeForConversation(client,conversationId);
  if (!scope) return;
  if (scope.ownerMembershipId!==actor.membershipId) throw hiddenRecord();
  await requirePlanningConversation(client,conversationId,actor);
  const plan=await loadPlan(client,actor,scope.planId);
  requirePlanCapability(actor,plan,"read");
  const locked=await client.query<{working_revision_id:string|null;
    aggregate_version:string}>(`SELECT working_revision_id,aggregate_version
    FROM delivery_plans WHERE id=$1 FOR SHARE`,[plan.id]);
  await requireActivePlanWorkload(client,actor,plan.customer_id,plan.workload_id);
  const found=await client.query<{state:string;base_revision_id:string;
    base_aggregate_version:string;result_revision_id:string|null;
    actor_session_id:string;actor_membership_id:string;
    response_state:string|null}>(`
    SELECT drafting.state,drafting.base_revision_id,drafting.base_aggregate_version,
      drafting.result_revision_id,drafting.actor_session_id,
      drafting.actor_membership_id,response.response_state
    FROM plan_drafting_attempts drafting
    LEFT JOIN response_attempts response ON response.id=drafting.response_attempt_id
    WHERE drafting.conversation_id=$1`,[conversationId]);
  const attempt=found.rows[0];
  if (!locked.rows[0] || !attempt || attempt.actor_session_id!==actor.sessionId ||
      attempt.actor_membership_id!==actor.membershipId ||
      ["stopping","cancelled"].includes(attempt.response_state ?? "") ||
      !["running","saved"].includes(attempt.state)) throw hiddenRecord();
  const revisionId=attempt.state==="saved" ? attempt.result_revision_id:
    attempt.base_revision_id;
  if (!revisionId || locked.rows[0].working_revision_id!==revisionId ||
      (attempt.state==="running" &&
        locked.rows[0].aggregate_version!==attempt.base_aggregate_version)) {
    throw new HttpFailure(409,"plan_draft_changed","Plan drafting context changed");
  }
  await currentPlanSourceDigest(client,actor,revisionId,plan.customer_id,
    plan.workload_id,plan.audience,true);
}
