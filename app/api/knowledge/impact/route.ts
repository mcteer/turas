import { knowledgeRequest } from "../_shared";
import { readKnowledgeImpact } from "../../../../lib/server/knowledge/impact";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return knowledgeRequest(request,false,(client,actor) => readKnowledgeImpact(client,actor));
}
