import { HttpFailure } from "../../../../lib/contracts/http";
import { researchRequest } from "../_shared";
import { flagTypedConflict,listTypedConflicts } from "../../../../lib/server/retrieval/conflicts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const customerId = url.searchParams.get("customerId") ?? undefined;
  return researchRequest(request,false,(client,actor) => {
    if (scope !== "customer" && scope !== "shared") {
      throw new HttpFailure(422,"invalid_scope","Choose a conflict scope");
    }
    return listTypedConflicts(client,actor,scope,customerId);
  });
}
export async function POST(request: Request): Promise<Response> {
  return researchRequest(request,true,(client,actor,body) => flagTypedConflict(client,actor,body));
}
