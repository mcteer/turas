import { staffingRequest, staffingId } from "../../../_shared";
import { retireImport } from "../../../../../../lib/server/staffing/lifecycle";
type Context = { params: Promise<{ importId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => retireImport(actor, staffingId(importId), body, "cancel", db));
};
