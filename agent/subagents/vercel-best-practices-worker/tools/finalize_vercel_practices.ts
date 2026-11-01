import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../../../lib/server/research/specialists/identity";
import { recordVercelPracticeRun } from "../../../../lib/server/research/specialists/research-cache/practice-library";
import { finishPracticeResearch } from "../../../../lib/server/research/specialists/research-cache/requests";
import { researchState } from "../../../lib/legacy-research/research-state";
const tool = defineTool({
  description: "Store a concise, source-bound Vercel best-practices brief in the shared practice library. This is the final call; it does not write customer memory or propose an engagement.",
  inputSchema: z.object({
    product: z.string().trim().min(2).max(160), topic: z.string().trim().min(5).max(500),
    summary: z.string().trim().min(20).max(2500),
    practices: z.array(z.object({ practice: z.string().trim().min(10).max(700), rationale: z.string().trim().min(10).max(700), sourceIds: z.array(z.string().min(1)).max(8), caveat: z.string().trim().min(10).max(500) }).strict()).min(1).max(12),
    gaps: z.array(z.string().trim().min(10).max(500)).max(10),
  }).strict(),
  outputSchema: z.object({ kind: z.literal("best-practices"), status: z.enum(["ready", "incomplete", "unavailable"]), reference: z.string().nullable(), reason: z.string() }),
  async execute(input, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
    const state = researchState.get();
    if (!identity || state.mode !== "best-practices" || !state.requestTicket || ctx.abortSignal.aborted)
      return { kind: "best-practices" as const, status: "unavailable" as const, reference: null, reason: "No authorized best-practices reservation is available." };
    const available = new Set(state.sources.map((source) => source.id));
    const invalid = input.practices.flatMap((practice) => practice.sourceIds.filter((id) => !available.has(id)));
    if (invalid.length)
      return { kind: "best-practices" as const, status: "incomplete" as const, reference: null, reason: `These source IDs were not retrieved in this task: ${[...new Set(invalid)].join(", ")}. Correct the brief without searching again.` };
    try {
      const reference = await recordVercelPracticeRun(identity, input.product, input.topic, { summary: input.summary, practices: input.practices, gaps: input.gaps }, state.sources.filter((source) => input.practices.some((practice) => practice.sourceIds.includes(source.id))).map((source) => source.url), ctx.abortSignal);
      await finishPracticeResearch(identity, state.requestTicket, input.practices.length, ctx.abortSignal,reference);
      researchState.update((current) => ({ ...current, finalized: true }));
      return { kind: "best-practices" as const, status: input.gaps.length ? "incomplete" as const : "ready" as const, reference, reason: "Best-practices evidence was stored in the shared library with source URLs, freshness metadata and explicit caveats. Implementation-research can retrieve it by product and topic." };
    } catch {
      return { kind: "best-practices" as const, status: "unavailable" as const, reference: null, reason: "The best-practices library could not be updated. Do not claim the guidance was stored." };
    }
  },
});
export default defineDynamic(() => researchState.get().finalized ? null : tool );
