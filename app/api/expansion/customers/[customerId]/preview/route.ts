import { expansionRequest, expansionRouteId } from "../../../../../../lib/server/expansion/http";
import { createExpansionPreview } from "../../../../../../lib/server/expansion/review";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
 return expansionRequest(request,true,async(actor,body)=>createExpansionPreview(actor,expansionRouteId((await context.params).customerId),body));
}
