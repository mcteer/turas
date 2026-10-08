import { expansionEvidenceQuerySchema } from "../../../../../../lib/server/expansion/schema";
import { expansionRequest, expansionRouteId, expansionQuery } from "../../../../../../lib/server/expansion/http";
import { searchExpansionEvidence } from "../../../../../../lib/server/expansion/sources";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
 return expansionRequest(request,false,async actor=>{
  const value=expansionEvidenceQuerySchema.parse(expansionQuery(request));
  return searchExpansionEvidence(actor,expansionRouteId((await context.params).customerId),value.workloadId??null,value.query,value.limit);
 });
}
