import { z } from "zod";
import { HttpFailure } from "../../../../../../lib/contracts/http";
import { executionRequest, executionRouteId } from "../../../../../../lib/server/execution/http";
import { cancelExecutionAdvice } from "../../../../../../lib/server/execution/advisory-status";
export const dynamic = "force-dynamic";
export const POST = (request: Request, context: { params: Promise<{ attemptId: string }> }) =>
  executionRequest(request, true, async (actor, body) => {
    if (!z.object({}).strict().safeParse(body).success) throw new HttpFailure(400, "invalid_input", "Empty cancellation body required");
    return cancelExecutionAdvice(actor, executionRouteId((await context.params).attemptId));
  });
