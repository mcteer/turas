import { staffingRequest } from "../_shared";
import { prepareStaffingAdvisory } from "../../../../lib/server/staffing/advisory";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => prepareStaffingAdvisory(actor, body, db));
