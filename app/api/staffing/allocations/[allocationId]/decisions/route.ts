import { staffingStandaloneRequest, staffingId } from "../../../_shared";
import { decideAllocation } from "../../../../../../lib/server/staffing/decisions";
type Context = { params: Promise<{ allocationId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => decideAllocation(actor, staffingId(allocationId), body));
};
