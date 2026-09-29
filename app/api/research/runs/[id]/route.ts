import { researchRequest } from "../../_shared";
import { readResearchRun } from "../../../../../lib/server/research/requests";

export const dynamic = "force-dynamic";
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,false,(client,actor) => readResearchRun(client,actor,id));
}
