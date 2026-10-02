import { staffingRequest, staffingQuery } from "../_shared";
import { createResource } from "../../../../lib/server/staffing/resources";
import { listResources } from "../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => listResources(actor, staffingQuery(request), db));
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createResource(actor, body, db));
