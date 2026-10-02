import { readStaffingCommandReceipt } from "../../../../../lib/server/staffing/commands";
import { staffingRequest } from "../../_shared";

export const dynamic = "force-dynamic";
export async function GET(request: Request,
  context: { params: Promise<{ requestKey: string }> }): Promise<Response> {
  return staffingRequest(request, false, async (client, actor) =>
    readStaffingCommandReceipt(actor, (await context.params).requestKey, client));
}
