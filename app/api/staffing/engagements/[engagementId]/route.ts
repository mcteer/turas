import { staffingRequest, staffingQuery, staffingId } from "../../_shared";
import { readStaffingEngagement } from "../../../../../lib/server/staffing/engagements";
import { HttpFailure } from "../../../../../lib/contracts/http";
type Context = { params: Promise<{ engagementId: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: Context) => {
  const { engagementId } = await context.params;
  return staffingRequest(request, false, (db, actor) => {
    staffingQuery(request, ["customerId"]);
    const params = new URL(request.url).searchParams;
    if (params.size !== 1) throw new HttpFailure(422, "invalid_input", "Customer scope required");
    return readStaffingEngagement(actor, staffingId(params.get("customerId")), staffingId(engagementId), db);
  });
};
