import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/server/research/specialists/account-id";
import { recallPublicLearning, publicLearningSchema } from "../../lib/server/research/specialists/research-cache/public-learning";
const authoredTool=defineTool({
  description: "Read accumulated public-source passages for a canonical customer account across users. This is shared account evidence, not access to other chats or internal engagement history. Preserve original dates, contrary evidence and change/refresh flags. Use customer-recon for current-state conclusions or gaps. acrossAccounts returns public examples only for solution comparison, never private notes. No writes.",
  inputSchema: z.object({ accountId: accountIdSchema, query: z.string().max(600).default(""), acrossAccounts: z.boolean().default(false) }).strict(),
  outputSchema: z.object({ status: z.enum(["available", "denied", "unavailable"]), evidence: z.array(publicLearningSchema).max(8), reason: z.string() }),
  async execute({ accountId, query, acrossAccounts }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity) return { status: "denied" as const, evidence: [], reason: "Authentication required." };
    try {
      ctx.abortSignal.throwIfAborted();
      return { status: "available" as const, evidence: await recallPublicLearning(identity, accountId, query, ctx.abortSignal, acrossAccounts),
        reason: "A bounded selection of at most eight public passages, not an exhaustive inventory. Narrow the query for a specific topic; absence here does not establish absence from the library. queryMatched=false means the exact query had no hits and these are broader account passages, not proof of relevance to every requested term. Rechecked pages are not proof of current maturity. No private conversation or internal engagement record is included." };
    } catch {
      console.warn(JSON.stringify({ event: "public_learning.recall_failed", callId: ctx.callId }));
      return { status: "unavailable" as const, evidence: [], reason: "Public learning could not be loaded; do not claim no prior research exists." };
    }
  },
});

export default normalChatTool(authoredTool);
