import { staffingRequest, staffingQuery, staffingId } from "../../_shared";
import { createFinanceInput, listFinanceInputs } from "../../../../../lib/server/staffing/economics";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createFinanceInput(actor, body, db));
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => {
  const paging = staffingQuery(request, ["resourceId", "engagementId", "baselineId"]), params = new URL(request.url).searchParams;
  return listFinanceInputs(actor, { ...paging, ...Object.fromEntries(["resourceId", "engagementId", "baselineId"]
    .filter(key => params.has(key)).map(key => [key, staffingId(params.get(key))])) }, db);
});
