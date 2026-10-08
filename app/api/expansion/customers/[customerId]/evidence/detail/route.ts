import { expansionRequest,expansionRouteId,expansionQuery } from "../../../../../../../lib/server/expansion/http";
import { inspectExpansionEvidence } from "../../../../../../../lib/server/expansion/evidence-detail";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){
 return expansionRequest(request,false,async actor=>inspectExpansionEvidence(actor,expansionRouteId((await context.params).customerId),expansionQuery(request)));
}
