import { staffingRequest, staffingStandaloneRequest, staffingQuery, staffingId } from "../../../_shared";
import { approveCalendar, readCalendar } from "../../../../../../lib/server/staffing/calendars";
import { HttpFailure } from "../../../../../../lib/contracts/http";
type Context = { params: Promise<{ resourceId: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: Context) => {
  const { resourceId } = await context.params;
  return staffingRequest(request, false, (db, actor) => {
    staffingQuery(request, ["fromDate", "toDate"]); const params = new URL(request.url).searchParams;
    if (params.size !== 2) throw new HttpFailure(422, "invalid_input", "Calendar date period required");
    return readCalendar(actor, staffingId(resourceId), { fromDate: params.get("fromDate"), toDate: params.get("toDate") }, db);
  });
};
export const POST = async (request: Request, context: Context) => {
  const { resourceId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => approveCalendar(actor, staffingId(resourceId), body));
};
