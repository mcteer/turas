import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { executionAdviceSchema, executionAdvicePrompt, executionContextCharge, EXECUTION_ADVICE_LIMITS } from "../../execution/advice";
import { getServerConfig } from "../config";
import { assertFreshFeatureConversation, conversationFeature } from "../conversations/feature";
import { executionDigest, executionTransaction } from "./commands";
import { lockExecutionActor, type ExecutionActor } from "./policy";
import { executionCustomer } from "./locks";
import { selectExecutionAdviceInputs, assertExecutionDependencies } from "./dependencies";
import { readExecutionOverviewSnapshot } from "./service";

/** Reserve only an owned fresh conversation and immutable request. Native binding,
 * initial-context capture and provider admission are separate bounded operations. */
export async function prepareExecutionAdvice(actor: ExecutionActor, engagementId: string, raw: unknown) {
  const parsed = executionAdviceSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400, "invalid_input", "Invalid execution explanation request");
  const input = parsed.data, env = getServerConfig().TURAS_ENVIRONMENT_ID, digest = executionDigest({ engagementId, input });
  return executionTransaction(async db => {
    const customerId = await executionCustomer(db, actor, engagementId);
    await lockExecutionActor(db, actor, customerId, "advice", true);
    // One rolling admission mutex also serializes different request keys across
    // clock-hour boundaries. No native or external I/O occurs under this lock.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`execution-advice:${env}:${actor.workspaceId}:${actor.membershipId}`]);
    const prior = (await db.query(`SELECT a.id,a.request_digest,a.conversation_id,a.native_request_id,a.state,a.response_attempt_id,c.creation_operation_id
      FROM execution_advice_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.environment_id=$1
      AND a.workspace_id=$2 AND a.owner_membership_id=$3 AND a.request_key=$4`, [env, actor.workspaceId, actor.membershipId, input.requestKey])).rows[0];
    if (prior && prior.request_digest !== digest) throw new HttpFailure(409, "key_conflict", "Request key has different input");
    if (prior) {
      const feature = await conversationFeature(db, prior.conversation_id);
      const owned = (await db.query("SELECT context_login_session_id,context_membership_id FROM conversations WHERE id=$1 AND owner_principal_id=$2", [prior.conversation_id, actor.principalId])).rows[0];
      if (feature.kind !== "execution" || feature.scope.ownerMembershipId !== actor.membershipId || !owned ||
        owned.context_login_session_id !== actor.sessionId || owned.context_membership_id !== actor.membershipId) throw hiddenRecord();
      if (!["prepared", "running", "completed"].includes(prior.state)) throw new HttpFailure(409, "execution_context_changed", "Execution explanation is no longer active");
      const current = await selectExecutionAdviceInputs(db, actor, feature.scope, prior.id);
      if (prior.state !== "prepared") await assertExecutionDependencies(db, prior.id, current.dependencies);
      return { attemptId: prior.id as string, conversationId: prior.conversation_id as string, operationId: prior.creation_operation_id as string,
        nativeRequestId: prior.native_request_id as string, state: "prepared" as const };
    }
    const view = await readExecutionOverviewSnapshot(db, actor, engagementId, customerId);
    if (!view.initialized || view.reviewRequired || view.generation !== input.expectedGeneration)
      throw new HttpFailure(409, "execution_context_changed", "Refresh the reviewed execution inputs");
    const used = Number((await db.query(`SELECT count(*)::int AS n FROM execution_advice_attempts WHERE environment_id=$1 AND workspace_id=$2
      AND owner_membership_id=$3 AND created_at>clock_timestamp()-interval '1 hour'`, [env, actor.workspaceId, actor.membershipId])).rows[0].n);
    if (used >= EXECUTION_ADVICE_LIMITS.hourlyAdmissions) throw new HttpFailure(429, "execution_advice_limit", "Execution explanation limit reached", 3600);
    const profile = (await db.query("SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR SHARE", [customerId, actor.workspaceId])).rows[0];
    if (!profile) throw hiddenRecord();
    const conversationId = input.conversationId, bindingId = randomUUID(), attemptId = randomUUID(), nativeRequestId = randomUUID();
    const conversation = (await db.query(`SELECT creation_operation_id,customer_id,context_generation,context_snapshot_schema,context_audience,
      context_login_session_id,context_membership_id,binding_state FROM conversations WHERE id=$1 AND owner_principal_id=$2 AND workspace_id=$3 AND environment_id=$4 FOR UPDATE`,
      [conversationId, actor.principalId, actor.workspaceId, env])).rows[0];
    if (!conversation || conversation.customer_id !== customerId || conversation.context_snapshot_schema !== "customer-context-v1" ||
      conversation.context_audience !== "internal" || conversation.context_generation !== profile.internal_generation ||
      conversation.context_login_session_id !== actor.sessionId || conversation.context_membership_id !== actor.membershipId || conversation.binding_state === "failed") throw hiddenRecord();
    const operationId = conversation.creation_operation_id as string;
    await assertFreshFeatureConversation(db, conversationId);
    await db.query(`INSERT INTO execution_advice_bindings(id,environment_id,workspace_id,customer_id,engagement_id,conversation_id,
      owner_membership_id,baseline_id,generation,from_date,to_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [bindingId, env, actor.workspaceId, customerId, engagementId, conversationId, actor.membershipId, view.baselineId, view.generation, input.from, input.to]);
    const charged = executionContextCharge({ contextBytes: 0, readCalls: 0, dependencyCount: 0 }, { bytes: Buffer.byteLength(executionAdvicePrompt, "utf8"), read: false, dependencyCount: 0 });
    await db.query(`INSERT INTO execution_advice_attempts(id,environment_id,workspace_id,binding_id,conversation_id,owner_membership_id,
      request_key,request_digest,native_request_id,context_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [attemptId, env, actor.workspaceId, bindingId, conversationId, actor.membershipId, input.requestKey, digest, nativeRequestId, charged.contextBytes]);
    await db.query("INSERT INTO execution_advice_instruction_payloads(attempt_id,instruction) VALUES($1,$2)", [attemptId, executionAdvicePrompt]);
    return { attemptId, conversationId, operationId, nativeRequestId, state: "prepared" as const };
  });
}
