import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../../lib/server/research/specialists/account-id";
import { loadResearchContext, researchContextDigest } from "../../../lib/server/research/specialists/solution-research/context";
import { customerContextSchema } from "../../../lib/server/research/specialists/solution-research/schema";
import { customerUpdateSchema } from "../../../lib/server/research/specialists/solution-research/customer-update";
import { researchReferenceSchema, loadCustomerUpdateArtifact } from "../../../lib/server/research/specialists/solution-research/artifacts";
import { evidenceFreshnessSchema } from "../../../lib/server/research/specialists/solution-research/freshness";
import { sourceFreshness, contextFreshness } from "../../../lib/server/research/specialists/solution-research/freshness-report";
import { researchPassageView } from "../../../lib/server/research/specialists/research-cache/passage-view";
import { researchState } from "./research-state";
import { requestTicketSchema, digest } from "../../../lib/server/research/specialists/research-cache/schema";
import { loadResearchRequest, loadSessionResearchRequest } from "../../../lib/server/research/specialists/research-cache/requests";
import { storedSourceCandidates } from "../../../lib/server/research/specialists/research-cache/sources";
import { cacheEnabled } from "../../../lib/server/research/specialists/research-cache/database";

import { searchSolutionPatterns } from "../../../lib/server/research/specialists/solution-patterns/repository";
import { publishedPatternSchema } from "../../../lib/server/research/specialists/solution-patterns/schema";

import { recallPublicLearning, publicLearningSchema } from "../../../lib/server/research/specialists/research-cache/public-learning";

