import { staffingRequest, staffingId } from "../../../_shared";
import { cancelDemand } from "../../../../../../lib/server/staffing/demands";
type Context = { params: Promise<{ demandId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => cancelDemand(actor, staffingId(demandId), body, db));
};
