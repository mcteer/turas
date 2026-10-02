import { staffingRequest, staffingQuery, staffingId } from "../_shared";
import { createManualAssessment } from "../../../../lib/server/staffing/competencies";
export const POST = (request: Request) => staffingRequest(request, true, (db, actor, body) => createManualAssessment(actor, body, db));

import { listResources, readManagerCompetencies, readResourceSkills, isStaffingManager } from "../../../../lib/server/staffing/read";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => staffingRequest(request, false, async (db, actor) => {
  const query = staffingQuery(request, ["resourceId"]), rawId = new URL(request.url).searchParams.get("resourceId");
  if (rawId !== null) {
    const resourceId = staffingId(rawId);
    return isStaffingManager(actor) ? readManagerCompetencies(actor, resourceId, query, db) : readResourceSkills(actor, resourceId, query, db);
  }
  const roster = await listResources(actor, query, db);
  return { items: roster.items.map(resource => ({ resourceId: resource.resourceId, skills: resource.skills,
    skillsNextCursor: resource.skillsNextCursor })), nextCursor: roster.nextCursor };
});
