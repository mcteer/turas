import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import {researchIdentity,researchHumanResponderIdentity} from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/contracts/customer-journey";
import {canReviewWorkspaceSolution} from "../../lib/server/knowledge/workspace-patterns/approval";
import {HttpFailure} from "../../lib/contracts/http";
import { reviewLearningContribution } from "../../lib/server/learning/customer-adoption/repository";
import {
  learningCommandSchema,
  quarterSchema,
} from "../../lib/contracts/customer-adoption";
const authoredTool=defineTool({
  description:
    "With explicit owner approval, include or revoke one account's reviewed adoption measurement in restricted internal portfolio analytics. This is separate consent from account-note approval. Include confirms the exact weekly-active definition, same eligible population and governed-execution scope; stores source lineage/counts privately, publishes only minimum-cohort aggregates. Does not share raw notes or prove causal impact. Inspect the current contribution version first. Reuse requestId for retries.",
  inputSchema: z
    .object({ accountId: accountIdSchema, command: learningCommandSchema })
    .strict(),
  outputSchema: z.object({
    status: z.enum(["updated", "denied", "unavailable"]),
    receipt: z
      .object({
        version: z.number().int(),
        action: z.enum(["include", "revoke"]),
        quarter: quarterSchema,
      })
      .nullable(),
    reason: z.string(),
  }),
  approval: {
    request: always(),
    response: async ({ response, request }) => {
      const identity = await researchHumanResponderIdentity(response.principal).catch(()=>null);
      if (!identity || (identity.kind!=="internal"||identity.role!=="admin") || !request.toolInput)
        return {
          status: "rejected",
          reason:
            "Only the authorized journey owner may approve portfolio reuse.",
        };
      try {
        await canReviewWorkspaceSolution(identity, request.toolInput.accountId);
        return { status: "allowed" };
      } catch {
        return {
          status: "rejected",
          reason: "You do not own this customer journey.",
        };
      }
    },
  },
  label: {
    start: () => "Review adoption measurement reuse",
    complete: (_input, output) =>
      output.status === "updated"
        ? "Portfolio contribution updated"
        : "Contribution not changed",
  },
  async execute({ accountId, command }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity || (identity.kind!=="internal"||identity.role!=="admin"))
      return {
        status: "denied" as const,
        receipt: null,
        reason: "An authorized journey owner is required.",
      };
    try {
      ctx.abortSignal.throwIfAborted();
      const receipt = await reviewLearningContribution(
        identity,
        accountId,
        command,
      );
      return {
        status: "updated" as const,
        receipt,
        reason:
          "Reuse approval updated. Reports recheck the current source and permissions; a correction, retraction or revocation excludes the old contribution. No raw account text is shared.",
      };
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "customer_learning.write_failed",
          status: error instanceof HttpFailure ? error.status : 503,
        }),
      );
      return {
        status: "unavailable" as const,
        receipt: null,
        reason:
          error instanceof HttpFailure
            ? error.message
            : "Contribution was not confirmed. Retry with the same request ID.",
      };
    }
  },
});

export default normalChatTool(authoredTool);
