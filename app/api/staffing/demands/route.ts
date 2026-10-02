import { staffingRequest, staffingQuery, staffingId } from "../_shared";
import { createDemand, listDemands } from "../../../../lib/server/staffing/demands";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createDemand(actor, body, db));
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => {
  const paging = staffingQuery(request, ["customerId", "engagementId"]), params = new URL(request.url).searchParams;
  return listDemands(actor, { ...paging, customerId: staffingId(params.get("customerId")),
    ...(params.has("engagementId") ? { engagementId: staffingId(params.get("engagementId")) } : {}) }, db);
});
