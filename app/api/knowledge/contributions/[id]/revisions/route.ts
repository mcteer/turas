import { knowledgeRequest } from "../../../_shared";
import { reviseKnowledgeCandidate } from "../../../../../../lib/server/knowledge/service";

export const dynamic = "force-dynamic";
export async function POST(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return knowledgeRequest(request,true,(client,actor,body) => reviseKnowledgeCandidate(client,actor,id,body));
}
