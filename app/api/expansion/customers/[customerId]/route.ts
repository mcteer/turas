import { expansionRequest, expansionQuery, expansionRouteId } from "../../../../../lib/server/expansion/http";
import { readExpansionWorkspace } from "../../../../../lib/server/expansion/projection";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return expansionRequest(request, false, async actor => readExpansionWorkspace(actor,
    expansionRouteId((await context.params).customerId), expansionQuery(request)));
}
