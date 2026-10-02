import { staffingRequest, staffingId, staffingQuery } from "../../../_shared";
import { readResourceSkills } from "../../../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ resourceId: string }> }) => {
  const { resourceId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readResourceSkills(actor, staffingId(resourceId), staffingQuery(request), db));
};
