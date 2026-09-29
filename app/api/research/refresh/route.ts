import { researchRequest } from "../_shared";
import { listDueResearch,recordResearchRefresh } from "../../../../lib/server/research/refresh";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const customerId = new URL(request.url).searchParams.get("customerId") ?? "";
  return researchRequest(request,false,(client,actor) =>
    listDueResearch(client,actor,customerId));
}
export async function POST(request: Request): Promise<Response> {
  return researchRequest(request,true,(client,actor,body) => {
    const input = body && typeof body === "object" ? body as Record<string,unknown> : {};
    const { customerId,...command } = input;
    return recordResearchRefresh(client,actor,String(customerId ?? ""),command);
  });
}
