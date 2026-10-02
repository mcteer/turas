import type { PoolClient } from "pg";
import { staffingAssignmentPageSchema } from "../../contracts/staffing-assignments";
import { staffingListSchema } from "../../contracts/staffing";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { lockPlanActor, type PlanActor } from "../plans/policy";
import { lockApprovedReadInputs, staffingPageCursor, readStaffingPageCursor } from "./read";
import { parseStaffing, staffingSha256 } from "./commands";
import { lockStaffingPartnerAuthority, staffingPartnerEligible } from "./partner-authority";
import { availabilityFreshness, competencyFreshness } from "../../staffing/freshness";
import type { ResourceHead } from "./resources";

/** Called only after the accepted engagement/source projection. Live customer
 * grants precede assignment discovery; personnel payloads follow source locks.
 * Historic ledger rows and working/tentative proposals never enter this view. */
export async function readDeliveryAssignments(db: PoolClient, actor: PlanActor,
  engagement: { engagementId: string; customerId: string; activeBaselineId: string; audience: string;
    contentAvailability: string; reviewRequired: boolean }, rawPaging: unknown = {}) {
  const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (Number(marker?.schema_version ?? 0) < 34) return null;
  await lockPlanActor(db, actor, engagement.customerId, false);
  if (actor.kind === "partner" && engagement.audience !== "delivery") throw hiddenRecord();
  const paging = parseStaffing(staffingListSchema, rawPaging), env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const scope = { environment: env, workspace: actor.workspaceId, actor: actor.membershipId, session: actor.sessionId,
    projection: "delivery_assignments", engagementId: engagement.engagementId, baselineId: engagement.activeBaselineId };
  const after = readStaffingPageCursor(paging.cursor, scope);
  const asOf = ((await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date).toISOString();
  const locked = (await db.query(`SELECT active_baseline_id FROM engagements WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE`,
    [engagement.engagementId, env, actor.workspaceId])).rows[0];
  if (locked?.active_baseline_id !== engagement.activeBaselineId) throw new HttpFailure(409, "baseline_changed", "Engagement changed; reload");
  const select = () => db.query(`SELECT a.id,a.resource_id,a.demand_id,a.confirmed_revision_id,d.current_revision_id AS current_demand_revision,
    d.state AS demand_state,v.demand_revision_id,v.resource_timezone,original.baseline_id,
    EXISTS(SELECT 1 FROM staffing_allocation_days day WHERE day.allocation_id=a.id AND day.revision_id=a.confirmed_revision_id
      AND day.service_date > ($7::timestamptz AT TIME ZONE v.resource_timezone)::date) AS has_future
    FROM staffing_allocations a JOIN staffing_allocation_revisions v ON v.id=a.confirmed_revision_id
    JOIN staffing_demand_revisions original ON original.id=v.demand_revision_id JOIN staffing_demands d ON d.id=a.demand_id
    WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3 AND original.engagement_id=$4
      AND a.state='confirmed' AND ($5::uuid IS NULL OR a.id>$5)
      AND EXISTS(SELECT 1 FROM staffing_allocation_days day WHERE day.allocation_id=a.id AND day.revision_id=a.confirmed_revision_id
        AND day.service_date > ($7::timestamptz AT TIME ZONE v.resource_timezone)::date)
    ORDER BY a.id LIMIT $6`, [env, actor.workspaceId, engagement.customerId, engagement.engagementId, after, paging.pageSize + 1, asOf]);
  const found = (await select()).rows, page = found.slice(0, paging.pageSize);
  const demandIds = [...new Set(page.map(row => row.demand_id))].sort();
  await db.query("SELECT id FROM staffing_demands WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [demandIds]);
  const resourceIds = [...new Set(page.map(row => row.resource_id as string))].sort();
  const identities = (await db.query<ResourceHead>(`SELECT id,kind,membership_id,partner_organization_id FROM workforce_resources
    WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id`, [env, actor.workspaceId, resourceIds])).rows;
  const partnerAuthority = await lockStaffingPartnerAuthority(db, actor, identities, engagement.customerId);
  const resources = await lockApprovedReadInputs(db, actor, resourceIds);
  const sources = (await db.query(`SELECT c.resource_id, bool_and(COALESCE(CASE WHEN v.manual_evidence_id IS NOT NULL THEN m.state='active' AND m.generation=v.source_generation
    ELSE s.state IN ('ready','reviewed') AND s.generation=v.source_generation AND s.current_version_id=v.source_version_id
      AND x.complete AND x.scan_clean END,false)) AS eligible
    FROM workforce_competencies c JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
    LEFT JOIN workforce_sources s ON s.id=original.source_id LEFT JOIN workforce_extractions x ON x.id=v.extraction_id
    WHERE c.resource_id=ANY($1::uuid[]) GROUP BY c.resource_id`, [resourceIds])).rows;
  const assessments = (await db.query(`SELECT c.resource_id,skill.active,v.assessment_date::text,v.next_review_date::text
    FROM workforce_competencies c JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    JOIN workforce_skills skill ON skill.id=c.skill_id WHERE c.resource_id=ANY($1::uuid[])`, [resourceIds])).rows;
  await db.query("SELECT id FROM resource_calendars WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id FOR SHARE", [resourceIds]);
  await db.query("SELECT id FROM staffing_allocations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [page.map(row => row.id).sort()]);
  if (staffingSha256(found) !== staffingSha256((await select()).rows)) throw new HttpFailure(409, "source_changed", "Assignments changed; reload");
  const days = (await db.query(`SELECT day.allocation_id,day.service_date::text,day.minutes,latest.state AS partner_state,
    current.revision_id AS calendar_revision_id,calendar.timezone AS calendar_timezone,calendar.observed_at,calendar.next_review_at,
    profile.timezone AS current_timezone,($4::timestamptz AT TIME ZONE profile.timezone)::date::text AS local_today
    FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id
    JOIN staffing_allocation_revisions v ON v.id=a.confirmed_revision_id
    JOIN workforce_resources resource ON resource.id=a.resource_id
    JOIN workforce_resource_payloads profile ON profile.revision_id=resource.current_revision_id
    LEFT JOIN resource_calendar_days current ON current.resource_id=a.resource_id AND current.service_date=day.service_date
    LEFT JOIN resource_calendar_revisions calendar ON calendar.id=current.revision_id AND calendar.resource_id=a.resource_id
    LEFT JOIN LATERAL(SELECT e.state FROM workforce_partner_eligibility e WHERE e.resource_id=a.resource_id
      AND e.customer_id=$2 AND e.environment_id=$3 AND e.workspace_id=a.workspace_id
      AND day.service_date BETWEEN e.from_date AND e.to_date ORDER BY e.revision_number DESC LIMIT 1) latest ON true
    WHERE a.id=ANY($1::uuid[]) AND day.revision_id=a.confirmed_revision_id
      AND day.service_date > ($4::timestamptz AT TIME ZONE v.resource_timezone)::date
    ORDER BY a.id,day.service_date`, [page.map(row => row.id), engagement.customerId, env, asOf])).rows;
  const resourceById = new Map(resources.map(resource => [resource.id, resource]));
  const sourceByResource = new Map(sources.map(source => [source.resource_id, source]));
  const assignmentDays = new Map(page.map(row => [row.id, days.filter(day => day.allocation_id === row.id)]));
  const currentPartner = (row: typeof page[number]) => {
    const resource = resourceById.get(row.resource_id);
    const future = assignmentDays.get(row.id)!;
    return resource?.kind !== "partner" || staffingPartnerEligible(resource, partnerAuthority,
      future.map(day => ({ state: day.partner_state })), future.length) === true;
  };
  const narrativeIds = page.filter(row => engagement.contentAvailability === "readable" && row.baseline_id === engagement.activeBaselineId &&
    row.current_demand_revision === row.demand_revision_id && row.demand_state === "qualified" &&
    resourceById.get(row.resource_id)?.active && sourceByResource.get(row.resource_id)?.eligible !== false &&
    sourceByResource.get(row.resource_id)?.eligible !== null && currentPartner(row)).map(row => row.id);
  // Select only permitted fields, never complete personnel or demand JSON.
  const prose = (await db.query(`SELECT a.id,p.display_name,d.content->>'role' AS role FROM staffing_allocations a
    JOIN workforce_resources r ON r.id=a.resource_id JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id
    JOIN staffing_allocation_revisions v ON v.id=a.confirmed_revision_id JOIN staffing_demand_payloads d ON d.revision_id=v.demand_revision_id
    WHERE a.id=ANY($1::uuid[]) FOR SHARE OF p,d`, [narrativeIds])).rows;
  return staffingAssignmentPageSchema.parse({ items: page.map(row => {
    const text = prose.find(item => item.id === row.id);
    const future = assignmentDays.get(row.id)!;
    const resourceAssessments = assessments.filter(item => item.resource_id === row.resource_id);
    const freshnessReview = !future.length || !resourceAssessments.length || future.some(day =>
      !day.calendar_revision_id || day.calendar_timezone !== day.current_timezone ||
      !availabilityFreshness(day.calendar_revision_id ? { observedAt: new Date(day.observed_at).toISOString(),
        nextReviewAt: new Date(day.next_review_at).toISOString() } : null, asOf).validThrough ||
      resourceAssessments.some(item => !item.active || !competencyFreshness({ assessmentDate: item.assessment_date,
        nextReviewDate: item.next_review_date }, day.local_today, day.service_date).validThrough));
    return { assignmentId: row.id, displayName: text?.display_name ?? null, deliveryRole: text?.role ?? null,
      days: future.map(day => ({ date: day.service_date, minutes: Number(day.minutes) })),
      reviewRequired: engagement.reviewRequired || !text || freshnessReview || row.baseline_id !== engagement.activeBaselineId ||
        row.current_demand_revision !== row.demand_revision_id || row.demand_state !== "qualified" };
  }), nextCursor: found.length > paging.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null });
}
