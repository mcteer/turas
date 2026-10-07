import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { validateSupportAdviceResult } from "../../support/advice";
import { supportCommandSchema, supportSourcesSchema } from "./schema";
import { lockSupportActor, type SupportActor } from "./policy";
import { supportDigest, lockSupportCommandKey, supportReceiptForCommand } from "./commands";
import { saveProposal, supportTransaction } from "./service";
import { captureSupportAdviceContext, type SupportAdviceScope } from "./context";

export async function saveSupportSuggestion(actor: SupportActor, customerId: string, raw: unknown) {
  const command = supportCommandSchema.parse(raw);
  if (command.operation !== "save_suggestion") throw new HttpFailure(400, "invalid_input", "Use an exact retained support suggestion");
  return supportTransaction(async db => {
    const row = (await db.query(`SELECT a.*,b.customer_id,b.workload_id,b.audience,b.selected_engagement_ids,b.id AS bound_id,
      c.context_login_session_id,c.owner_principal_id FROM support_advice_attempts a
      JOIN support_advice_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
      WHERE a.id=$1 AND a.owner_membership_id=$2 AND a.workspace_id=$3 AND b.customer_id=$4`,
    [command.attemptId, actor.membershipId, actor.workspaceId, customerId])).rows[0];
    if (!row || row.owner_principal_id !== actor.principalId || row.context_login_session_id !== actor.sessionId ||
      row.workload_id !== command.workloadId) throw hiddenRecord();
    await lockSupportActor(db, actor, customerId, "read", row.audience);
    await lockSupportCommandKey(db, actor, command.requestKey);
    const requestDigest = supportDigest({ customerId, command });
    const prior = await supportReceiptForCommand(db, actor, customerId, command.requestKey, requestDigest);
    if (prior) return prior;
    if (row.state !== "completed" || row.output_digest !== command.outputDigest ||
      (await db.query("SELECT 1 FROM support_advice_retirements WHERE attempt_id=$1", [row.id])).rowCount)
      throw new HttpFailure(409, "suggestion_unavailable", "Only completed retained current advice can supply a suggestion");
    const payloads = (await db.query("SELECT kind,payload,content_digest FROM support_advice_payloads WHERE attempt_id=$1", [row.id])).rows;
    const refs = supportSourcesSchema.parse(payloads.find(payload => payload.kind === "source_map")?.payload);
    const output = payloads.find(payload => payload.kind === "output");
    const context = payloads.find(payload => payload.kind === "context")?.payload;
    if (!output || !context || output.content_digest !== command.outputDigest || supportDigest(output.payload) !== command.outputDigest)
      throw new HttpFailure(409, "suggestion_unavailable", "Support advice output is no longer retained");
    const scope: SupportAdviceScope = { bindingId: row.bound_id, conversationId: row.conversation_id,
      ownerMembershipId: actor.membershipId, customerId, workloadId: row.workload_id, audience: row.audience,
      selectedEngagementIds: row.selected_engagement_ids };
    const current = await captureSupportAdviceContext(db, actor, scope, refs, true);
    if (current.digest !== supportDigest(context.fence)) throw new HttpFailure(409, "support_context_changed", "Support advice inputs changed");
    const result = validateSupportAdviceResult(output.payload, refs.map(ref => ref.id));
    const suggestion = result.actionSuggestions[command.suggestionIndex];
    if (!suggestion) throw new HttpFailure(422, "invalid_suggestion", "Choose an exact retained suggestion");
    // Human edits are still proposals. New factual dependencies cannot be added
    // through prose or by replacing the immutable source map.
    if (command.content.disposition !== "open" || command.content.handoff)
      throw new HttpFailure(422, "invalid_suggestion", "Suggested work must remain open and proposed");
    return saveProposal(db, actor, customerId, { contractVersion: "support-v1", operation: "save_action",
      requestKey: command.requestKey, workloadId: command.workloadId, expectedVersion: command.expectedVersion,
      audience: row.audience, selectedEngagementIds: row.selected_engagement_ids,
      sourceRefs: refs.filter(ref => suggestion.citationKeys.includes(ref.id) ||
        command.content.owner.kind === "customer_role" && command.content.owner.sourceKey === ref.id), content: command.content },
    { requestDigest, operation: "save_suggestion" });
  });
}
