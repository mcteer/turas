import { knowledgeRequest } from "../_shared";
import { createKnowledgeCandidate } from "../../../../lib/server/knowledge/service";
import { listKnowledgeCandidates } from "../../../../lib/server/knowledge/lineage";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return knowledgeRequest(request,false,(client,actor) => {
    const rawLimit = new URL(request.url).searchParams.get("limit");
    return listKnowledgeCandidates(client,actor,rawLimit ? Number(rawLimit) : 20);
  });
}
export async function POST(request: Request): Promise<Response> {
  return knowledgeRequest(request,true,(client,actor,body) => createKnowledgeCandidate(client,actor,body));
}
