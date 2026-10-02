import { staffingRequest, staffingQuery } from "../../_shared";
import { createStaffingScenario, listStaffingScenarios } from "../../../../../lib/server/staffing/scenarios";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createStaffingScenario(actor, body, db));
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => {
  const paging = staffingQuery(request, ["customerId", "engagementId"]), params = new URL(request.url).searchParams;
  return listStaffingScenarios(actor, { ...paging, customerId: params.get("customerId"),
    ...(params.has("engagementId") ? { engagementId: params.get("engagementId") } : {}) }, db);
});
