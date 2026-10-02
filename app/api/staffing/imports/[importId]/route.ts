import { staffingRequest, staffingId } from "../../_shared";
import { retireImport } from "../../../../../lib/server/staffing/lifecycle";
type Context = { params: Promise<{ importId: string }> };
export const DELETE = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => retireImport(actor, staffingId(importId), body, "withdraw", db));
};
import { readImport } from "../../../../../lib/server/staffing/import-read";
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readImport(actor, staffingId(importId), db));
};
