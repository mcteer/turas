import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ExecutionAdviceScope } from "../../execution/advice";
import type { ExpansionAdviceScope } from "../expansion/context";
import type { SupportAdviceScope } from "../support/context";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { planningScopeForConversation, type PlanningScope } from "../plans/context";
import { staffingScopeForConversation, type StaffingScope } from "../staffing/context";

export type ConversationFeature = { kind: "normal" } | { kind: "planning"; scope: PlanningScope } |
  { kind: "staffing"; scope: StaffingScope } | { kind: "execution"; scope: ExecutionAdviceScope } |
  { kind: "support"; scope: SupportAdviceScope } | { kind: "expansion"; scope: ExpansionAdviceScope };
export type FeaturePrincipal = { principalId?: string; attributes?: Record<string, unknown> } | null | undefined;
/** Association metadata only. Each content path still performs current authority
 * and its complete dependency fence. Ambiguous bindings never fall through. */
export async function conversationFeature(db: PoolClient, conversationId: string): Promise<ConversationFeature> {
  const conversation = (await db.query("SELECT id FROM conversations WHERE id=$1 AND environment_id=$2", [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!conversation) throw hiddenRecord();
  const marker = Number((await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0]?.schema_version ?? 0);
  const planning = await planningScopeForConversation(db, conversationId), staffing = await staffingScopeForConversation(db, conversationId);
  const execution = marker >= 38 ? (await db.query(`SELECT id,customer_id,owner_membership_id,engagement_id,baseline_id,generation,from_date::text,to_date::text
    FROM execution_advice_bindings WHERE conversation_id=$1 AND environment_id=$2`, [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0] : null;
   const support = marker >= 43 ? (await db.query(`SELECT id,customer_id,workload_id,audience,owner_membership_id,selected_engagement_ids
     FROM support_advice_bindings WHERE conversation_id=$1 AND environment_id=$2`, [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0] : null;
   const expansion=marker>=47?(await db.query(`SELECT id,scope_id,customer_id,workload_id,owner_membership_id,selected_engagement_ids,selected_hypothesis_ids
     FROM expansion_advice_bindings WHERE conversation_id=$1 AND environment_id=$2`,[conversationId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]:null;
   if ([planning, staffing, execution, support, expansion].filter(Boolean).length > 1) throw new HttpFailure(409, "conversation_feature_conflict", "Conversation scope is unavailable");
   if(expansion)return {kind:'expansion',scope:{bindingId:expansion.id,scopeId:expansion.scope_id,conversationId,customerId:expansion.customer_id,workloadId:expansion.workload_id,ownerMembershipId:expansion.owner_membership_id,audience:'internal',selectedEngagementIds:expansion.selected_engagement_ids,selectedHypothesisIds:expansion.selected_hypothesis_ids}};
   if (support) return { kind: "support", scope: { bindingId: support.id, conversationId, customerId: support.customer_id,
     ownerMembershipId: support.owner_membership_id, workloadId: support.workload_id, audience: support.audience,
     selectedEngagementIds: support.selected_engagement_ids } };
  if (execution) return { kind: "execution", scope: { bindingId: execution.id, conversationId, customerId: execution.customer_id,
    ownerMembershipId: execution.owner_membership_id, engagementId: execution.engagement_id, baselineId: execution.baseline_id,
    generation: Number(execution.generation), period: { from: execution.from_date, to: execution.to_date } } };
  if (staffing) return { kind: "staffing", scope: staffing };
  if (planning) return { kind: "planning", scope: planning };
  return { kind: "normal" };
}
export async function responseFeature(principal: FeaturePrincipal): Promise<ConversationFeature | null> {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (attemptId === undefined) return null;
  if (!z.uuid().safeParse(attemptId).success || !z.uuid().safeParse(principal?.principalId).success) throw hiddenRecord();
  return withTransaction(async db => {
    const row = (await db.query(`SELECT r.conversation_id FROM response_attempts r JOIN conversations c ON c.id=r.conversation_id
      WHERE r.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3`, [attemptId, principal!.principalId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row) throw hiddenRecord();
    return conversationFeature(db, row.conversation_id);
  });
}
/** Must precede the first feature binding. Direct SQL is independently guarded
 * by the migration trigger using this same conversation-row mutex. */
export async function assertFreshFeatureConversation(db: PoolClient, conversationId: string) {
  const row = (await db.query("SELECT id FROM conversations WHERE id=$1 AND environment_id=$2 FOR UPDATE", [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  if ((await conversationFeature(db, conversationId)).kind !== "normal" || (await db.query(`SELECT 1 WHERE
    EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=$1) OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=$1)
    OR EXISTS(SELECT 1 FROM event_projections WHERE conversation_id=$1) OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=$1)`, [conversationId])).rowCount)
    throw new HttpFailure(409, "conversation_already_bound", "Start a fresh conversation for this workflow");
}
