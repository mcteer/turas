import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { researchIdentity,researchHumanResponderIdentity } from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/contracts/customer-journey";
import {canReviewWorkspaceSolution} from "../../lib/server/knowledge/workspace-patterns/approval";
import {HttpFailure} from "../../lib/contracts/http";
import { reviewSolutionApplication } from "../../lib/server/knowledge/workspace-patterns/repository";
import { applicationCommandSchema } from "../../lib/contracts/solution-patterns";
const authoredTool=defineTool({
  description: "Separately approve or withdraw a target-account adaptation of an exact solution pattern version. Inspect current target context hash and application version first. Requires evidence and adaptation for all six fit dimensions, validation plan and target-steward approval. This records a reviewed plan, not deployment authorization, commercial commitment or proven outcomes. Reuse requestId only for an identical retry.",
  inputSchema: z.object({ accountId: accountIdSchema, command: applicationCommandSchema }).strict(),
  outputSchema: z.object({ status: z.enum(["updated", "denied", "unavailable"]), receipt: z.object({ applicationId: z.uuid(), version: z.number().int(), action: z.string() }).nullable(), reason: z.string() }),
  approval: { request: always(), response: async ({ responder, request }) => {
    const identity = await researchHumanResponderIdentity(responder).catch(()=>null);
    if (!identity || !request.toolInput) return { status: "rejected", reason: "The account steward must approve this exact change." };
    try {
      const canWrite = await canReviewWorkspaceSolution(identity, request.toolInput.accountId);
      return canWrite ? { status: "allowed" } : { status: "rejected", reason: "An existing owned account journal is required." };
    } catch { return { status: "rejected", reason: "You cannot approve this account's solution knowledge." }; }
  } },
  async execute({ accountId, command }, ctx) {
    const identity = await researchIdentity(ctx.session.auth.current);
    if (!identity) return { status: "denied" as const, receipt: null, reason: "Account steward authorization required." };
    try {
      ctx.abortSignal.throwIfAborted();
      return { status: "updated" as const, receipt: await reviewSolutionApplication(identity, accountId, command, ctx.abortSignal), reason: "Review recorded. Eligibility is rechecked against current source, permissions and versions on every read." };
    } catch (error) {
      console.warn(JSON.stringify({ event: "solution_patterns.application_write_failed", callId: ctx.callId, status: error instanceof HttpFailure ? error.status : 503 }));
      return { status: "unavailable" as const, receipt: null, reason: error instanceof HttpFailure ? error.message : "The change was not confirmed. Inspect current state and retry identical content with the same request ID." };
    }
  },
});

export default normalChatTool(authoredTool);
