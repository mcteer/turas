import { staffingRequest } from "../_shared";
import { decideCompetencies } from "../../../../lib/server/staffing/competencies";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => decideCompetencies(actor, body, db));
