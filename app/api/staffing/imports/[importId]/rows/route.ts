import { staffingRequest, staffingId, staffingQuery } from "../../../_shared";
import { readImportRows } from "../../../../../../lib/server/staffing/import-read";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ importId: string }> };
export const GET = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readImportRows(actor, staffingId(importId), staffingQuery(request), db));
};
