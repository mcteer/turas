import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { prepareResearch } from "../../lib/server/research/specialists/research-cache/requests";
import { requestScopeSchema, requestTicketSchema } from "../../lib/server/research/specialists/research-cache/schema";
import { loadResearchContext,researchContextDigest } from "../../lib/server/research/specialists/solution-research/context";
import { loadCustomerUpdateArtifact, researchReferenceSchema } from "../../lib/server/research/specialists/solution-research/artifacts";
import { bindResearchHandoff, resolveResearchHandoff } from "../lib/legacy-research/research-handoff";

const authoredTool=defineTool({
  description: "Before launching a research specialist, check persistent evidence and reserve duplicate work. Supply the user's exact research question, canonical accountId, specific public workload/product and kind: customer-update for customer-recon, best-practices for reusable Vercel product guidance, or solution for implementation-research; solution also requires its proposal and completed recon. The server loads this chat’s bound recon automatically; omit reconReference for work prepared in this chat. An explicit reconReference remains supported for a prior authorized artifact. If needs_recon, first prepare kind customer-update and complete customer-recon; then prepare best-practices or solution. Never launch customer-recon against a solution reservation. Reused returns an authorized signed reference without a research model call. Research reserves this parent session: launch the matching specialist with accountId and the research question. Its authorized context tool loads the exact reservation using runtime session lineage; do not copy or invent lease identifiers. Working means equivalent work already exists: do not start another child. Set refresh only for an explicit refresh/challenge or material contrary evidence, not merely because the user says latest. Independently checked public findings automatically update the canonical customer profile and retrieval index; manually supplied human claims retain review.",
  inputSchema: z.object({ scope: requestScopeSchema, reconReference: researchReferenceSchema.optional(), refresh: z.boolean().default(false) }).strict(),
  outputSchema: z.object({ status: z.enum(["reused", "research", "working", "needs_recon", "denied", "unavailable"]),
    key: z.string().nullable(), ticket: requestTicketSchema.nullable(), reference: researchReferenceSchema.nullable(),
    checkedAt: z.iso.datetime().nullable(), reason: z.string() }),
  async execute({ scope, refresh, reconReference }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    const empty = { key: null, ticket: null, reference: null, checkedAt: null };
    if (!identity || ctx.abortSignal.aborted) return { ...empty, status: "denied" as const, reason: "Authenticated, uncancelled research is required." };
    if (scope.kind === "solution") {
      const missing = { ...empty, status: "needs_recon" as const,
        reason: "No solution reservation was created. First prepare kind customer-update and complete customer-recon for this account. Then call prepare_customer_research with kind solution, the proposal, with the completed recon bound to this chat. Do not launch a specialist against this failed admission." };
      if (reconReference && reconReference.accountId !== scope.accountId) return missing;
      try {
        reconReference ??= await resolveResearchHandoff({ accountId: scope.accountId }, "customer-update", identity, ctx.abortSignal) ?? undefined;
        if (!reconReference || reconReference.accountId !== scope.accountId) return missing;
        const recon = await loadCustomerUpdateArtifact(reconReference, identity, ctx.abortSignal);
        const context = await loadResearchContext(identity, scope.accountId, ctx.abortSignal);
        if (!recon || researchContextDigest(recon.payload.context) !== researchContextDigest(context) || recon.payload.context.publicEvidenceVersion !== context.publicEvidenceVersion) return missing;
      } catch { return missing; }
    }
    try {
      const admission = await prepareResearch(identity, scope, ctx.abortSignal, refresh, ctx.session.id, scope.kind === "solution" ? reconReference : undefined);
      bindResearchHandoff(scope, admission);
      return admission;
    }
    catch {
      console.warn(JSON.stringify({ event: "research_cache.prepare_failed", callId: ctx.callId }));
      return { ...empty, status: "unavailable" as const, reason: "Research reuse/admission is unavailable. Report the failure instead of launching duplicate uncached research." };
    }
  },
});

export default normalChatTool(authoredTool);
