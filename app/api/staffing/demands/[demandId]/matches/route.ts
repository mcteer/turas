import { staffingStandaloneRequest, staffingQuery, staffingId } from "../../../_shared";
import { createMatchingResult, readMatchingResult } from "../../../../../../lib/server/staffing/matching";
type Context = { params: Promise<{ demandId: string }> };
export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => createMatchingResult(actor, staffingId(demandId), body));
};
export const GET = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingStandaloneRequest(request, false, actor => {
    const paging = staffingQuery(request, ["resultId"]), params = new URL(request.url).searchParams;
    return readMatchingResult(actor, staffingId(demandId), { ...paging, resultId: staffingId(params.get("resultId")) });
  });
};
