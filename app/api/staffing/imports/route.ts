import { staffingRequest, staffingQuery } from "../_shared";
import { createImportIntent } from "../../../../lib/server/staffing/imports";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createImportIntent(actor, body, db));
import { listImports } from "../../../../lib/server/staffing/import-read";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => staffingRequest(request, false, (db, actor) => listImports(actor, staffingQuery(request), db));
