import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {researchIdentity} from "../../lib/server/research/specialists/identity";
import { getAdoptionPatterns } from "../../lib/server/learning/customer-adoption/repository";
import {
  patternReportSchema,
  quarterSchema,
} from "../../lib/contracts/customer-adoption";
import {HttpFailure} from "../../lib/contracts/http";
const authoredTool=defineTool({
  description:
    "Read a restricted, closed-quarter adoption comparison across explicitly contributed accounts owned by the current caller. Deterministic arithmetic; minimum five independent accounts in each intervention group. Returns aggregates only, never raw notes, customer identifiers or commercial terms. Not causal ROI. No arbitrary filters or writes.",
  inputSchema: z.object({ quarter: quarterSchema }).strict(),
  outputSchema: z.object({
    status: z.enum([
      "available",
      "insufficient_evidence",
      "denied",
      "unavailable",
    ]),
    report: patternReportSchema.nullable(),
    reason: z.string(),
  }),
  async execute({ quarter }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity || (identity.kind!=="internal"||identity.role!=="admin"))
      return {
        status: "denied" as const,
        report: null,
        reason:
          "Portfolio learning requires the journey owner role; shared reviewer access does not grant it.",
      };
    try {
      ctx.abortSignal.throwIfAborted();
      const report = await getAdoptionPatterns(identity, quarter);
      return {
        status: report.status,
        report,
        reason:
          report.status === "available"
            ? "Only separately approved, currently authorized source measurements contribute. Interpret as association, not causation."
            : "There is insufficient comparable, approved evidence. Neither group is disclosed; do not infer missing values or pool account notes.",
      };
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "customer_learning.report_failed",
          status: error instanceof HttpFailure ? error.status : 503,
        }),
      );
      return {
        status: "unavailable" as const,
        report: null,
        reason:
          error instanceof HttpFailure
            ? error.message
            : "The report is temporarily unavailable. Retry; do not invent portfolio patterns.",
      };
    }
  },
});

export default normalChatTool(authoredTool);
