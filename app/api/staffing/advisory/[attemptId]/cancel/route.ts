import { z } from "zod";
import { staffingStandaloneRequest } from "../../../_shared";
import { parseStaffing } from "../../../../../../lib/server/staffing/commands";
import { cancelStaffingAdvisory } from "../../../../../../lib/server/staffing/advisory-status";
export const dynamic = "force-dynamic";
export const POST = (request: Request, context: { params: Promise<{ attemptId: string }> }) =>
  staffingStandaloneRequest(request, true, async (actor, body) => {
    parseStaffing(z.object({}).strict(), body);
    return cancelStaffingAdvisory(actor, (await context.params).attemptId);
  });
