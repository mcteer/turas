import { staffingRequest, staffingId } from "../../_shared";
import { withdrawManualEvidence } from "../../../../../lib/server/staffing/lifecycle";
export const dynamic = "force-dynamic";
export const DELETE = async (request: Request, context: { params: Promise<{ evidenceId: string }> }) => {
  const { evidenceId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => withdrawManualEvidence(actor, staffingId(evidenceId), body, db));
};
