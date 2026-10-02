import { staffingRequest } from "../../_shared";
import { approveFinancePolicy, readFinancePolicy } from "../../../../../lib/server/staffing/economics";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => approveFinancePolicy(actor, body, db));
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => readFinancePolicy(actor, db));
