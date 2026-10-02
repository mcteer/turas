import { staffingStandaloneRequest, staffingId } from "../../../_shared";
import { reserveAllocation } from "../../../../../../lib/server/staffing/allocations";
type Context = { params: Promise<{ allocationId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => reserveAllocation(actor, staffingId(allocationId), body));
};
