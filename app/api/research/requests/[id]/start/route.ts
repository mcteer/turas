import { researchRequest } from "../../../_shared";
import { startResearch } from "../../../../../../lib/server/research/requests";

export const dynamic = "force-dynamic";
export async function POST(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,true,(client,actor,body) => startResearch(client,actor,id,body));
}