export function researchContextTool(mode: "solution" | "customer-update") {
  const tool = defineTool({
    description: mode === "solution"
      ? "Load current authorized context and a required signed customer-recon reference for the same account/caller/environment. Import its findings, scoped sources and gaps for solution research. No customer-memory write."
      : "Required first step: load authorized customer context and dated public snapshot for customer recon. Locks this child to one account. Missing private data stays unknown. No approved customer-memory writes.",
    inputSchema: z.object({ accountId: accountIdSchema, reconReference: researchReferenceSchema.optional(), requestTicket: requestTicketSchema.optional() }).strict(),
    outputSchema: z.object({ status: z.enum(["available", "denied", "unavailable", "needs_recon"]),
      context: customerContextSchema.nullable(), recon: customerUpdateSchema.nullable(),
      freshness: z.array(evidenceFreshnessSchema).max(60), reason: z.string(),
      inheritedPassages: z.array(z.object({ sourceId: z.string(), url: z.url(), passages: z.array(z.object({ id: z.string(), text: z.string() })), remainingPassages: z.array(z.object({ id: z.string(), preview: z.string() })).optional(), passageCoverage: z.string().optional() })).max(12),
      priorPublicLearning: z.array(publicLearningSchema).max(8).optional(),
      solutionPatterns: z.array(publishedPatternSchema).max(5).optional(),
      solutionLibraryStatus: z.enum(["available", "unavailable", "not_applicable"]).optional(),
      storedSources: z.array(z.object({ id: z.string(), url: z.url(), title: z.string(), truncated: z.boolean(), checkedAt: z.iso.datetime(), refreshAfter: z.iso.datetime(), stale: z.boolean(), snapshotId: z.string() })).max(8).optional(),
    }),
    async execute({ accountId, reconReference, requestTicket }, ctx) {
      const empty = { context: null, recon: null, freshness: [], inheritedPassages: [] };
      const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
      if (!identity || ctx.abortSignal.aborted) return { ...empty, status: "denied" as const, reason: "Authenticated, uncancelled research is required." };
      if (cacheEnabled() && !requestTicket && !ctx.session.parent)
        return { ...empty, status: "denied" as const, reason: "Supply the requestTicket from Turi's prepare_customer_research admission. Do not start unreserved research." };
      const existing = researchState.get();
      if (existing.context && (existing.context.accountId !== accountId || existing.mode !== mode))
        return { ...empty, status: "denied" as const, reason: "Start a new research task for a different account or purpose." };
      try {
        const context = await loadResearchContext(identity, accountId, ctx.abortSignal);
        let request = null;
        if (ctx.session.parent || requestTicket) {
          try { request = ctx.session.parent
            ? await loadSessionResearchRequest(identity, ctx.session.parent.sessionId, ctx.session.id, accountId, mode, ctx.abortSignal)
            : requestTicket ? await loadResearchRequest(identity, requestTicket, accountId, mode, ctx.abortSignal) : null; }
          catch { return { ...empty, status: "denied" as const, reason: "No unique authorized research reservation is available for this parent/worker, or it expired. Stop without searching or finalizing; do not invent a ticket or start duplicate work." }; }
        }
        if (request && request.context_hash !== researchContextDigest(context))
          return { ...empty, status: "denied" as const, reason: "Customer context changed after research admission. Turi must prepare a new request." };
        const boundReconReference = request?.recon_reference ?? reconReference;
        if (mode === "solution" && (!boundReconReference || boundReconReference.accountId !== accountId))
          return { ...empty, status: "needs_recon" as const, reason: "Complete customer recon and bind its reference when admitting the solution task." };
        const receipt = mode === "solution" && boundReconReference ? await loadCustomerUpdateArtifact(boundReconReference, identity, ctx.abortSignal) : null;
        if (mode === "solution" && (!receipt || researchContextDigest(receipt.payload.context) !== researchContextDigest(context) || receipt.payload.context.publicEvidenceVersion !== context.publicEvidenceVersion))
          return { ...empty, status: "needs_recon" as const, reason: "Customer recon is missing, expired, altered, unauthorized or its customer context changed. Turi should refresh recon for the requested solution; do not reuse its claims." };
        if (existing.context && mode === "solution" && existing.customerRecon?.researchId !== boundReconReference?.researchId)
          return { ...empty, status: "denied" as const, reason: "This solution task is already bound to a different recon artifact. Start a new task." };
        const inheritedSources = receipt?.payload.sources ?? [];
        researchState.update(state => ({ ...state, context, mode,
          ...(request ? { requestTicket: request.ticket, requestScope: request.scope,
            refreshAfter: request.refresh ? request.started_at.toISOString() : undefined } : {}),
          ...(receipt && boundReconReference && !state.customerRecon ? {
            sources: inheritedSources, inheritedSourceCount: inheritedSources.length,
            customerRecon: { ...boundReconReference, checkedAt: receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt, blockers: receipt.payload.blockers, conflicts: receipt.payload.update.conflicts, unknowns: receipt.payload.update.unknowns },
          } : {}),
        }));
        const stored = request ? await storedSourceCandidates(identity, accountId, request.scope.workload,
          request.scope.workload + " " + request.scope.question, ctx.abortSignal) : null;
        const priorPublicLearning = request ? await recallPublicLearning(identity, accountId,
          request.scope.workload, ctx.abortSignal, mode === "solution") : [];
        let solutionPatterns: z.infer<typeof publishedPatternSchema>[] = [];
        let solutionLibraryStatus: "available" | "unavailable" | "not_applicable" = "not_applicable";
        if (mode === "solution" && request) {
          try {
            const patterns = await searchSolutionPatterns(identity, accountId,
              [request.scope.workload, request.scope.proposal].filter(Boolean).join(" ").slice(0, 600), ctx.abortSignal);
            solutionPatterns = patterns.patterns.slice(0, 3);
            solutionLibraryStatus = "available";
          } catch {
            ctx.abortSignal.throwIfAborted();
            solutionLibraryStatus = "unavailable";
            console.warn(JSON.stringify({ event: "solution_patterns.research_lookup_failed", callId: ctx.callId }));
          }
        }
        return { status: "available" as const, context, priorPublicLearning, solutionPatterns, solutionLibraryStatus, recon: receipt?.payload.update ?? null,
          ...(stored ? { storedSources: stored.sources } : {}),
          freshness: [...contextFreshness(context), ...sourceFreshness(inheritedSources)],
          inheritedPassages: inheritedSources.map(source => ({ sourceId: source.id, url: source.url, ...researchPassageView(source) })),
          reason: mode === "customer-update"
            ? "Consult storedSources first; read their relevant URLs through the cached reader. Search only missing coverage, changed sources or due discovery. Cached search/read checks preserve original check dates. Old publication age alone does not require fetching an unchanged page again within its recheck window. Research all six coverage areas and preserve material contradictions. Finalize with finalize_customer_update. No proposal needed. Never send private context or secrets to search providers."
            : "Recon was verified and imported, not promoted to approved customer memory. Its conflicts and gaps remain unresolved unless new evidence addresses them. Cite inherited passage IDs where relevant, research solution-specific gaps and refresh critical aging/stale/unknown claims. Do not treat recent as true or retrieval as publication. Finalize with finalize_research. Never send private context or secrets to search providers.",
        };
      } catch {
        return { ...empty, status: "unavailable" as const, reason: "Authorized context or recon could not be loaded. Report the gap without inventing facts." };
      }
    },
  });
  return defineDynamic(() => researchState.get().finalized ? null : tool );
}
