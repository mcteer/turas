import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { createHash } from "node:crypto";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { profilePayloadSchema } from "../../lib/contracts/profile-payloads";
import { qualityInputSchema } from "../../lib/contracts/profiles";
import { HttpFailure } from "../../lib/contracts/http";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { submitProfileCommandDetailed } from "../../lib/server/profiles/service";
import { readCurrentArtifactDraft } from "../../lib/server/artifacts/context";
import { submitArtifactProposal } from "../../lib/server/artifacts/proposals";

const inputSchema = z.object({
  payload: profilePayloadSchema,
  workloadId: z.uuid().nullable().optional(),
  recordId: z.uuid().optional(),
  expectedRecordVersion: z.number().int().nonnegative().optional(),
  expectedAcceptedRevisionId: z.uuid().nullable().optional(),
  qualityInput: qualityInputSchema.optional(),
  evidenceRevisionIds: z.array(z.uuid()).max(20).optional(),
  artifactSourceNumber: z.number().int().min(1).max(5).optional(),
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

export const authoredTool = defineTool({
  description: "Submit one assistant-authored Pending customer proposal for human review. For a human-requested claim from selected artifact text, input only artifactSourceNumber 1–5 and a claim payload with sourceType manual; do not pass coverage, source objects, citations or paths. Exact selected units supply the citation. A claim citing the current user's message instead needs its exact message ID, span and SHA-256 digest. This tool cannot accept facts or select a trusted origin.",
  inputSchema,
  async execute(input, ctx) {
    return withTransaction(async (client) => {
      const bound = await boundToolActor(client, ctx.session.auth.current);
      if (bound.planning) throw new HttpFailure(403,"planning_tool_denied",
        "This planning turn cannot propose customer context");
      let artifactSelection: { versionId: string; runId: string; lifecycleGeneration: number;
        ranges: Array<{ unitId: string; start: number; end: number }>;
        excerpt: string; excerptDigest: string; audience: "internal" | "delivery";
        dataCategory: "other_internal" | "delivery_context" } | undefined;
      if (input.artifactSourceNumber !== undefined) {
        if (input.evidenceRevisionIds?.length) throw new HttpFailure(422,"mixed_evidence",
          "Use one artifact source for this proposal");
        const draft = await readCurrentArtifactDraft(client,bound.attemptId,bound.actor.principalId);
        if (!draft) throw new HttpFailure(409,"artifact_context_absent","No source was selected");
        const envelope = JSON.parse(draft.envelope) as {
          sources: Array<{ versionId: string; runId: string; lifecycleGeneration: number;
            ranges: Array<{ unitId: string; start: number; end: number }> }>;
          units: Array<{ source: number; text: string }> };
        const source = envelope.sources[input.artifactSourceNumber-1];
        if (!source) throw new HttpFailure(422,"invalid_source_number","Selected source unavailable");
        const excerpt = envelope.units.filter((unit) => unit.source === input.artifactSourceNumber)
          .map((unit) => unit.text).join("\n");
        artifactSelection = {
          ...source,excerpt,excerptDigest: createHash("sha256").update(excerpt).digest("hex"),
          audience: bound.actor.kind === "partner" ? "delivery" : "internal",
          dataCategory: bound.actor.kind === "partner" ? "delivery_context" : "other_internal",
        };
      }
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
      const result = artifactSelection ? {
        data: await submitArtifactProposal(bound.actor,{ selection: artifactSelection,
          command },client),
      } : await submitProfileCommandDetailed(bound.actor, bound.customerId,
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
        reviewNeeded: true, submissionChannel: artifactSelection ? "artifact_share" : "agent_proposal",
        status: "Pending steward review; accepted context was not changed" };
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return !scope && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
