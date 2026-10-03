import { executionRequest, executionRouteId } from "../../../../../../lib/server/execution/http";
import { prepareExecutionAdvice } from "../../../../../../lib/server/execution/advisory";
export const dynamic = "force-dynamic";
export const POST = (request: Request, context: { params: Promise<{ engagementId: string }> }) =>
  executionRequest(request, true, async (actor, body) => prepareExecutionAdvice(actor, executionRouteId((await context.params).engagementId), body));
