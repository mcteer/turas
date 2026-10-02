import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingScenarioInputSchema, staffingScenarioContentSchema, staffingScenarioListSchema, type StaffingScenarioInput, type StaffingCurrency } from "../../contracts/staffing-economics";
import { staffingIdSchema, STAFFING_LIMITS } from "../../contracts/staffing";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { calculateStaffingEconomics, STAFFING_ECONOMICS_VERSION, indexEffectiveStaffingRates, type EffectiveStaffingRate } from "../../staffing/economics";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import { lockApprovedReadInputs, staffingPageCursor, readStaffingPageCursor } from "./read";
import { lockFinanceBaseline, readFinancePolicy } from "./economics";
import { lockStaffingPartnerAuthority, staffingPartnerEligible } from "./partner-authority";
import type { ResourceHead } from "./resources";
import { observeStaffingRead } from "./telemetry";
type Scope = Omit<StaffingScenarioInput, "requestKey" | "rationale">;
type Dependency = { kind: "allocation" | "rate" | "revenue" | "nonlabor" | "calendar" | "source" | "demand";
  inputId: string; revisionId: string; generation: number; contentDigest: string };
const changed = () => new HttpFailure(409, "source_changed", "Scenario inputs changed; review current inputs");

/** Current authorized inputs and complete sorted locks precede money retrieval.
 * Actual confirmed rows survive draft edits, withdrawal and capacity reductions;
 * a scenario never substitutes a working proposal for that persisted ledger. */
