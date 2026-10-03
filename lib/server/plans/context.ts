import { assertFreshFeatureConversation } from "../conversations/feature";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import type { PlanActor,PlanScope } from "./policy";

export type PlanningScope={planId:string;customerId:string;workloadId:string|null;
  audience:"internal"|"delivery";ownerMembershipId:string};

/** Bind before Eve can receive a first message; the database trigger rejects a populated chat. */
export async function createFreshPlanConversation(client:PoolClient,actor:PlanActor,
  plan:PlanScope):Promise<{conversationId:string;operationId:string}> {
  const state=await client.query<{internal_generation:string;delivery_generation:string}>(
    "SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2",
    [plan.customer_id,plan.workspace_id]);
  if (!state.rows[0]) throw hiddenRecord();
  const generation=plan.audience==="internal" ? state.rows[0].internal_generation:
    state.rows[0].delivery_generation;
  const conversationId=randomUUID(),operationId=randomUUID();
  await client.query(`INSERT INTO conversations
    (id,environment_id,workspace_id,customer_id,owner_principal_id,
     creation_operation_id,binding_state,title,context_audience,
     context_generation,context_snapshot_schema,context_login_session_id,
     context_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Plan drafting',$7,$8,
      'customer-context-v1',$9,$10)`,
  [conversationId,plan.environment_id,plan.workspace_id,plan.customer_id,
    actor.principalId,operationId,plan.audience,generation,
    actor.sessionId,actor.membershipId]);
  await assertFreshFeatureConversation(client,conversationId);
  await client.query(`INSERT INTO planning_conversation_bindings
    (conversation_id,environment_id,workspace_id,customer_id,workload_id,
     plan_id,audience,owner_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
  [conversationId,plan.environment_id,plan.workspace_id,plan.customer_id,
    plan.workload_id,plan.id,plan.audience,actor.membershipId]);
  return {conversationId,operationId};
}

export async function planningScopeForConversation(client:PoolClient,
  conversationId:string):Promise<PlanningScope|null> {
  const marker=await client.query<{schema_version:number}>(
    "SELECT schema_version FROM turas_environment LIMIT 1");
  if ((marker.rows[0]?.schema_version ?? 0)<31) return null;
  const bound=await client.query<{plan_id:string;customer_id:string;workload_id:string|null;
    audience:"internal"|"delivery";owner_membership_id:string}>(
    `SELECT plan_id,customer_id,workload_id,audience,owner_membership_id
      FROM planning_conversation_bindings WHERE conversation_id=$1`,[conversationId]);
  const row=bound.rows[0];
  if (!row) return null;
  return {planId:row.plan_id,customerId:row.customer_id,
    workloadId:row.workload_id,audience:row.audience,
    ownerMembershipId:row.owner_membership_id};
}

export async function requirePlanningConversation(client:PoolClient,
  conversationId:string,actor:PlanActor):Promise<PlanningScope> {
  const binding=await planningScopeForConversation(client,conversationId);
  if (!binding || binding.ownerMembershipId!==actor.membershipId) throw hiddenRecord();
  const state=await client.query<{audience:string;context_generation:string;
    internal_generation:string;delivery_generation:string}>(`
    SELECT conversation.context_audience AS audience,conversation.context_generation,
      profile.internal_generation,profile.delivery_generation
    FROM conversations conversation JOIN customer_profile_state profile
      ON profile.customer_id=conversation.customer_id
    WHERE conversation.id=$1`,[conversationId]);
  const row=state.rows[0];
  const generation=binding.audience==="internal" ? row?.internal_generation:
    row?.delivery_generation;
  if (!row || row.audience!==binding.audience || row.context_generation!==generation) {
    throw new HttpFailure(409,"context_changed","Start a new planning conversation");
  }
  return binding;
}
