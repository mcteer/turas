import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../../lib/server/research/specialists/account-id";
import { loadResearchContext, researchContextDigest } from "../../../lib/server/research/specialists/solution-research/context";
import { customerContextSchema } from "../../../lib/server/research/specialists/solution-research/schema";
import { evidenceFreshnessSchema } from "../../../lib/server/research/specialists/solution-research/freshness";
import { contextFreshness } from "../../../lib/server/research/specialists/solution-research/freshness-report";
import { requestTicketSchema, digest } from "../../../lib/server/research/specialists/research-cache/schema";
import { loadResearchRequest, loadSessionResearchRequest } from "../../../lib/server/research/specialists/research-cache/requests";
import { cacheEnabled } from "../../../lib/server/research/specialists/research-cache/database";
import { latestVercelPracticeRun, practiceRunSchema, practiceSourceSchema, searchVercelPracticeSources } from "../../../lib/server/research/specialists/research-cache/practice-library";
import { researchState } from "./research-state";

const tool = defineTool({
  description: "Required first step for Vercel best-practices research. Verify the reserved account-scoped task, then load reusable, freshness-rated practice sources from the shared Postgres/pgvector library. This does not expose private customer history to the specialist and does not write customer memory.",
  inputSchema: z.object({ accountId: accountIdSchema, requestTicket: requestTicketSchema.optional() }).strict(),
  outputSchema: z.object({
    status: z.enum(["available", "denied", "unavailable"]),
    context: customerContextSchema.nullable(),
    practiceSources: z.array(practiceSourceSchema).max(8),
    latestRun: practiceRunSchema.nullable(),
    freshness: z.array(evidenceFreshnessSchema).max(60),
    reason: z.string(),
  }),
  async execute({ accountId, requestTicket }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
    const empty = { context: null, practiceSources: [], latestRun: null, freshness: [] };
    if (!identity || ctx.abortSignal.aborted) return { ...empty, status: "denied" as const, reason: "Authenticated, uncancelled research is required." };
    if (cacheEnabled() && !requestTicket && !ctx.session.parent)
      return { ...empty, status: "denied" as const, reason: "Supply the research reservation from prepare_customer_research before searching." };
    try {
      const context = await loadResearchContext(identity, accountId, ctx.abortSignal);
      let request = null;
      if (ctx.session.parent || requestTicket) {
        if (ctx.session.parent) {
          try { request = await loadSessionResearchRequest(identity, ctx.session.parent.sessionId, ctx.session.id, accountId, "best-practices", ctx.abortSignal); }
          catch { request = await loadSessionResearchRequest(identity, ctx.session.parent.sessionId, ctx.session.id, accountId, "solution", ctx.abortSignal); }
        } else {
          try { request = await loadResearchRequest(identity, requestTicket!, accountId, "best-practices", ctx.abortSignal); }
          catch { request = await loadResearchRequest(identity, requestTicket!, accountId, "solution", ctx.abortSignal); }
        }
      }
      if (request && request.context_hash !== researchContextDigest(context))
        return { ...empty, status: "denied" as const, reason: "Customer context changed after research admission. Prepare a new best-practices request." };
      const product = request?.scope.workload ?? "Vercel platform";
      const question = request?.scope.question ?? product;
      const practiceSources = await searchVercelPracticeSources(identity, product, question, ctx.abortSignal);
      const latestRun = await latestVercelPracticeRun(identity, product, question);
      researchState.update((state) => ({ ...state, context, mode: request?.scope.kind === "best-practices" ? "best-practices" : "solution", requestTicket: request?.ticket, requestScope: request?.scope }));
      return { status: "available" as const, context, practiceSources, latestRun, freshness: contextFreshness(context), reason: "Review reusable sources first. Read missing or stale sources through the public reader, then finalize the practice findings. Stale sources are retrieval hints, not current guidance." };
    } catch {
      return { ...empty, status: "unavailable" as const, reason: "The authorized practice library or research reservation is unavailable." };
    }
  },
});

export default defineDynamic({ events: { "step.started": () => researchState.get().finalized ? null : tool } });
