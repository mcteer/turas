import { staffingStandaloneRequest, staffingId, staffingQuery } from "../../_shared";
import { readAllocation } from "../../../../../lib/server/staffing/allocations";
import { HttpFailure } from "../../../../../lib/contracts/http";
type Context = { params: Promise<{ allocationId: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingStandaloneRequest(request, false, actor => {
    // Detail has no paging or client-selected visibility flags.
    const params = new URL(request.url).searchParams;
    staffingQuery(request);
    if (params.size) throw new HttpFailure(422, "invalid_input", "Invalid allocation query");
    return readAllocation(actor, staffingId(allocationId));
  });
};
