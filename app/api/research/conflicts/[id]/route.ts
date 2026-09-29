import { researchRequest } from "../../_shared";
import { readTypedConflict } from "../../../../../lib/server/retrieval/conflicts";

export const dynamic = "force-dynamic";
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,false,(client,actor) => readTypedConflict(client,actor,id));
}
