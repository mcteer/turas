import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { STAFFING_LIMITS } from "../../contracts/staffing";
import { staffingReadDependencySchema, assertStaffingDependencySnapshot, mergeStaffingDependencies,
  type StaffingReadDependency } from "../../staffing/dependencies";
import { availabilityFreshness, competencyFreshness } from "../../staffing/freshness";
import { staffingDeliveryContextIdentity } from "../../staffing/context-fingerprint";
import { getServerConfig } from "../config";
import { currentPlanSourceDigest } from "../plans/sources";
import { staffingSha256 } from "./commands";
import { lockApprovedReadInputs } from "./read";
import { lockStaffingPartnerAuthority } from "./partner-authority";
import { readMatchingCalendars } from "./calendar-inputs";
import { staffingFeasibilitySnapshot } from "./matching";
import { readStaffingScenario } from "./scenarios";
import type { ResourceHead } from "./resources";
import type { StaffingToolFenceContext } from "./tool-actor";
import type { resolveStaffingOverlap } from "./temporal";

const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");
const key = (dep: Pick<StaffingReadDependency, "kind" | "inputId">) => `${dep.kind}/${dep.inputId}`;
export type StaffingFenceOptions = { matching?: boolean; resourceIds?: readonly string[];
  preparedOverlap?: { revisionId: string; contentDigest: string; intervals: ReturnType<typeof resolveStaffingOverlap> } };
type Match = Awaited<ReturnType<typeof staffingFeasibilitySnapshot>>;
type Scenario = Awaited<ReturnType<typeof readStaffingScenario>>;
export type StaffingFenceView = { context: StaffingToolFenceContext; baseDependencies: StaffingReadDependency[];
  currentDependencies: Map<string, StaffingReadDependency>; matching: Match | null; scenario: Scenario | null;
  calendars: Awaited<ReturnType<typeof readMatchingCalendars>>; resources: ResourceHead[];
  resourceDependencies: Map<string, StaffingReadDependency[]>; eligibleCompetencies: Set<string> };

/** Capacity and calendar identities cover the bound demand period. Their digest
 * contains every dated revision/generation, including absent/unknown coverage;
 * the scalar generation is never used instead of that complete fingerprint. */
