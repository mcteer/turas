import { researchRequest } from "../../../_shared";
import { readResearchRun } from "../../../../../../lib/server/research/requests";
import { readResearchFindings } from "../../../../../../lib/server/research/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return researchRequest(request,false,async (client,actor) => {
    await readResearchRun(client,actor,id);
    return readResearchFindings(client,actor,id);
  });
}
