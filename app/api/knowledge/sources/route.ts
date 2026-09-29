import { knowledgeRequest } from "../_shared";
import { listKnowledgeSourceOptions } from "../../../../lib/server/knowledge/lineage";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const customerId = new URL(request.url).searchParams.get("customerId") ?? "";
  return knowledgeRequest(request,false,(client,actor) =>
    listKnowledgeSourceOptions(client,actor,customerId));
}
