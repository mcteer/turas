import { executionRequest, executionRouteId, executionQuery } from "../../../../../../lib/server/execution/http";
import { readExecutionTime } from "../../../../../../lib/server/execution/time";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ engagementId: string }> }): Promise<Response> {
  return executionRequest(request, false, async actor => readExecutionTime(actor,
    executionRouteId((await context.params).engagementId), executionQuery(request, ["from", "to", "entryId", "resourceId", "review", "history", "cursor", "limit"])));
}
