import { staffingRequest, staffingQuery } from "../_shared";
import { createSkill } from "../../../../lib/server/staffing/skills";
import { listSkills } from "../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => listSkills(actor, staffingQuery(request), db));
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createSkill(actor, body, db));
