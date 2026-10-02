import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema, STAFFING_LIMITS } from "../../contracts/staffing";
import { staffingCreateMatchSchema, staffingMatchPageSchema } from "../../contracts/staffing-matching";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { readDemand } from "./demands";
import { lockApprovedReadInputs, staffingPageCursor, readStaffingPageCursor } from "./read";
import { parseStaffing, runStaffingCommand, staffingSha256, tryStaffingCommandReplay } from "./commands";
import { matchingCalendarSignature, readMatchingCalendars } from "./calendar-inputs";
import { resolveStaffingOverlap } from "./temporal";
import { lockStaffingPartnerAuthority, staffingPartnerEligible } from "./partner-authority";
import { recordStaffingTelemetry } from "./telemetry";
import { evaluateStaffingMatches, STAFFING_MATCHING_VERSION, type StaffingMatchingResource } from "../../staffing/matching";
type Demand = Awaited<ReturnType<typeof readDemand>>;
type Overlap = ReturnType<typeof resolveStaffingOverlap>;
const changed = () => new HttpFailure(409, "source_changed", "Matching inputs changed; compute a new comparison");
function requireQualified(demand: Demand) {
  if (demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable" || !demand.demand) {
    throw new HttpFailure(409, "demand_conflict", "Current readable qualified demand required");
  }
}
async function pool(db: PoolClient, actor: StaffingActor, selected?: readonly string[]) {
  if (selected) {
    if (selected.length > STAFFING_LIMITS.resources || new Set(selected).size !== selected.length) throw new HttpFailure(422, "invalid_input", "Invalid staffing resource scope");
    selected.forEach(id => parseStaffing(staffingIdSchema, id));
  }
  const rows = (await db.query(`SELECT id,kind,membership_id,partner_organization_id,current_revision_id,aggregate_version
    FROM workforce_resources WHERE environment_id=$1 AND workspace_id=$2
      AND ($4::uuid[] IS NULL AND active OR $4::uuid[] IS NOT NULL AND id=ANY($4)) ORDER BY id LIMIT $3`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, STAFFING_LIMITS.resources + 1, selected ?? null])).rows;
  if (selected && rows.length !== selected.length) throw hiddenRecord();
  if (rows.length > STAFFING_LIMITS.resources) throw new HttpFailure(409, "staffing_pool_overflow", "Resource pool exceeds supported matching scope");
  return rows;
}
function localDate(asOf: string, timezone: string, cache: Map<string, Intl.DateTimeFormat>) {
  let format = cache.get(timezone);
  if (!format) { format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit" }); cache.set(timezone, format); }
  const parts = format.formatToParts(new Date(asOf)), part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** One whole authorized pool and one bounded set of source, skill, competency,
 * calendar and capacity queries. No per-resource retrieval or finance joins. */
type FeasibilityOptions = { resourceIds?: readonly string[]; days?: { date: string; requiredMinutes: number }[];
  capacityLock?: "SHARE" | "none"; credits?: readonly { resourceId: string; date: string; minutes: number }[];
  evaluatedResourceId?: string; /** Caller read this demand under the same still-open transaction and retained its source/head locks. */
  preparedInCurrentTransaction?: true };
/** Internal commitment options are never accepted by matching routes. Public
 * matching evaluates the whole active pool with uncredited usage. A decision
 * using unlocked capacity reads must lock/recheck all generations in its full
 * old/new ledger union before approving any write. */
export async function staffingFeasibilitySnapshot(db: PoolClient, actor: StaffingActor, demandId: string,
  prepared: Demand, overlap: Overlap, options: FeasibilityOptions = {}) {
  const demand = options.preparedInCurrentTransaction ? prepared : await readDemand(actor, demandId, db); requireQualified(demand);
  if (demand.revisionId !== prepared.revisionId || demand.aggregateVersion !== prepared.aggregateVersion || demand.contentDigest !== prepared.contentDigest) throw changed();
  const input = demand.demand!, requestedDays = options.days ?? input.days;
  const discovered = await pool(db, actor, options.resourceIds), ids = discovered.map(row => row.id as string);
  if (options.evaluatedResourceId && !ids.includes(options.evaluatedResourceId)) throw hiddenRecord();
  const partner = await lockStaffingPartnerAuthority(db, actor, discovered, demand.customerId);
  const skillIds = [...new Set([...input.requiredSkills, ...input.desiredSkills].map(skill => skill.skillId))].sort();
  const heads = await lockApprovedReadInputs(db, actor, ids, false, [], skillIds);
  const profiles = (await db.query(`SELECT r.id,p.display_name,p.timezone,p.region_code FROM workforce_resources r
    JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR SHARE OF p`, [ids])).rows;
  const skillHeads = (await db.query(`SELECT id,active,aggregate_version,current_revision_id FROM workforce_skills
    WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, skillIds])).rows;
  const skillNames = (await db.query(`SELECT skill.id,payload.name FROM workforce_skills skill
    JOIN workforce_skill_payloads payload ON payload.revision_id=skill.current_revision_id
    WHERE skill.environment_id=$1 AND skill.workspace_id=$2 AND skill.id=ANY($3::uuid[]) ORDER BY skill.id FOR SHARE OF payload`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, skillIds])).rows.map(row => ({ skillId: row.id as string, name: row.name as string }));
  const sourceCheckStarted = performance.now();
  const assessments = (await db.query(`SELECT c.id AS competency_id,c.resource_id,c.skill_id,c.aggregate_version,
    c.current_accepted_revision_id,v.level,v.assessment_date::text,v.next_review_date::text,v.content_digest,v.source_generation,
    m.id AS manual_id,m.generation AS manual_generation,m.state AS manual_state,
    s.id AS source_id,s.generation AS source_generation_current,s.state AS source_state,s.current_version_id,
    (skill.active AND (m.state='active' AND m.generation=v.source_generation OR
      s.state IN ('ready','reviewed') AND s.generation=v.source_generation AND s.current_version_id=v.source_version_id
      AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.id=v.extraction_id AND x.complete AND x.scan_clean))) AS eligible
    FROM workforce_competencies c LEFT JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    JOIN workforce_skills skill ON skill.id=c.skill_id LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id
    LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id LEFT JOIN workforce_sources s ON s.id=original.source_id
    WHERE c.environment_id=$1 AND c.workspace_id=$2 AND c.resource_id=ANY($3::uuid[]) AND c.skill_id=ANY($4::uuid[])
    ORDER BY c.resource_id,c.skill_id`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, ids, skillIds])).rows;
  const excluded = assessments.filter(row => row.current_accepted_revision_id && row.eligible !== true).length;
  if (excluded) recordStaffingTelemetry({ operation: "source_lifecycle", outcome: "excluded", count: excluded,
    durationMs: Math.min(86_400_000, Math.max(0, performance.now() - sourceCheckStarted)) });
  const dates = requestedDays.map(day => day.date).sort();
  const calendar = await readMatchingCalendars(db, actor, ids, { fromDate: dates[0], toDate: dates.at(-1) }, overlap, options.capacityLock);
  const eligibility = (await db.query(`SELECT resource.id AS resource_id,service.date::text,latest.id,latest.state,latest.content_digest
    FROM workforce_resources resource CROSS JOIN LATERAL unnest($1::date[]) AS service(date)
    LEFT JOIN LATERAL(SELECT e.id,e.state,e.content_digest FROM workforce_partner_eligibility e
      WHERE e.resource_id=resource.id AND e.customer_id=$2 AND e.environment_id=$3 AND e.workspace_id=$4
        AND service.date BETWEEN e.from_date AND e.to_date ORDER BY e.revision_number DESC LIMIT 1) latest ON true
    WHERE resource.id=ANY($5::uuid[]) AND resource.kind='partner' ORDER BY resource.id,service.date`,
    [requestedDays.map(day => day.date), demand.customerId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, ids])).rows;
  const now = new Date().toISOString(), formatters = new Map<string, Intl.DateTimeFormat>();
  const profilesById = new Map(profiles.map(row => [row.id as string, row]));
  const calendarById = new Map([...calendar].map(([id, days]) => [id, new Map(days.map(day => [day.date, day]))]));
  const assessmentsById = new Map<string, typeof assessments>();
  for (const assessment of assessments) {
    const key = assessment.resource_id as string;
    const group = assessmentsById.get(key) ?? [];
    group.push(assessment); assessmentsById.set(key, group);
  }
  const eligibilityById = new Map<string, typeof eligibility>();
  for (const entry of eligibility) {
    const key = entry.resource_id as string;
    const group = eligibilityById.get(key) ?? [];
    group.push(entry); eligibilityById.set(key, group);
  }
  const rows: StaffingMatchingResource[] = heads.map(head => {
    const profile = profilesById.get(head.id); if (!profile) throw hiddenRecord();
    const days = requestedDays.map(request => calendarById.get(head.id)?.get(request.date)!);
    const partnerEligible = staffingPartnerEligible(head, partner, eligibilityById.get(head.id) ?? [], requestedDays.length);
    const certified = days.every(day => day.revisionId && day.timezone === profile.timezone);
    return { resourceId: head.id, active: head.active, regionCode: profile.region_code, kind: head.kind,
      asOfDate: localDate(now, profile.timezone, formatters), partnerEligible,
      calendar: certified ? { observedAt: days.map(day => day.observedAt!).sort()[0], nextReviewAt: days.map(day => day.nextReviewAt!).sort()[0] } : null,
      skills: (assessmentsById.get(head.id) ?? []).map(row => ({ skillId: row.skill_id as string, level: Number(row.level ?? 0),
        eligible: row.eligible === true, assessmentDate: row.assessment_date ?? null, nextReviewDate: row.next_review_date ?? null })),
      days: days.map(day => ({ date: day.date, certified: !!day.revisionId && day.timezone === profile.timezone,
        remainingMinutes: day.timezone === profile.timezone && day.remainingMinutes !== null ? day.remainingMinutes +
          (options.credits ?? []).filter(row => row.resourceId === head.id && row.date === day.date).reduce((sum, row) => sum + row.minutes, 0) : null,
        overlapMinutes: day.timezone === profile.timezone ? day.overlapMinutes : null })) };
  });
  const matches = evaluateStaffingMatches({ requiredSkills: input.requiredSkills, desiredSkills: input.desiredSkills, days: requestedDays,
    allowedRegions: input.allowedRegions, overlapRequired: !!input.overlap, minimumOverlapMinutes: input.overlap?.minimumOverlapMinutes ?? null },
    options.evaluatedResourceId ? rows.filter(row => row.resourceId === options.evaluatedResourceId) : rows, now);
  const after = await pool(db, actor, options.resourceIds);
  if (staffingSha256(after) !== staffingSha256(discovered)) throw changed();
  // A first review materializes a zero-usage generation-one ledger after the
  // unlocked feasibility read. Normalize that implicit identity for decisions;
  // the decision suffix must verify generation=1 and confirmedMinutes=0 under
  // the union locks before it may use this digest. Public matches stay strict.
  const calendarDependencies = options.capacityLock === "none"
    ? [...calendar].filter(([id]) => !options.evaluatedResourceId || id === options.evaluatedResourceId)
      .map(([id, days]) => [id, days.filter(day => requestedDays.some(request => request.date === day.date))
        .map(day => ({ ...day, capacityGeneration: day.capacityGeneration ?? 1 }))]) : [...calendar];
  const baseDependencies = { demand: { revisionId: demand.revisionId, contentDigest: demand.contentDigest, aggregateVersion: demand.aggregateVersion },
    pool: after, skills: skillHeads, assessments, partner, eligibility,
    localDates: rows.map(row => [row.resourceId, row.asOfDate]) };
  const inputDigest = options.capacityLock === "none"
    ? staffingSha256({ ...baseDependencies, calendars: calendarDependencies, matches })
    : staffingSha256({ ...baseDependencies, calendarSignature: matchingCalendarSignature(calendar),
      formulaVersion: STAFFING_MATCHING_VERSION,
      // Day identities and usage are covered by the locked calendar signature.
      // Keep time-sensitive source and availability outcomes so a review
      // deadline crossing still invalidates an unexpired result.
      eligibilityOutcomes: matches.map(match => ({ resourceId: match.resourceId, status: match.status,
        availabilityFreshness: match.availabilityFreshness, desiredSkillCount: match.desiredSkillCount,
        minimumRemainingAfterRequest: match.minimumRemainingAfterRequest,
        constraints: match.constraints.filter(constraint => !constraint.date) })) });
  return { demand, matches, profiles, skillNames, calendar, resources: heads, inputDigest, asOf: now,
    dependencyMetadata: { skills: skillHeads, assessments, partner, eligibility } };
}
async function prepare(actor: StaffingActor, demandId: string) {
  const demand = await readDemand(actor, demandId); requireQualified(demand);
  // Package loading and local endpoint resolution must not occur under DB locks.
  const overlap = demand.demand!.overlap ? resolveStaffingOverlap(demand.demand!.overlap) : [];
  return { demand, overlap };
}
export async function createMatchingResult(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const demandId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingCreateMatchSchema, raw);
  const prior = await tryStaffingCommandReplay(actor, { ...input, demandId, action: "matching_create" }, { capability: "operational" });
  if (prior) return prior;
  const prepared = await prepare(actor, demandId);
  if (prepared.demand.revisionId !== input.revisionId || prepared.demand.contentDigest !== input.contentDigest ||
    prepared.demand.aggregateVersion !== input.expectedAggregateVersion) throw new HttpFailure(409, "version_conflict", "Demand changed; reload");
  return runStaffingCommand(actor, { ...input, demandId, action: "matching_create" }, { capability: "operational", customerId: prepared.demand.customerId }, async db => {
    const current = await staffingFeasibilitySnapshot(db, actor, demandId, prepared.demand, prepared.overlap), id = randomUUID();
    const expiresAt = new Date(Date.parse(current.asOf) + 600_000).toISOString();
    await db.query(`INSERT INTO staffing_match_results(id,environment_id,workspace_id,demand_id,demand_revision_id,input_digest,
      formula_version,as_of,expires_at,dependencies) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, demandId, current.demand.revisionId, current.inputDigest,
        STAFFING_MATCHING_VERSION, current.asOf, expiresAt, JSON.stringify({ actorMembershipId: actor.membershipId,
          demandVersion: current.demand.aggregateVersion, snapshotDigest: current.inputDigest })]);
    return { entityId: id, demandId, revisionId: current.demand.revisionId, contentDigest: current.inputDigest, expiresAt, state: "ready" };
  });
}
export async function readMatchingResult(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const demandId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingMatchPageSchema, raw);
  return withTransaction(async db => {
    await lockStaffingActor(db, actor, "operational");
    const result = (await db.query(`SELECT id,demand_revision_id,input_digest,formula_version,as_of,expires_at,dependencies
      FROM staffing_match_results WHERE id=$1 AND demand_id=$2 AND environment_id=$3 AND workspace_id=$4`,
      [input.resultId, demandId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!result || result.dependencies.actorMembershipId !== actor.membershipId) throw hiddenRecord();
    const prepared = await readDemand(actor, demandId, db); requireQualified(prepared);
    const overlap = prepared.demand!.overlap ? resolveStaffingOverlap(prepared.demand!.overlap) : [];
    if (new Date(result.expires_at).getTime() <= Date.now() || result.formula_version !== STAFFING_MATCHING_VERSION ||
      result.demand_revision_id !== prepared.revisionId || result.dependencies.demandVersion !== prepared.aggregateVersion) throw changed();
    const current = await staffingFeasibilitySnapshot(db, actor, demandId, prepared, overlap, { preparedInCurrentTransaction: true });
    if (current.inputDigest !== result.input_digest || result.dependencies.snapshotDigest !== current.inputDigest ||
      new Date(result.expires_at).getTime() <= Date.now()) throw changed();
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId, actor: actor.membershipId,
      projection: "staffing-matches", demand: demandId, result: input.resultId, digest: current.inputDigest };
    const after = readStaffingPageCursor(input.cursor, scope), start = after ? current.matches.findIndex(row => row.resourceId === after) + 1 : 0;
    if (after && start === 0) throw new HttpFailure(422, "invalid_input", "Invalid matching cursor");
    const selected = current.matches.slice(start, start + input.pageSize);
    return { contractVersion: "staffing-v1" as const, resultId: input.resultId, demandId, demandRevisionId: current.demand.revisionId,
      inputDigest: current.inputDigest, formulaVersion: STAFFING_MATCHING_VERSION, asOf: new Date(result.as_of).toISOString(),
      expiresAt: new Date(result.expires_at).toISOString(), fromDate: current.demand.demand!.fromDate, toDate: current.demand.demand!.toDate,
      skills: current.skillNames,
      items: selected.map(match => { const profile = current.profiles.find(row => row.id === match.resourceId)!;
        return { ...match, displayName: profile.display_name as string, timezone: profile.timezone as string }; }),
      nextCursor: start + selected.length < current.matches.length ? staffingPageCursor(selected.at(-1)!.resourceId, scope) : null };
  });
}
