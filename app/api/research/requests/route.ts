import { researchRequest } from "../_shared";
import { createResearchPreview } from "../../../../lib/server/research/requests";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return researchRequest(request,true,(client,actor,body) =>
    createResearchPreview(client,actor,body));
}
