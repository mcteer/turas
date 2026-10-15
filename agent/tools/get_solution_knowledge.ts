import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/contracts/customer-journey";
import { inspectSolutionKnowledge } from "../../lib/server/knowledge/workspace-patterns/repository";
import { knowledgeInspectionSchema } from "../../lib/contracts/solution-patterns";
const authoredTool=defineTool({
  description: "Inspect this account's solution applications, current target context hash and invalidation states. Only the source account steward sees private publication lineage. Use before changing publication/application versions. Pattern withdrawal, source correction, review expiry and target-context change require reassessment. No writes.",
  inputSchema: z.object({ accountId: accountIdSchema }).strict(),
  outputSchema: z.object({ status: z.enum(["available", "denied", "unavailable"]), knowledge: knowledgeInspectionSchema.nullable(), reason: z.string() }),
  async execute({ accountId }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity) return { status: "denied" as const, knowledge: null, reason: "Authentication required." };
    try {
      ctx.abortSignal.throwIfAborted();
      return { status: "available" as const, knowledge: knowledgeInspectionSchema.parse(await inspectSolutionKnowledge(identity, accountId, ctx.abortSignal)), reason: "Current eligibility shown. An approved adaptation is a plan, not proof of execution or impact." };
    } catch {
      return { status: "unavailable" as const, knowledge: null, reason: "Account solution knowledge is unavailable or you do not have access." };
    }
  },
});

export default normalChatTool(authoredTool);
