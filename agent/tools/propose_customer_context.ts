import { createHash } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { profilePayloadSchema } from "../../lib/contracts/profile-payloads";
import { qualityInputSchema } from "../../lib/contracts/profiles";
import { HttpFailure } from "../../lib/contracts/http";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { submitProfileCommandDetailed } from "../../lib/server/profiles/service";

const inputSchema = z.object({
  payload: profilePayloadSchema,
  workloadId: z.uuid().nullable().optional(),
  recordId: z.uuid().optional(),
  expectedRecordVersion: z.number().int().nonnegative().optional(),
  expectedAcceptedRevisionId: z.uuid().nullable().optional(),
  qualityInput: qualityInputSchema.optional(),
  evidenceRevisionIds: z.array(z.uuid()).max(20).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.recordId && (value.expectedRecordVersion === undefined ||
      value.expectedAcceptedRevisionId === undefined)) {
    ctx.addIssue({ code: "custom", path: ["recordId"],
      message: "A correction requires the current record version and accepted head" });
  }
  if (!value.recordId && (value.expectedRecordVersion !== undefined ||
      value.expectedAcceptedRevisionId !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["recordId"],
      message: "Version fields require a correction target" });
  }
});

function stableRequestKey(attemptId: string, callId: string): string {
  const bytes = createHash("sha256").update(`${attemptId}:${callId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default defineTool({
  description: "Submit an assistant-authored customer profile proposal for human review. This can only create a Pending candidate for the customer bound to this turn. A claim citing the current user's message must include that exact message ID, span and SHA-256 digest; the proposal remains labeled assistant-authored. It cannot accept facts or select a trusted origin.",
  inputSchema,
  async execute(input, ctx) {
    return withTransaction(async (client) => {
      const bound = await boundToolActor(client, ctx.session.auth.current);
      if (input.payload.kind === "claim" && input.payload.sourceMessageId) {
        const current = await client.query<{ message_id: string }>(
          "SELECT message_id FROM response_attempts WHERE id=$1", [bound.attemptId]);
        if (current.rows[0]?.message_id !== input.payload.sourceMessageId) {
          throw new HttpFailure(422, "invalid_claim_source", "Only the current user's message can be cited");
        }
      }
      const requestKey = stableRequestKey(bound.attemptId, ctx.callId);
      const command = { requestKey,
        action: input.recordId ? "propose_revision" : "propose_record",
        ...(input.recordId ? { recordId: input.recordId,
          expectedRecordVersion: input.expectedRecordVersion,
          expectedAcceptedRevisionId: input.expectedAcceptedRevisionId } : {}),
        workloadId: input.workloadId ?? null, payload: input.payload,
        ...(input.qualityInput ? { qualityInput: input.qualityInput } : {}),
        requestedAudience: bound.actor.kind === "partner" ? "delivery" : "internal",
        dataCategory: bound.actor.kind === "partner" ? "delivery_context" : "other_internal",
        evidenceRevisionIds: input.evidenceRevisionIds ?? [],
      };
      const result = await submitProfileCommandDetailed(bound.actor, bound.customerId,
        command, client, { submissionChannel: "agent_proposal" });
      const state = await client.query<{ generation: string }>(`SELECT
        CASE WHEN $2::text='internal' THEN internal_generation ELSE delivery_generation END AS generation
        FROM customer_profile_state WHERE customer_id=$1`,
      [bound.customerId, bound.actor.kind]);
      if (state.rows[0]?.generation !== bound.generation) {
        throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
      }
      return { ...result.data as Record<string, unknown>, requestKey,
        customerId: bound.customerId, workloadId: input.workloadId ?? null,
        reviewNeeded: true, submissionChannel: "agent_proposal",
        status: "Pending steward review; accepted context was not changed" };
    });
  },
});
