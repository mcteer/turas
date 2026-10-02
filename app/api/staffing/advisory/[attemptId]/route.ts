import { staffingStandaloneRequest } from "../../_shared";
import { readStaffingAdvisoryStatus } from "../../../../../lib/server/staffing/advisory-status";
export const dynamic = "force-dynamic";
export const GET = (request: Request, context: { params: Promise<{ attemptId: string }> }) =>
  staffingStandaloneRequest(request, false, async actor => readStaffingAdvisoryStatus(actor, (await context.params).attemptId));
