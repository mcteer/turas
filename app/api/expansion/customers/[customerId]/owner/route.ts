import { expansionRequest, expansionRouteId } from "../../../../../../lib/server/expansion/http";
import { assignExpansionOwner, readExpansionOwners } from "../../../../../../lib/server/expansion/owners";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ customerId: string }> };
export async function GET(request: Request, context: Context) {
  return expansionRequest(request, false, async actor => readExpansionOwners(actor, expansionRouteId((await context.params).customerId)));
}
export async function POST(request: Request, context: Context) {
  return expansionRequest(request, true, async (actor, body) => ({ receipt: await assignExpansionOwner(actor,
    expansionRouteId((await context.params).customerId), body), refreshRequired: true }));
}
