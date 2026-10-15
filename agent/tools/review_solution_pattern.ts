import {normalChatTool} from "../lib/normal-chat-tool";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { researchIdentity } from "../../lib/server/research/specialists/identity";
import { accountIdSchema } from "../../lib/contracts/customer-journey";
import {canReviewWorkspaceSolution} from "../../lib/server/knowledge/workspace-patterns/approval";
import {HttpFailure} from "../../lib/contracts/http";
import { reviewSolutionPattern } from "../../lib/server/knowledge/workspace-patterns/repository";
import { patternCommandSchema } from "../../lib/contracts/solution-patterns";
const authoredTool=defineTool({
  description: "Publish or withdraw an exact generalized solution derivative for reuse within this workspace. Requires separate source-steward approval, a current approved source and explicit redaction/outcome attestation. Inspect the account contribution versions first. Publishing shares only the reviewed derivative, not its source. Never automatically publish customer notes. Reuse requestId only for an identical retry.",
  inputSchema: z.object({ accountId: accountIdSchema, command: patternCommandSchema }).strict(),
  outputSchema: z.object({ status: z.enum(["updated", "denied", "unavailable"]), receipt: z.object({ patternId: z.uuid(), version: z.number().int(), action: z.string() }).nullable(), reason: z.string() }),
  approval: { request: always(), response: async ({ responder, request }) => {
    const identity = await researchIdentity(responder);
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
      return { status: "updated" as const, receipt: await reviewSolutionPattern(identity, accountId, command, ctx.abortSignal), reason: "Review recorded. Eligibility is rechecked against current source, permissions and versions on every read." };
    } catch (error) {
      console.warn(JSON.stringify({ event: "solution_patterns.pattern_write_failed", callId: ctx.callId, status: error instanceof HttpFailure ? error.status : 503 }));
      return { status: "unavailable" as const, receipt: null, reason: error instanceof HttpFailure ? error.message : "The change was not confirmed. Inspect current state and retry identical content with the same request ID." };
    }
  },
});

export default normalChatTool(authoredTool);
