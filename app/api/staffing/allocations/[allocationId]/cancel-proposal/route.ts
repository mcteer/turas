import { staffingRequest, staffingId } from "../../../_shared";
import { cancelAllocationProposal } from "../../../../../../lib/server/staffing/allocations";
type Context = { params: Promise<{ allocationId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => cancelAllocationProposal(actor, staffingId(allocationId), body, db));
};
