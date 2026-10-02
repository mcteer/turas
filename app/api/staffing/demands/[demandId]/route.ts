import { staffingRequest, staffingId } from "../../_shared";
import { readDemand, reviseDemand } from "../../../../../lib/server/staffing/demands";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ demandId: string }> };
export const GET = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readDemand(actor, staffingId(demandId), db));
};
export const PATCH = async (request: Request, context: Context) => {
  const { demandId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => reviseDemand(actor, staffingId(demandId), body, db));
};
