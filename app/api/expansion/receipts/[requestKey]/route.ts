import { expansionRequest, expansionRouteId } from "../../../../../lib/server/expansion/http";
import { readExpansionReceipt } from "../../../../../lib/server/expansion/commands";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) {
  return expansionRequest(request, false, async actor => readExpansionReceipt(actor,
    expansionRouteId((await context.params).requestKey)));
}
