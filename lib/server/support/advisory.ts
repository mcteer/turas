import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { supportAdviceRequestSchema, supportAdvicePrompt, supportAdviceInstructions, SUPPORT_ADVICE_LIMITS } from "../../support/advice";
import { getServerConfig } from "../config";
import { assertFreshFeatureConversation } from "../conversations/feature";
import { supportTransaction } from "./service";
import { supportDigest } from "./commands";
import { lockSupportActor, type SupportActor } from "./policy";
import { supportScope } from "./repository";
import { captureSupportAdviceContext, type SupportAdviceScope } from "./context";
import { captureSupportEvidence } from "./evidence";

/** Preparation never performs provider I/O. All admission identities and the
 * initial context are committed atomically before native dispatch is possible. */
export async function prepareSupportAdvice(actor: SupportActor, customerId: string, raw: unknown) {
  const parsed = supportAdviceRequestSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400, "invalid_input", "Invalid support advice request");
  const input = parsed.data, env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const requestDigest = supportDigest({ customerId, input });
  return supportTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "advice", input.audience);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`support-advice:${env}:${actor.workspaceId}:${actor.membershipId}`]);
    const prior = (await db.query(`SELECT a.*,c.context_login_session_id,c.owner_principal_id,c.creation_operation_id
      FROM support_advice_attempts a JOIN conversations c ON c.id=a.conversation_id
      WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.owner_membership_id=$3 AND a.request_key=$4`,
    [env, actor.workspaceId, actor.membershipId, input.requestKey])).rows[0];
    if (prior) {
      if (prior.request_digest !== requestDigest) throw new HttpFailure(409, "key_conflict", "Request key has different input");
      if (prior.owner_principal_id !== actor.principalId || prior.context_login_session_id !== actor.sessionId) throw hiddenRecord();
      if (!["prepared", "running", "completed"].includes(prior.state))
        throw new HttpFailure(409, "support_context_changed", "Reconcile the previous advice request before requesting new work");
      const binding = (await db.query("SELECT * FROM support_advice_bindings WHERE id=$1", [prior.binding_id])).rows[0];
      const retained = (await db.query("SELECT payload FROM support_advice_payloads WHERE attempt_id=$1 AND kind='context'", [prior.id])).rows[0];
      if (!binding || !retained || (await db.query("SELECT 1 FROM support_advice_retirements WHERE attempt_id=$1", [prior.id])).rowCount)
        throw new HttpFailure(409, "support_context_changed", "Support advice context is no longer retained");
      const current = await captureSupportAdviceContext(db, actor, { bindingId: binding.id,
        conversationId: prior.conversation_id, ownerMembershipId: actor.membershipId, customerId,
        workloadId: binding.workload_id, audience: binding.audience, selectedEngagementIds: binding.selected_engagement_ids }, input.sourceRefs);
      if (current.digest !== supportDigest(retained.payload.fence))
        throw new HttpFailure(409, "support_context_changed", "Reviewed support inputs changed; refresh before requesting advice");
      return { attemptId: prior.id as string, conversationId: prior.conversation_id as string,
        operationId: prior.creation_operation_id as string, nativeRequestId: prior.native_request_id as string, state: prior.state as string };
    }
    if ((await db.query(`SELECT 1 FROM support_advice_attempts WHERE environment_id=$1 AND workspace_id=$2
      AND owner_membership_id=$3 AND state IN ('prepared','running','unconfirmed')`, [env, actor.workspaceId, actor.membershipId])).rowCount)
      throw new HttpFailure(409, "advice_active", "Finish or reconcile the active support advice request");
    const used = Number((await db.query(`SELECT count(*) AS n FROM support_advice_attempts WHERE environment_id=$1
      AND workspace_id=$2 AND owner_membership_id=$3 AND created_at>clock_timestamp()-interval '1 hour'`,
    [env, actor.workspaceId, actor.membershipId])).rows[0].n);
    if (used >= SUPPORT_ADVICE_LIMITS.hourlyAdmissions) throw new HttpFailure(429, "advice_limit", "Support advice admission limit reached", 3600);
    const conversation = (await db.query(`SELECT * FROM conversations WHERE id=$1 AND environment_id=$2
      AND workspace_id=$3 AND owner_principal_id=$4 FOR UPDATE`, [input.conversationId, env, actor.workspaceId, actor.principalId])).rows[0];
    if (!conversation || conversation.customer_id !== customerId || conversation.context_login_session_id !== actor.sessionId ||
      conversation.context_membership_id !== actor.membershipId || !["internal", "delivery"].includes(conversation.context_audience) ||
      conversation.context_snapshot_schema !== "customer-context-v1" || conversation.binding_state === "failed") throw hiddenRecord();
    const profile = (await db.query("SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2", [customerId, actor.workspaceId])).rows[0];
    if (!profile || String(conversation.context_generation) !== String(conversation.context_audience === "delivery" ? profile.delivery_generation : profile.internal_generation))
      throw new HttpFailure(409, "support_context_changed", "Refresh the customer conversation context");
    await assertFreshFeatureConversation(db, input.conversationId);
    // An internal member's ordinary fresh chat starts with internal context.
    // Explicit preparation may narrow it before any binding/message; no captured
    // internal content is reused in the delivery snapshot below.
    await db.query("UPDATE conversations SET context_audience=$2,context_generation=$3 WHERE id=$1", [input.conversationId,
      input.audience, input.audience === "delivery" ? profile.delivery_generation : profile.internal_generation]);
    const bindingId = randomUUID(), attemptId = randomUUID(), nativeRequestId = randomUUID();
    const bound: SupportAdviceScope = { bindingId, conversationId: input.conversationId, ownerMembershipId: actor.membershipId,
      customerId, workloadId: input.workloadId, audience: input.audience, selectedEngagementIds: input.selectedEngagementIds };
    await supportScope(db, actor, customerId, input.workloadId, { create: true });
    const context = await captureSupportAdviceContext(db, actor, bound, input.sourceRefs);
    // Admission checks the actor-bound discovery receipt above. Retain original
    // identities, not transient retrieval permissions: every later read still
    // rechecks current source generation, digest, locator and eligibility.
    const retainedRefs = input.sourceRefs.map(ref => {
      if (!("citationId" in ref)) return ref;
      const { citationId: _citationId, ...retained } = ref;
      return retained;
    });
    const scope = await supportScope(db, actor, customerId, input.workloadId, { lock: true });
    const snapshot = { ...context.snapshot, currentDate: new Date().toISOString().slice(0, 10),
      defaultNextReviewDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      evidence: await captureSupportEvidence(db, actor, customerId, input.workloadId, input.audience, retainedRefs) };
    const instructionBytes = Buffer.byteLength(supportAdviceInstructions(snapshot), "utf8") + Buffer.byteLength(supportAdvicePrompt, "utf8");
    const sourceBytes = Buffer.byteLength(JSON.stringify(input.sourceRefs), "utf8");
    if (instructionBytes + sourceBytes > SUPPORT_ADVICE_LIMITS.contextBytes)
      throw new HttpFailure(422, "scope_too_large", "Narrow support advice context");
    await db.query(`INSERT INTO support_advice_bindings(id,scope_id,environment_id,workspace_id,customer_id,workload_id,
      audience,conversation_id,owner_membership_id,selected_engagement_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [bindingId, scope!.id, env, actor.workspaceId, customerId, input.workloadId, input.audience, input.conversationId, actor.membershipId, input.selectedEngagementIds]);
    await db.query(`INSERT INTO support_advice_attempts(id,binding_id,environment_id,workspace_id,conversation_id,owner_membership_id,
      request_key,request_digest,native_request_id,context_bytes,dependency_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [attemptId, bindingId, env, actor.workspaceId, input.conversationId, actor.membershipId, input.requestKey, requestDigest,
      nativeRequestId, instructionBytes + sourceBytes, context.dependencies.length]);
    for (const [kind, payload] of [["instruction", supportAdvicePrompt], ["context", { snapshot, fence: context.fence }],
      ["source_map", retainedRefs]] as const)
      await db.query("INSERT INTO support_advice_payloads(attempt_id,kind,content_digest,payload) VALUES($1,$2,$3,$4::jsonb)",
        [attemptId, kind, supportDigest(payload), JSON.stringify(payload)]);
    for (const ref of context.dependencies) await db.query(`INSERT INTO support_advice_dependencies(id,attempt_id,kind,dependency_id,
      revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$4,$5,$6)`,
    [randomUUID(), attemptId, ref.kind, ref.revisionId, ref.generation, ref.contentDigest]);
    return { attemptId, conversationId: input.conversationId, operationId: conversation.creation_operation_id as string,
      nativeRequestId, state: "prepared" };
  });
}
