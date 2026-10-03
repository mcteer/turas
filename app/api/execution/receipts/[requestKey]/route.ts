import { executionRequest, executionRouteId } from "../../../../../lib/server/execution/http";
import { readExecutionReceipt } from "../../../../../lib/server/execution/commands";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) {
  const { requestKey } = await context.params;
  return executionRequest(request, false, actor => readExecutionReceipt(actor, executionRouteId(requestKey)));
}
