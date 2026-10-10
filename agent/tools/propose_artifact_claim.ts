import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { responseFeature } from "../../lib/server/conversations/feature";
import { createHash } from "node:crypto";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { readCurrentArtifactDraft } from "../../lib/server/artifacts/context";
import { submitArtifactProposal } from "../../lib/server/artifacts/proposals";
import { HttpFailure } from "../../lib/contracts/http";

const inputSchema = z.object({ sourceNumber: z.number().int().min(1).max(5),
  text: z.string().trim().min(1).max(8_000) }).strict();

function stableRequestKey(attemptId: string,callId: string): string {
  const bytes = createHash("sha256").update(`${attemptId}:${callId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0,16).toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export const authoredTool = defineTool({
  description: "When the human explicitly asks to retain a claim from a selected document, submit one assistant-authored Pending claim. Input only sourceNumber (1–5) and the claim text; exact selected units supply support. The tool never approves the claim and cannot read arbitrary files.",
  inputSchema,
  async execute(input,ctx) {
    return withTransaction(async (client) => {
      const bound = await boundToolActor(client,ctx.session.auth.current);
      if (bound.planning) throw new HttpFailure(403,"planning_tool_denied",
        "This planning turn cannot propose artifact claims");
      const draft = await readCurrentArtifactDraft(client,bound.attemptId,bound.actor.principalId);
      if (!draft) throw new HttpFailure(409,"artifact_context_absent","No source was selected");
      const envelope = JSON.parse(draft.envelope) as {
        sources: Array<{ versionId: string; runId: string; lifecycleGeneration: number;
          ranges: Array<{ unitId: string; start: number; end: number }> }>;
        units: Array<{ source: number; text: string }> };
      const source = envelope.sources[input.sourceNumber-1];
      if (!source) throw new HttpFailure(422,"invalid_source_number","Selected source unavailable");
      const excerpt = envelope.units.filter((unit) => unit.source === input.sourceNumber)
        .map((unit) => unit.text).join("\n");
      const audience = bound.actor.kind === "partner" ? "delivery" : "internal";
      const dataCategory = bound.actor.kind === "partner" ? "delivery_context" : "other_internal";
      const result = await submitArtifactProposal(bound.actor,{ selection: {
        ...source,excerpt,excerptDigest: createHash("sha256").update(excerpt).digest("hex"),
        audience,dataCategory,
      },command: { action: "propose_record",requestKey: stableRequestKey(bound.attemptId,ctx.callId),
        requestedAudience: audience,dataCategory,
        payload: { kind: "claim",text: input.text,sourceType: "manual" } } },client);
      return { ...result,customerId: bound.customerId,reviewNeeded: true,
        status: "Pending steward review; accepted context was not changed" };
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind !== "staffing" && feature?.kind !== "execution" && feature?.kind !== "support" && feature?.kind !== "expansion" && feature?.kind !== "learning" && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
