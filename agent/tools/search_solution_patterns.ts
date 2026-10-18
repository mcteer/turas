import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { searchSolutionPatterns } from "../../lib/server/knowledge/workspace-patterns/repository";
import { searchInputSchema, publishedPatternSchema } from "../../lib/contracts/solution-patterns";
const authoredTool=defineTool({
  description: "Find separately approved generalized solution patterns for a target account and problem. Only eligible same-workspace derivatives are returned; original customer records are never shared. Similarity is not applicability or target approval. Compare technical, security, delivery, process, adoption and economic fit against target recon. No writes.",
  inputSchema: searchInputSchema,
  outputSchema: z.object({ status: z.enum(["available", "denied", "unavailable"]), patterns: z.array(publishedPatternSchema).max(5), targetContextHash: z.string().nullable(), retrieval: z.enum(["keyword", "hybrid"]), reason: z.string() }),
  async execute({ accountId, query }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    const empty = { patterns: [], targetContextHash: null, retrieval: "keyword" as const };
    if (!identity) return { ...empty, status: "denied" as const, reason: "Authentication required." };
    try {
      ctx.abortSignal.throwIfAborted();
      return { ...await searchSolutionPatterns(identity, accountId, query, ctx.abortSignal), status: "available" as const,
        reason: "Candidates only. Preserve outcome basis and limitations; source results are not target projections. No customer action is approved." };
    } catch {
      console.warn(JSON.stringify({ event: "solution_patterns.search_failed", callId: ctx.callId }));
      return { ...empty, status: "unavailable" as const, reason: "Solution library unavailable; report this gap rather than claiming no prior solutions exist." };
    }
  },
});

export default normalChatTool(authoredTool);
