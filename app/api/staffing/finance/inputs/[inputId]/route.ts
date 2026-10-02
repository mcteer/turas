import { staffingRequest, staffingId } from "../../../_shared";
import { readFinanceInput, reviseFinanceInput } from "../../../../../../lib/server/staffing/economics";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ inputId: string }> };
export const GET = async (request: Request, context: Context) => {
  const { inputId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readFinanceInput(actor, staffingId(inputId), db));
};
export const PATCH = async (request: Request, context: Context) => {
  const { inputId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => reviseFinanceInput(actor, staffingId(inputId), body, db));
};
