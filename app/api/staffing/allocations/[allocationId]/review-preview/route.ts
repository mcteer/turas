import { staffingStandaloneRequest, staffingId, staffingQuery } from "../../../_shared";
import { createAllocationReviewPreview, readAllocationReviewPreview } from "../../../../../../lib/server/staffing/decisions";
import { HttpFailure } from "../../../../../../lib/contracts/http";
type Context = { params: Promise<{ allocationId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => createAllocationReviewPreview(actor, staffingId(allocationId), body));
};
export const GET = async (request: Request, context: Context) => {
  const { allocationId } = await context.params;
  return staffingStandaloneRequest(request, false, actor => {
    staffingQuery(request, ["previewId"]); const params = new URL(request.url).searchParams;
    if (params.size !== 1) throw new HttpFailure(422, "invalid_input", "Exact preview required");
    return readAllocationReviewPreview(actor, staffingId(allocationId), staffingId(params.get("previewId")));
  });
};
