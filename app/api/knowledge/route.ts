import { knowledgeRequest } from "./_shared";
import { listPublishedKnowledge } from "../../../lib/server/knowledge/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return knowledgeRequest(request,false,(client,actor) => {
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    return listPublishedKnowledge(client,actor,rawLimit ? Number(rawLimit) : 20,
      url.searchParams.get("cursor") ?? undefined);
  });
}
