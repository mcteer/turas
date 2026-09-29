import { knowledgeRequest } from "../../../_shared";
import { readKnowledgeLineage } from "../../../../../../lib/server/knowledge/lineage";

export const dynamic = "force-dynamic";
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return knowledgeRequest(request,false,(client,actor) => readKnowledgeLineage(client,actor,id));
}
