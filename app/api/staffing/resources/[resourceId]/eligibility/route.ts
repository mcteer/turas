import { staffingRequest, staffingId } from "../../../_shared";
import { revisePartnerEligibility } from "../../../../../../lib/server/staffing/resources";
type Context = { params: Promise<{ resourceId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { resourceId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => revisePartnerEligibility(actor, staffingId(resourceId), body, db));
};
