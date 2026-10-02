import { staffingRequest, staffingQuery } from "../_shared";
import { readStaffingOperations } from "../../../../lib/server/staffing/operations";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => {
  const query = staffingQuery(request, ["customerId", "fromDate", "toDate"]), params = new URL(request.url).searchParams;
  return readStaffingOperations(actor, { ...query, customerId: params.get("customerId"), fromDate: params.get("fromDate"), toDate: params.get("toDate") }, db);
});
