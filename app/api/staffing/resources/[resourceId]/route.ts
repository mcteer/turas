import { staffingRequest, staffingId } from "../../_shared";
import { reviseResource } from "../../../../../lib/server/staffing/resources";
import { readResource } from "../../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resourceId: string }> };
export const GET = async (request: Request, context: Context) => {
  const { resourceId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readResource(actor, staffingId(resourceId), db));
};
export const PATCH = async (request: Request, context: Context) => {
  const { resourceId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => reviseResource(actor, staffingId(resourceId), body, db));
};
