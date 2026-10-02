import { staffingStandaloneRequest, staffingId } from "../../../_shared";
import { qualifyDemand } from "../../../../../../lib/server/staffing/demands";
type Context = { params: Promise<{ demandId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => qualifyDemand(actor, staffingId(demandId), body));
};