export async function resolveStaffingAdvisoryFence(db: PoolClient, attemptId: string,
  context: StaffingToolFenceContext, options: StaffingFenceOptions = {}): Promise<StaffingFenceView> {
  const { actor, scope, demand, deliveryContext } = context, env = getServerConfig().TURAS_ENVIRONMENT_ID;
  if (!demand.demand || demand.revisionId !== scope.demandRevisionId || demand.contentAvailability !== "readable" || demand.reviewRequired) throw changed();
  const consumed = (await db.query(`SELECT kind,input_id,revision_id,generation,content_digest FROM staffing_advisory_dependencies
    WHERE attempt_id=$1 AND environment_id=$2 AND workspace_id=$3 ORDER BY kind,input_id,revision_id`, [attemptId, env, actor.workspaceId])).rows
    .map(row => staffingReadDependencySchema.parse({ kind: row.kind, inputId: row.input_id, revisionId: row.revision_id,
      generation: Number(row.generation), contentDigest: row.content_digest }));
  if (consumed.length > 200) throw changed();
  const wantsMatch = Boolean(options.matching || consumed.some(dep => dep.kind === "match"));
  const oldCompetencies = consumed.filter(dep => dep.kind === "competency");
  const oldResources = consumed.filter(dep => ["resource", "calendar", "capacity", "partner_eligibility"].includes(dep.kind)).map(dep => dep.inputId);
  const competencyResources = (await db.query(`SELECT resource_id FROM workforce_competencies WHERE id=ANY($1::uuid[])
    AND environment_id=$2 AND workspace_id=$3`, [oldCompetencies.map(dep => dep.inputId), env, actor.workspaceId])).rows.map(row => row.resource_id as string);
  const scenarioHead = scope.scenarioId ? (await db.query(`SELECT customer_id,engagement_id,baseline_id,from_date::text,to_date::text
    FROM staffing_scenarios WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`, [scope.scenarioId, env, actor.workspaceId])).rows[0] : null;
  if (scope.scenarioId && (scope.mode !== "finance" || !scenarioHead || scenarioHead.customer_id !== scope.customerId ||
    scenarioHead.engagement_id !== demand.engagementId || scenarioHead.baseline_id !== demand.baselineId)) throw changed();
  // Finance's engagement UPDATE mutex was acquired before this discovery. It
  // protects first allocation/demand rows as well as their existing identities.
  const scenarioRows = scenarioHead ? (await db.query(`SELECT DISTINCT day.resource_id,day.demand_id FROM staffing_allocation_days day
    JOIN staffing_allocation_revisions v ON v.id=day.revision_id JOIN staffing_demand_revisions original ON original.id=v.demand_revision_id
    WHERE v.environment_id=$1 AND v.workspace_id=$2 AND v.customer_id=$3 AND original.engagement_id=$4 AND original.baseline_id=$5
      AND day.service_date BETWEEN $6 AND $7 ORDER BY day.resource_id,day.demand_id`,
    [env, actor.workspaceId, scope.customerId, demand.engagementId, demand.baselineId, scenarioHead.from_date, scenarioHead.to_date])).rows : [];
  const demandIds = [...new Set([scope.demandId, ...scenarioRows.map(row => row.demand_id as string)])].sort();
  const lockedDemands = (await db.query(`SELECT id,current_revision_id,aggregate_version,state FROM staffing_demands
    WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3 ORDER BY id FOR SHARE`, [demandIds, env, actor.workspaceId])).rows;
  const head = lockedDemands.find(row => row.id === scope.demandId);
  if (lockedDemands.length !== demandIds.length || !head || head.current_revision_id !== demand.revisionId ||
    Number(head.aggregate_version) !== demand.aggregateVersion || head.state !== "qualified") throw changed();
  const active = wantsMatch ? (await db.query(`SELECT id FROM workforce_resources WHERE environment_id=$1 AND workspace_id=$2
    AND active ORDER BY id LIMIT $3`, [env, actor.workspaceId, STAFFING_LIMITS.resources + 1])).rows.map(row => row.id as string) : [];
  if (active.length > STAFFING_LIMITS.resources) throw new HttpFailure(409, "staffing_pool_overflow", "Resource pool exceeds supported scope");
  const resourceIds = [...new Set([...active, ...oldResources, ...competencyResources, ...(options.resourceIds ?? []),
    ...scenarioRows.map(row => row.resource_id as string)])].sort();
  if (resourceIds.length > STAFFING_LIMITS.resources) throw new HttpFailure(409, "staffing_pool_overflow", "Resource dependency union exceeds supported scope");
  const identities = (await db.query<ResourceHead>(`SELECT id,kind,membership_id,partner_organization_id FROM workforce_resources
    WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id`, [env, actor.workspaceId, resourceIds])).rows;
  if (identities.length !== resourceIds.length) throw changed();
  const partner = await lockStaffingPartnerAuthority(db, actor, identities, scope.customerId);
  const skills = [...new Set([...demand.demand.requiredSkills, ...demand.demand.desiredSkills].map(row => row.skillId)
    .concat(consumed.filter(dep => dep.kind === "skill").map(dep => dep.inputId)))].sort();
  const resources = await lockApprovedReadInputs(db, actor, resourceIds, false, oldCompetencies.map(dep => dep.revisionId),
    undefined, "UPDATE", { manual: consumed.filter(dep => dep.kind === "manual_source").map(dep => dep.inputId),
      imported: consumed.filter(dep => dep.kind === "import_source").map(dep => dep.inputId) }, skills);
  // Required skills can have no competency row; the helper locks these alongside
  // all discovered competency skills before taking any resource row lock.
  // Resource mutexes prevent later candidate/publication phantoms while all
  // calendar/capacity periods are acquired in one sorted prefix below.
  await db.query(`SELECT id FROM resource_calendars WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id FOR SHARE`, [resourceIds]);
  for (const table of ["resource_calendar_days", "staffing_capacity_days"] as const) {
    await db.query(`SELECT resource_id,service_date FROM ${table} WHERE resource_id=ANY($1::uuid[])
      AND (service_date BETWEEN $2 AND $3 OR $4::date IS NOT NULL AND service_date BETWEEN $4 AND $5)
      ORDER BY resource_id,service_date FOR SHARE`, [resourceIds, demand.demand.fromDate, demand.demand.toDate,
      scenarioHead?.from_date ?? null, scenarioHead?.to_date ?? null]);
  }
  const calendar = await readMatchingCalendars(db, actor, resourceIds, { fromDate: demand.demand.fromDate, toDate: demand.demand.toDate });
  const skillRows = (await db.query(`SELECT s.id,s.active,s.current_revision_id,s.aggregate_version,v.content_digest FROM workforce_skills s
    JOIN workforce_skill_revisions v ON v.id=s.current_revision_id WHERE s.id=ANY($1::uuid[]) AND s.environment_id=$2 AND s.workspace_id=$3
    ORDER BY s.id`, [skills, env, actor.workspaceId])).rows;
  if (skillRows.length !== skills.length) throw changed();
  const assessments = (await db.query(`SELECT c.id,c.resource_id,c.skill_id,c.current_accepted_revision_id,c.aggregate_version,
    v.content_digest,v.manual_evidence_id,v.source_version_id,v.source_generation,v.assessment_date::text,v.next_review_date::text,
    original.source_id,m.state AS manual_state,m.generation AS manual_generation,s.state AS source_state,s.generation AS source_generation_current,
    s.current_version_id,x.complete,x.scan_clean FROM workforce_competencies c
    LEFT JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
    LEFT JOIN workforce_sources s ON s.id=original.source_id LEFT JOIN workforce_extractions x ON x.id=v.extraction_id
    WHERE c.resource_id=ANY($1::uuid[]) AND c.environment_id=$2 AND c.workspace_id=$3 ORDER BY c.id`, [resourceIds, env, actor.workspaceId])).rows;
  const profiles = (await db.query(`SELECT r.id,p.timezone FROM workforce_resources r JOIN workforce_resource_payloads p
    ON p.revision_id=r.current_revision_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR SHARE OF p`, [resourceIds])).rows;
  const calendarHeads = (await db.query(`SELECT id,resource_id,aggregate_version FROM resource_calendars
    WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id`, [resourceIds])).rows;
  const eligibility = (await db.query(`SELECT resource.id AS resource_id,service.date::text,latest.id,latest.state,latest.content_digest
    FROM workforce_resources resource CROSS JOIN LATERAL unnest($1::date[]) service(date)
    LEFT JOIN LATERAL(SELECT e.id,e.state,e.content_digest FROM workforce_partner_eligibility e WHERE e.resource_id=resource.id
      AND e.customer_id=$2 AND e.environment_id=$3 AND e.workspace_id=$4 AND service.date BETWEEN e.from_date AND e.to_date
      ORDER BY e.revision_number DESC LIMIT 1) latest ON true WHERE resource.id=ANY($5::uuid[]) AND resource.kind='partner'
    ORDER BY resource.id,service.date`, [demand.demand.days.map(day => day.date), scope.customerId, env, actor.workspaceId, resourceIds])).rows;
  const now = ((await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date).toISOString();
  if (Date.parse(deliveryContext.validUntil) <= Date.parse(now)) throw changed();
  const planAudience = (await db.query("SELECT audience FROM delivery_plans WHERE id=$1 AND environment_id=$2 AND workspace_id=$3",
    [demand.planId, env, actor.workspaceId])).rows[0]?.audience;
  if (!["internal", "delivery"].includes(planAudience)) throw changed();
  const baselineSources = await currentPlanSourceDigest(db, actor, demand.planRevisionId, scope.customerId, scope.workloadId, planAudience, true);
  const baseDependencies: StaffingReadDependency[] = [
    { kind: "customer", inputId: scope.customerId, revisionId: scope.customerId, // Profile generations start at zero; dependency versions start at one.
      // The real generation also remains in the exact content fingerprint.
      generation: Number(deliveryContext.contextVersion) + 1,
      contentDigest: staffingSha256(staffingDeliveryContextIdentity(deliveryContext, scope.workloadId)) },
    { kind: "baseline", inputId: demand.baselineId, revisionId: demand.planRevisionId, generation: 1,
      contentDigest: staffingSha256({ baselineDigest: demand.baselineDigest, sourceDigest: baselineSources }) },
    { kind: "demand", inputId: demand.demandId, revisionId: demand.revisionId, generation: demand.aggregateVersion, contentDigest: demand.contentDigest },
  ];
  const currentDependencies = new Map<string, StaffingReadDependency>();
  const add = (dep: StaffingReadDependency) => { const parsed = staffingReadDependencySchema.parse(dep); currentDependencies.set(key(parsed), parsed); return parsed; };
  baseDependencies.forEach(add);
  skillRows.forEach(row => add({ kind: "skill", inputId: row.id, revisionId: row.current_revision_id, generation: Number(row.aggregate_version),
    contentDigest: staffingSha256({ active: row.active, digest: row.content_digest }) }));
  const resourceDependencies = new Map<string, StaffingReadDependency[]>();
  const eligibleCompetencies = new Set<string>();
  const relevantSkills = new Set(skills);
  for (const resource of resources) {
    const deps: StaffingReadDependency[] = [], push = (dep: StaffingReadDependency) => deps.push(add(dep));
    const timezone = profiles.find(row => row.id === resource.id)?.timezone;
    if (!timezone || !resource.current_revision_id) throw changed();
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    push({ kind: "resource", inputId: resource.id, revisionId: resource.current_revision_id, generation: Number(resource.aggregate_version),
      contentDigest: staffingSha256({ active: resource.active, revision: resource.current_revision_id, timezone, localDate }) });
    const days = calendar.get(resource.id)!;
    const calHead = calendarHeads.find(row => row.resource_id === resource.id);
    push({ kind: "calendar", inputId: resource.id, revisionId: calHead?.id ?? resource.current_revision_id,
      generation: Number(calHead?.aggregate_version ?? 1), contentDigest: staffingSha256(days.map(day => ({ date: day.date,
        revisionId: day.revisionId, contentDigest: day.contentDigest, timezone: day.timezone, timezoneDataVersion: day.timezoneDataVersion,
        freshness: availabilityFreshness(day.observedAt && day.nextReviewAt ? { observedAt: day.observedAt, nextReviewAt: day.nextReviewAt } : null, now).freshness }))) });
    push({ kind: "capacity", inputId: resource.id, revisionId: resource.current_revision_id, generation: Number(resource.aggregate_version),
      contentDigest: staffingSha256(days.map(day => ({ date: day.date, generation: day.capacityGeneration ?? 1, confirmedMinutes: day.confirmedMinutes, remainingMinutes: day.remainingMinutes }))) });
    for (const assessment of assessments.filter(row => row.resource_id === resource.id && row.current_accepted_revision_id && relevantSkills.has(row.skill_id))) {
      const eligible = assessment.manual_evidence_id
        ? assessment.manual_state === "active" && Number(assessment.manual_generation) === Number(assessment.source_generation)
        : ["ready", "reviewed"].includes(assessment.source_state) && Number(assessment.source_generation_current) === Number(assessment.source_generation) &&
          assessment.current_version_id === assessment.source_version_id && assessment.complete === true && assessment.scan_clean === true;
      if (eligible && skillRows.find(row => row.id === assessment.skill_id)?.active === true) eligibleCompetencies.add(assessment.id);
      push({ kind: "competency", inputId: assessment.id, revisionId: assessment.current_accepted_revision_id,
        generation: Number(assessment.aggregate_version), contentDigest: staffingSha256({ digest: assessment.content_digest,
          sourceEligibility: { manualState: assessment.manual_state, manualGeneration: assessment.manual_generation,
            sourceState: assessment.source_state, sourceGeneration: assessment.source_generation_current,
            version: assessment.current_version_id, complete: assessment.complete, scanClean: assessment.scan_clean },
          freshness: competencyFreshness({ assessmentDate: assessment.assessment_date, nextReviewDate: assessment.next_review_date }, localDate, demand.demand.toDate) }) });
      if (assessment.manual_evidence_id) push({ kind: "manual_source", inputId: assessment.manual_evidence_id, revisionId: assessment.manual_evidence_id,
        generation: Number(assessment.manual_generation), contentDigest: staffingSha256({ state: assessment.manual_state, generation: assessment.manual_generation }) });
      else if (assessment.source_id) push({ kind: "import_source", inputId: assessment.source_id, revisionId: assessment.current_version_id,
        generation: Number(assessment.source_generation_current), contentDigest: staffingSha256({ state: assessment.source_state,
          version: assessment.current_version_id, generation: assessment.source_generation_current }) });
    }
    if (resource.kind === "partner") {
      push({ kind: "partner_eligibility", inputId: resource.id, revisionId: resource.current_revision_id, generation: Number(resource.aggregate_version),
        contentDigest: staffingSha256({ partner, declarations: eligibility.filter(row => row.resource_id === resource.id) }) });
      const grant = partner.grants.find(row => row.membership_id === resource.membership_id);
      if (grant) push({ kind: "partner_grant", inputId: grant.id, revisionId: grant.id, generation: Number(grant.revision),
        contentDigest: staffingSha256({ state: grant.state, customerId: scope.customerId, membershipId: grant.membership_id }) });
    }
    resourceDependencies.set(resource.id, deps);
  }
  let matching: Match | null = null;
  if (wantsMatch) {
    if (demand.demand.overlap && (!options.preparedOverlap || options.preparedOverlap.revisionId !== demand.revisionId ||
      options.preparedOverlap.contentDigest !== demand.contentDigest)) throw changed();
    matching = await staffingFeasibilitySnapshot(db, actor, scope.demandId, demand, demand.demand.overlap ? options.preparedOverlap!.intervals : []);
    for (const dep of consumed.filter(dep => dep.kind === "match")) {
      const receipt = (await db.query(`SELECT id FROM staffing_advisory_read_receipts WHERE id=$1 AND attempt_id=$2
        AND tool_name='match_staffing_resources'`, [dep.inputId, attemptId])).rows[0];
      if (!receipt) throw changed();
      add({ kind: "match", inputId: receipt.id, revisionId: demand.revisionId, generation: 1, contentDigest: matching.inputDigest });
    }
  }
  let scenario: Scenario | null = null;
  if (scope.scenarioId) {
    scenario = await readStaffingScenario(actor, scope.scenarioId, db);
    if (scenario.contentAvailability !== "readable" || !scenario.content || scenario.status === "stale") throw changed();
    add({ kind: "scenario", inputId: scope.scenarioId, revisionId: scope.scenarioId, generation: 1, contentDigest: scenario.contentDigest });
    for (const input of scenario.content.inputRevisions.filter(input => ["rate", "revenue", "nonlabor"].includes(input.kind))) {
      add({ kind: "finance_input", inputId: input.inputId, revisionId: input.revisionId, generation: input.generation, contentDigest: input.contentDigest });
    }
    if (scenario.content.policyDecisionId) add({ kind: "policy", inputId: scenario.content.policyDecisionId, revisionId: scenario.content.policyDecisionId,
      generation: 1, contentDigest: scenario.content.inputPolicyDigest });
  }
  const current = consumed.map(dep => { const resolved = currentDependencies.get(key(dep)); if (!resolved) throw changed(); return resolved; });
  assertStaffingDependencySnapshot(consumed, current);
  return { context, baseDependencies, currentDependencies, matching, scenario, calendars: calendar, resources, resourceDependencies, eligibleCompetencies };
}

/** Selected model-visible resources consume their exact current identities;
 * comparison replay additionally recomputes the complete authorized pool. */
export function staffingToolDependencies(view: StaffingFenceView, resourceIds: readonly string[] = [], matchReceiptId?: string) {
  let dependencies = [...view.baseDependencies];
  for (const resourceId of resourceIds) {
    const found = view.resourceDependencies.get(resourceId); if (!found) throw changed();
    dependencies = mergeStaffingDependencies(dependencies, found);
  }
  const skills = [...view.currentDependencies.values()].filter(dep => dep.kind === "skill");
  dependencies = mergeStaffingDependencies(dependencies, skills);
  if (matchReceiptId) {
    if (!view.matching) throw changed();
    dependencies = mergeStaffingDependencies(dependencies, [{ kind: "match", inputId: matchReceiptId,
      revisionId: view.context.demand.revisionId, generation: 1, contentDigest: view.matching.inputDigest }]);
  }
  return dependencies;
}

/** Finance payloads consume every entered input and the exact policy decision. */
export function staffingScenarioToolDependencies(view: StaffingFenceView) {
  if (!view.scenario?.content || view.context.scope.mode !== "finance") throw changed();
  return mergeStaffingDependencies(view.baseDependencies, [...view.currentDependencies.values()]
    .filter(dep => ["scenario", "finance_input", "policy"].includes(dep.kind)));
}

/** Source identities are retained in the server's authority union. Model citations
 * never reveal a withdrawn personnel source or its withheld assessment revision. */
export function staffingModelCitations(view: StaffingFenceView, dependencies: readonly StaffingReadDependency[]) {
  return dependencies.filter(dep => !["manual_source", "import_source", "partner_grant"].includes(dep.kind) &&
    (dep.kind !== "competency" || view.eligibleCompetencies.has(dep.inputId)));
}
