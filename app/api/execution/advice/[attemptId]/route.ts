import { executionRequest, executionRouteId, executionQuery } from "../../../../../lib/server/execution/http";
import { readExecutionAdviceStatus } from "../../../../../lib/server/execution/advisory-status";
export const dynamic = "force-dynamic";
export const GET = (request: Request, context: { params: Promise<{ attemptId: string }> }) =>
  executionRequest(request, false, async actor => { executionQuery(request, []); return readExecutionAdviceStatus(actor, executionRouteId((await context.params).attemptId)); });
