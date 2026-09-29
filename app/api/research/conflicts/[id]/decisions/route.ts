import { researchRequest } from "../../../_shared";
import { decideTypedConflict } from "../../../../../../lib/server/retrieval/conflicts";

export const dynamic = "force-dynamic";
export async function POST(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,true,(client,actor,body) =>
    decideTypedConflict(client,actor,id,body));
}
