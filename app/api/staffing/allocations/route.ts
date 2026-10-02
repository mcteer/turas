import { staffingRequest, staffingQuery, staffingId } from "../_shared";
import { proposeAllocation, listAllocations } from "../../../../lib/server/staffing/allocations";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => proposeAllocation(actor, body, db));
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => {
  const paging = staffingQuery(request, ["customerId", "demandId", "resourceId"]), params = new URL(request.url).searchParams;
  return listAllocations(actor, { ...paging, customerId: staffingId(params.get("customerId")),
    ...(params.has("demandId") ? { demandId: staffingId(params.get("demandId")) } : {}),
    ...(params.has("resourceId") ? { resourceId: staffingId(params.get("resourceId")) } : {}) }, db);
});