async function snapshot(db: PoolClient, actor: StaffingActor, scope: Scope) {
  await lockStaffingActor(db, actor, "finance", { customerId: scope.customerId });
  // Every allocation write/decision takes this engagement prefix. The UPDATE
  // mutex gives the scenario a complete snapshot even before first date rows or
  // allocation heads exist, rather than relying on locks over an empty SELECT.
  if (await lockFinanceBaseline(db, actor, scope, "UPDATE") !== scope.customerId) throw hiddenRecord();
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const baseline = (await db.query("SELECT content_digest FROM milestone_baselines WHERE id=$1 AND engagement_id=$2", [scope.baselineId, scope.engagementId])).rows[0];
  if (baseline?.content_digest !== scope.baselineDigest) throw changed();
  const readRows = () => db.query(`SELECT day.allocation_id,day.revision_id,day.resource_id,day.demand_id,day.service_date::text,day.minutes,day.billable,
    v.content_digest AS allocation_digest,v.resource_timezone,d.current_revision_id AS demand_revision,d.aggregate_version AS demand_version,d.state AS demand_state
    FROM staffing_allocation_days day JOIN staffing_allocation_revisions v ON v.id=day.revision_id
    JOIN staffing_demand_revisions original ON original.id=v.demand_revision_id JOIN staffing_demands d ON d.id=day.demand_id
    WHERE v.environment_id=$1 AND v.workspace_id=$2 AND v.customer_id=$3 AND original.engagement_id=$4 AND original.baseline_id=$5
      AND day.service_date BETWEEN $6 AND $7 ORDER BY day.resource_id,day.service_date,day.allocation_id`,
    [env, actor.workspaceId, scope.customerId, scope.engagementId, scope.baselineId, scope.fromDate, scope.toDate]);
  const discovered = (await readRows()).rows;
  if (discovered.length > 100_000) throw new HttpFailure(413, "too_large", "Scenario exceeds supported input coverage");
  const demandIds = [...new Set(discovered.map(row => row.demand_id))].sort();
  await db.query("SELECT id FROM staffing_demands WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [demandIds]);
  const resources = [...new Set(discovered.map(row => row.resource_id as string))].sort();
  if (resources.length > STAFFING_LIMITS.resources) throw new HttpFailure(413, "too_large", "Scenario exceeds supported resource coverage");
  const identities = (await db.query<ResourceHead>(`SELECT id,kind,membership_id,partner_organization_id FROM workforce_resources
    WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id`, [env, actor.workspaceId, resources])).rows;
  const partnerAuthority = await lockStaffingPartnerAuthority(db, actor, identities, scope.customerId);
  const heads = await lockApprovedReadInputs(db, actor, resources);
  if (heads.some(head => !head.active)) throw changed();
  const eligibility = (await db.query(`SELECT day.resource_id,day.service_date::text,latest.id,latest.state,latest.content_digest
    FROM (SELECT DISTINCT resource_id,service_date FROM staffing_allocation_days WHERE allocation_id=ANY($1::uuid[])
      AND service_date BETWEEN $2 AND $3) day JOIN workforce_resources resource ON resource.id=day.resource_id
    LEFT JOIN LATERAL(SELECT e.id,e.state,e.content_digest FROM workforce_partner_eligibility e
      WHERE e.resource_id=day.resource_id AND e.customer_id=$4 AND e.environment_id=$5 AND e.workspace_id=$6
        AND day.service_date BETWEEN e.from_date AND e.to_date ORDER BY e.revision_number DESC LIMIT 1) latest ON true
    WHERE resource.kind='partner' ORDER BY day.resource_id,day.service_date`,
    [[...new Set(discovered.map(row => row.allocation_id))].sort(), scope.fromDate, scope.toDate, scope.customerId, env, actor.workspaceId])).rows;
  for (const head of heads.filter(head => head.kind === "partner")) {
    const declarations = eligibility.filter(row => row.resource_id === head.id);
    const requiredDays = new Set(discovered.filter(row => row.resource_id === head.id).map(row => row.service_date)).size;
    if (staffingPartnerEligible(head, partnerAuthority, declarations, requiredDays) !== true) throw changed();
  }
  const competency = (await db.query(`SELECT c.id,c.resource_id,c.current_accepted_revision_id,c.aggregate_version,s.active AS skill_active,
    v.source_generation AS assessment_source_generation,v.source_version_id,v.manual_evidence_id,m.state AS manual_state,m.generation AS manual_generation,
    original.source_id,source.state AS source_state,source.generation AS source_generation,source.current_version_id,
    x.complete,x.scan_clean FROM workforce_competencies c JOIN workforce_skills s ON s.id=c.skill_id
    LEFT JOIN workforce_competency_revisions v ON v.id=c.current_accepted_revision_id
    LEFT JOIN workforce_manual_evidence m ON m.id=v.manual_evidence_id LEFT JOIN workforce_source_versions original ON original.id=v.source_version_id
    LEFT JOIN workforce_sources source ON source.id=original.source_id LEFT JOIN workforce_extractions x ON x.id=v.extraction_id
    WHERE c.resource_id=ANY($1::uuid[]) ORDER BY c.id`, [resources])).rows;
  if (competency.some(row => row.current_accepted_revision_id && (!row.skill_active || !(row.manual_evidence_id
    ? row.manual_state === "active" && Number(row.manual_generation) === Number(row.assessment_source_generation)
    : ["ready", "reviewed"].includes(row.source_state) && Number(row.source_generation) === Number(row.assessment_source_generation) &&
      row.current_version_id === row.source_version_id && row.complete && row.scan_clean)))) throw changed();
  await db.query("SELECT id FROM resource_calendars WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id FOR SHARE", [resources]);
  const calendars = (await db.query(`SELECT day.resource_id,day.service_date::text,day.revision_id,v.content_digest FROM resource_calendar_days day
    JOIN resource_calendar_revisions v ON v.id=day.revision_id WHERE day.resource_id=ANY($1::uuid[]) AND day.service_date BETWEEN $2 AND $3
    ORDER BY day.resource_id,day.service_date FOR SHARE OF day`, [resources, scope.fromDate, scope.toDate])).rows;
  const capacity = (await db.query(`SELECT resource_id,service_date::text,confirmed_minutes,generation FROM staffing_capacity_days
    WHERE resource_id=ANY($1::uuid[]) AND service_date BETWEEN $2 AND $3 ORDER BY resource_id,service_date FOR SHARE`, [resources, scope.fromDate, scope.toDate])).rows;
  await db.query("SELECT id FROM staffing_allocations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [[...new Set(discovered.map(row => row.allocation_id))].sort()]);
  if (staffingSha256(discovered) !== staffingSha256((await readRows()).rows)) throw changed();
  // Serialize missing revenue/nonlabor heads using the same identities as their
  // create/revise commands; absence never supplies an inferred zero.
  for (const kind of ["nonlabor", "revenue"]) {
    const mutex = staffingSha256({ kind: "finance-input-group", environment: env, workspace: actor.workspaceId, baseline: scope.baselineId, inputKind: kind });
    await db.query("SELECT pg_advisory_xact_lock($1::bigint)", [BigInt.asIntN(64, BigInt(`0x${mutex.slice(0, 16)}`)).toString()]);
  }
  const inputs = (await db.query(`SELECT h.id,h.kind,h.resource_id,h.current_revision_id,h.aggregate_version,v.currency,v.minor_units,
    v.from_date::text,v.to_date::text,v.content_digest FROM staffing_economic_inputs h JOIN staffing_economic_input_revisions v ON v.id=h.current_revision_id
    WHERE h.environment_id=$1 AND h.workspace_id=$2 AND (h.resource_id=ANY($3::uuid[]) OR (h.engagement_id=$4 AND h.baseline_id=$5))
    ORDER BY h.id FOR SHARE OF h`, [env, actor.workspaceId, resources, scope.engagementId, scope.baselineId])).rows;
  if (inputs.length > 20_000) throw new HttpFailure(413, "too_large", "Scenario exceeds supported rate coverage");
  const rateRows = inputs.filter(row => ["loaded_cost", "service"].includes(row.kind));
  const rates: EffectiveStaffingRate[] = rateRows.map(row => ({ resourceId: row.resource_id, revisionId: row.current_revision_id,
    kind: row.kind, currency: row.currency, fromDate: row.from_date, toDate: row.to_date, minorUnitsPerHour: row.minor_units }));
  const selectRate = indexEffectiveStaffingRates(rates);
  const end = new Date(Date.parse(scope.toDate) + 86_400_000).toISOString().slice(0, 10);
  const money = (kind: string) => {
    const eligible = inputs.filter(row => row.kind === kind && row.from_date === scope.fromDate && row.to_date === end && row.currency === scope.currency);
    if (eligible.length > 1) throw changed();
    return eligible[0] ?? null;
  };
  const revenue = money("revenue"), nonlabor = money("nonlabor"), usedRates = new Set<string>();
  let mixed = ["revenue", "nonlabor"].some(kind => !money(kind) && inputs.some(row => row.kind === kind && row.from_date === scope.fromDate && row.to_date === end && row.currency !== scope.currency));
  const allocations = discovered.map(row => {
    const select = (kind: "loaded_cost" | "service") => {
      const rate = selectRate(row.resource_id, kind, scope.currency, row.service_date);
      if (!rate) { if (rates.some(rate => rate.resourceId === row.resource_id && rate.kind === kind && row.service_date >= rate.fromDate && row.service_date < rate.toDate)) mixed = true; return null; }
      usedRates.add(rate.revisionId); return { revisionId: rate.revisionId, currency: rate.currency as StaffingCurrency, minorUnitsPerHour: rate.minorUnitsPerHour };
    };
    return { resourceId: row.resource_id as string, localDate: row.service_date as string, minutes: Number(row.minutes), loadedCost: select("loaded_cost"), service: select("service") };
  });
  const calculation = calculateStaffingEconomics({ currency: scope.currency, revenue: revenue?.minor_units ?? null, nonlabor: nonlabor?.minor_units ?? null, allocations });
  const result = mixed ? { ...calculation, status: "incomplete" as const, contribution: null, marginPercentage: null,
    reasons: [...new Set([...calculation.reasons, "mixed_currency"])] } : calculation;
  const dependencies: Dependency[] = [];
  const allocationGroups = new Map<string, typeof discovered>();
  for (const row of discovered) {
    const key = `${row.allocation_id}/${row.revision_id}`, group = allocationGroups.get(key);
    if (group) group.push(row); else allocationGroups.set(key, [row]);
  }
  for (const group of allocationGroups.values()) dependencies.push({ kind: "allocation", inputId: group[0].allocation_id, revisionId: group[0].revision_id,
    generation: 1, contentDigest: staffingSha256(group) });
  for (const row of discovered) dependencies.push({ kind: "demand", inputId: row.demand_id, revisionId: row.demand_revision,
    generation: Number(row.demand_version), contentDigest: staffingSha256({ revision: row.demand_revision, state: row.demand_state, version: row.demand_version }) });
  for (const head of heads) dependencies.push({ kind: "source", inputId: head.id, revisionId: head.current_revision_id!, generation: Number(head.aggregate_version),
    contentDigest: staffingSha256({ active: head.active, revision: head.current_revision_id,
      competency: competency.filter(row => row.resource_id === head.id), capacity: capacity.filter(row => row.resource_id === head.id),
      ...(head.kind === "partner" ? { partnerAuthority, eligibility: eligibility.filter(row => row.resource_id === head.id) } : {}) }) });
  const calendarGroups = new Map<string, typeof calendars>();
  for (const row of calendars) {
    const key = `${row.resource_id}/${row.revision_id}`, group = calendarGroups.get(key);
    if (group) group.push(row); else calendarGroups.set(key, [row]);
  }
  for (const group of calendarGroups.values()) dependencies.push({ kind: "calendar", inputId: group[0].resource_id, revisionId: group[0].revision_id,
    generation: 1, contentDigest: staffingSha256(group) });
  // All current input heads enter the fingerprint, including currently missing
  // effective matches, so a newly supplied rate invalidates an incomplete result.
  for (const row of inputs) dependencies.push({ kind: ["revenue", "nonlabor"].includes(row.kind) ? row.kind : "rate", inputId: row.id,
    revisionId: row.current_revision_id, generation: Number(row.aggregate_version), contentDigest: row.content_digest });
  const unique = [...new Map(dependencies.map(dep => [`${dep.kind}/${dep.revisionId}`, dep])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.inputId.localeCompare(b.inputId) || a.revisionId.localeCompare(b.revisionId));
  return { result, dependencies: unique, dependencyDigest: staffingSha256({ scope, dependencies: unique }),
    coverage: { confirmedRows: discovered.length, confirmedMinutes: discovered.reduce((sum, row) => sum + Number(row.minutes), 0), resourceCount: resources.length },
    selectedInputRevisionIds: [...usedRates, ...[revenue, nonlabor].filter(Boolean).map(row => row.current_revision_id as string)].sort() };
}

export async function createStaffingScenario(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingScenarioInputSchema, raw), { requestKey, rationale, ...scope } = input;
  return runStaffingCommand(actor, { ...input, action: "finance_scenario_create" }, { capability: "finance", customerId: scope.customerId }, async db => {
    const current = await snapshot(db, actor, scope), policy = await readFinancePolicy(actor, db);
    const scenarioId = randomUUID(), asOf = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
    const content = parseStaffing(staffingScenarioContentSchema, { scope, asOf, ...current.result, coverage: current.coverage, selectedInputRevisionIds: current.selectedInputRevisionIds,
      inputRevisions: current.dependencies, policyApproval: policy.decisionId ? "approved" as const : "unvalidated" as const,
      policyDecisionId: policy.decisionId, inputPolicyDigest: policy.inputPolicyDigest, planningOnly: true as const, rationale });
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > STAFFING_LIMITS.revisionBytes) throw new HttpFailure(413, "too_large", "Scenario exceeds revision coverage limit");
    const digest = staffingSha256(content), env = getServerConfig().TURAS_ENVIRONMENT_ID;
    await db.query(`INSERT INTO staffing_scenarios(id,environment_id,workspace_id,customer_id,engagement_id,baseline_id,actor_membership_id,
      content_digest,dependency_digest,formula_version,from_date,to_date,as_of,policy_decision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [scenarioId, env, actor.workspaceId, scope.customerId, scope.engagementId, scope.baselineId, actor.membershipId, digest, current.dependencyDigest,
        STAFFING_ECONOMICS_VERSION, scope.fromDate, scope.toDate, asOf, policy.decisionId]);
    for (const dep of current.dependencies) await db.query(`INSERT INTO staffing_scenario_inputs(id,environment_id,workspace_id,scenario_id,
      kind,input_id,input_revision_id,input_digest,generation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), env, actor.workspaceId, scenarioId, dep.kind, dep.inputId, dep.revisionId, dep.contentDigest, dep.generation]);
    await db.query("INSERT INTO staffing_scenario_payloads(scenario_id,content) VALUES($1,$2)", [scenarioId, JSON.stringify(content)]);
    return { scenarioId, contentDigest: digest, state: current.result.status, warnings: ["planning_only"] };
  }, client);
}

