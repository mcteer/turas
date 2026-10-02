import { staffingRequest, staffingId } from "../../../_shared";
import { createImportMapping } from "../../../../../../lib/server/staffing/mapping";
type Context = { params: Promise<{ importId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => createImportMapping(actor, staffingId(importId), body, db));
};
