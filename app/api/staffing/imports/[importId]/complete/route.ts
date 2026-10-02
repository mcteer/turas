import { staffingStandaloneRequest, staffingId } from "../../../_shared";
import { completeImport } from "../../../../../../lib/server/staffing/imports";
type Context = { params: Promise<{ importId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingStandaloneRequest(request, true, (actor, body) => completeImport(actor, staffingId(importId), body));
};
