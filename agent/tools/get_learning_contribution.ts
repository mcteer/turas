import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {researchIdentity} from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/contracts/customer-journey";
import { getLearningContribution } from "../../lib/server/learning/customer-adoption/repository";
import { quarterSchema } from "../../lib/contracts/customer-adoption";
const authoredTool=defineTool({
  description:
    "Inspect the latest portfolio-reuse approval action/version for one owned account and quarter before changing it. Inclusion approval is not proof that the source remains eligible or appears in a report. No writes.",
  inputSchema: z
    .object({ accountId: accountIdSchema, quarter: quarterSchema })
    .strict(),
  outputSchema: z.object({
    status: z.enum(["found", "denied", "unavailable"]),
    version: z.number().int().nullable(),
    action: z.enum(["include", "revoke"]).nullable(),
  }),
  async execute({ accountId, quarter }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity || (identity.kind!=="internal"||identity.role!=="admin"))
      return { status: "denied" as const, version: null, action: null };
    try {
      ctx.abortSignal.throwIfAborted();
      return {
        status: "found" as const,
        ...(await getLearningContribution(identity, accountId, quarter)),
      };
    } catch {
      return { status: "unavailable" as const, version: null, action: null };
    }
  },
});

export default normalChatTool(authoredTool);
