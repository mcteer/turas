import { knowledgeRequest } from "../_shared";
import { readPublishedKnowledge } from "../../../../lib/server/knowledge/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return knowledgeRequest(request,false,(client,actor) => readPublishedKnowledge(client,actor,id));
}
