import { staffingRequest, staffingId } from "../../../_shared";
import { HttpFailure } from "../../../../../../lib/contracts/http";
import { readStaffingScenario } from "../../../../../../lib/server/staffing/scenarios";
export const dynamic = "force-dynamic";
export const GET = (request: Request, context: { params: Promise<{ scenarioId: string }> }) => staffingRequest(request, false, async (db, actor) => {
  if (new URL(request.url).search) throw new HttpFailure(422, "invalid_input", "Invalid scenario query");
  return readStaffingScenario(actor, staffingId((await context.params).scenarioId), db);
});
