import { staffingRequest, staffingId, staffingQuery } from "../../../_shared";
import { correctAssessment } from "../../../../../../lib/server/staffing/competencies";
type Context = { params: Promise<{ competencyId: string }> };
export const POST = async (request: Request, context: Context) => {
  const { competencyId } = await context.params;
  return staffingRequest(request, true, (db, actor, body) => correctAssessment(actor, staffingId(competencyId), body, db));
};

import { readCompetencyHistory } from "../../../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: Context) => {
  const { competencyId } = await context.params;
  return staffingRequest(request, false, (db, actor) => readCompetencyHistory(actor, staffingId(competencyId), staffingQuery(request), db));
};