export async function readStaffingScenario(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const scenarioId = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "finance");
    const head = (await db.query(`SELECT customer_id,engagement_id,baseline_id,content_digest,dependency_digest FROM staffing_scenarios
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3`, [scenarioId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
    if (!head) throw hiddenRecord();
    await lockStaffingActor(db, actor, "finance", { customerId: head.customer_id });
    const payload = (await db.query("SELECT content FROM staffing_scenario_payloads WHERE scenario_id=$1 FOR SHARE", [scenarioId])).rows[0];
    const identity = { scenarioId, customerId: head.customer_id as string, engagementId: head.engagement_id as string,
      baselineId: head.baseline_id as string, contentDigest: head.content_digest as string };
    if (!payload) return { ...identity, contentAvailability: "purged" as const, status: "stale" as const, content: null, reasons: ["scenario_unavailable"] };
    if (staffingSha256(payload.content) !== head.content_digest || payload.content.scope?.customerId !== head.customer_id ||
      payload.content.scope?.engagementId !== head.engagement_id || payload.content.scope?.baselineId !== head.baseline_id) throw changed();
    const content = parseStaffing(staffingScenarioContentSchema, payload.content), { scope } = content;
    try {
      const current = await snapshot(db, actor, scope), stale = current.dependencyDigest !== head.dependency_digest;
      return { ...identity, contentAvailability: stale ? "historical_warning" as const : "readable" as const,
        status: stale ? "stale" as const : content.status, content,
        reasons: stale ? ["inputs_changed"] : content.reasons };
    } catch (error) {
      if (!(error instanceof HttpFailure) || error.status !== 409) throw error;
      return { ...identity, contentAvailability: "withheld" as const, status: "stale" as const, content: null, reasons: ["inputs_unavailable"] };
    }
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}
export async function listStaffingScenarios(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingScenarioListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "finance", { customerId: input.customerId });
    const env = getServerConfig().TURAS_ENVIRONMENT_ID, scope = { environment: env, workspace: actor.workspaceId,
      actor: actor.membershipId, session: actor.sessionId, projection: "finance_scenarios", customerId: input.customerId, engagementId: input.engagementId ?? null };
    const after = readStaffingPageCursor(input.cursor, scope);
    const rows = (await db.query(`SELECT id,engagement_id,baseline_id,content_digest,from_date::text,to_date::text,as_of FROM staffing_scenarios
      WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND ($4::uuid IS NULL OR engagement_id=$4)
        AND ($5::uuid IS NULL OR id>$5) ORDER BY id LIMIT $6`, [env, actor.workspaceId, input.customerId, input.engagementId ?? null, after, input.pageSize + 1])).rows;
    const page = rows.slice(0, input.pageSize);
    return { items: page.map(row => ({ scenarioId: row.id as string, engagementId: row.engagement_id as string,
      baselineId: row.baseline_id as string, contentDigest: row.content_digest as string, fromDate: row.from_date as string,
      toDate: row.to_date as string, asOf: new Date(row.as_of).toISOString() })),
      nextCursor: rows.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return observeStaffingRead(() => client ? run(client) : withTransaction(run), Boolean(client));
}
