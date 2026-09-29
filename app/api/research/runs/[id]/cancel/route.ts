import { researchRequest } from "../../../_shared";
import { cancelResearchRun } from "../../../../../../lib/server/research/requests";

export const dynamic = "force-dynamic";
export async function POST(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,true,(client,actor,body) => cancelResearchRun(client,actor,id,body));
}
