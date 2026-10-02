import { staffingRequest, staffingId } from "../../_shared";
import { reviseSkill } from "../../../../../lib/server/staffing/skills";
type Context = { params: Promise<{ skillId: string }> };
export const PATCH = async (request: Request, context: Context) => {
  const { skillId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => reviseSkill(actor, staffingId(skillId), body, db));
};
