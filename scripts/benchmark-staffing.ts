import { createHash, randomUUID } from "node:crypto";
import { openSync, closeSync, writeSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withStaffingEvalEnvironment, requireOwnedStaffingClone } from "./staffing-eval-environment";
import { withTransaction, getRuntimePool } from "../lib/server/db/client";
import { installPoolQueryCounter } from "../lib/server/db/query-counts";
import { createReviewedStaffingJourneyInputs } from "../tests/fixtures/staffing/journey";
import { STAFFING_BENCHMARK_SHAPE as shape, syntheticResource, syntheticSkill, serviceDates } from "../tests/fixtures/staffing/seed";
import { createProfileTestSession } from "../tests/fixtures/profiles";
import { staffingExact, resetStaffingFixtureRates } from "../tests/fixtures/staffing/allocations";
import { createResource } from "../lib/server/staffing/resources";
import { createSkill } from "../lib/server/staffing/skills";
import { createManualAssessment, decideCompetencies } from "../lib/server/staffing/competencies";
import { approveCalendar } from "../lib/server/staffing/calendars";
import { createDemand, qualifyDemand, readDemand } from "../lib/server/staffing/demands";
import { proposeAllocation } from "../lib/server/staffing/allocations";
import { createAllocationReviewPreview, decideAllocation } from "../lib/server/staffing/decisions";
import { listResources, readResource } from "../lib/server/staffing/read";
import { createMatchingResult, readMatchingResult } from "../lib/server/staffing/matching";
import { readStaffingOperations } from "../lib/server/staffing/operations";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import type { CurrentSession } from "../lib/server/auth/sessions";

if (process.argv.length !== 3 || process.argv[2] !== "--disposable") throw new Error("Benchmark requires --disposable; no DB, corpus or call-count overrides");
assertDeterministicTestMode();
const root = resolve("local-artifacts/007"); await mkdir(root, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve(root, "benchmark-"));
const diagnostic = openSync(resolve(directory,"domain.log"), "w", 0o600), originalInfo = console.info;
console.info = (...values: unknown[]) => { writeSync(diagnostic, values.map(value => typeof value === "string" ? value : "[nontext diagnostic]").join(" ") + "\n"); };
type Inputs = Awaited<ReturnType<typeof createReviewedStaffingJourneyInputs>>;

/** Synthetic representative corpus only. The actual scanned source-bound
 * baseline and one imported competency are preserved. Seeded historical
 * commitments establish load, never evidence of human confirmation. */
async function seed() {
  requireOwnedStaffingClone(); await resetStaffingFixtureRates();
  const f = await createReviewedStaffingJourneyInputs(); let actor = f.actors.reviewer;
  const resources = [f.resource.resourceId!], skills = [f.skill.skillId!];
  await withTransaction(async db => {
    for (let i = 1; i < shape.resources; i++) {
      if (i % 20 === 0) await db.query("DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2",
        [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      if (i % 50 === 0) actor = await createProfileTestSession(db, "mcteer");
      resources.push((await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic representative workforce",
        resource: { ...syntheticResource(`Synthetic benchmark resource ${i}`), timezone: "UTC" } }, db)).resourceId!);
    }
    await db.query("DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2",
      [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId]);
    for (let i = 1; i < shape.skills; i++) {
      if (i % 20 === 0) await db.query("DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2",
        [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      skills.push((await createSkill(actor,
      { requestKey: randomUUID(), rationale: "Synthetic representative taxonomy", skill: { ...syntheticSkill(), name: `Synthetic benchmark skill ${i}` } }, db)).skillId!);
    }
  });
  const dates = serviceDates(f.serviceDate, shape.serviceDays), today = new Date().toISOString().slice(0, 10);
  const reviewResources = new Set([...resources.filter((_id,index) => index === 0 || index % 10 === 9), ...[...resources].sort().slice(0,3)]);
  const confirmationResources = resources.filter(id => !reviewResources.has(id)).slice(0,shape.clients);
  if (confirmationResources.length !== shape.clients) throw new Error("Five independent fresh confirmation resources are required");
  for (let index = 0; index < resources.length; index++) {
    actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    await withTransaction(async db => {
      const rows = [];
      for (let skill = 0; skill < 40; skill++) {
        if (skill % 20 === 0) await db.query("DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2",
          [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId]);
        if (index === 0 && skill === 0) continue; // Preserve the actual imported head.
        const assessment = await createManualAssessment(actor, { requestKey: randomUUID(), rationale: "Synthetic reviewed corpus assessment",
          resourceId: resources[index], skillId: skills[skill], level: 3,
          assessmentDate: reviewResources.has(resources[index]) ? "2025-01-01" : today,
          nextReviewDate: reviewResources.has(resources[index]) ? "2025-07-01" : dates.at(-1)!,
          evidence: "PRIVATE_SYNTHETIC_BENCHMARK_PERSONNEL_EVIDENCE" }, db);
        rows.push({ competencyId: assessment.competencyId, candidateRevisionId: assessment.revisionId,
          candidateDigest: assessment.contentDigest, expectedAggregateVersion: assessment.aggregateVersion,
          sourceGeneration: 1, action: "accept", rationale: "Synthetic benchmark assessment review; not live journey evidence" });
      }
      await db.query("DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2",
        [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      await decideCompetencies(actor, { requestKey: randomUUID(), rows }, db);
    });
    const calendar = { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      fromDate: dates[0], toDate: dates.at(-1)!, days: dates.map(date => ({ date, holidays: [], leave: [],
        protected: [{ date, from: `${date}T09:00`, to: `${date}T10:00`, fromOffset: null, toOffset: null }],
        contracted: [{ date, from: `${date}T09:00`, to: `${date}T17:00`, fromOffset: null, toOffset: null }] })) };
    // Resolve timezone data outside transactions, then persist the actual approval.
    const previous = await withTransaction(async db => (await db.query(`SELECT c.aggregate_version,v.id AS current_revision_id,v.content_digest
      FROM resource_calendars c JOIN LATERAL (SELECT id,content_digest FROM resource_calendar_revisions
        WHERE calendar_id=c.id ORDER BY revision_number DESC LIMIT 1) v ON true WHERE c.resource_id=$1`, [resources[index]])).rows[0]);
    await approveCalendar(actor, resources[index], { requestKey: randomUUID(), rationale: "Synthetic exact 91-day benchmark calendar", calendar,
      ...(previous ? { expectedAggregateVersion: Number(previous.aggregate_version), revisionId: previous.current_revision_id, contentDigest: previous.content_digest } : {}) });
  }
  const demandInput = (title: string, minutes: number) => ({ customerId: f.customerId, workloadId: f.workloadId,
    engagementId: f.accepted.engagementId, planId: f.accepted.planId, baselineId: f.accepted.baselineId,
    planRevisionId: f.accepted.planRevisionId, baselineDigest: f.accepted.baselineDigest, workPackageKey: f.content.workPackages[0].key,
    title, role: "Synthetic delivery lead", fromDate: dates[0], toDate: dates.at(-1)!, requiredSkills: [{ skillId: skills[0], minimumLevel: 2 }],
    desiredSkills: [{ skillId: skills[1], minimumLevel: 2 }], days: dates.map(date => ({ date, requiredMinutes: minutes })), allowedRegions: [], billable: true, overlap: null });
  const primaries = [];
  for (let client = 0; client < shape.clients; client++) primaries.push(await qualified(actor, f, demandInput(`Synthetic measured client ${client} demand`, 300)));
  const primary = primaries[0];
  const historical = await qualified(actor, f, demandInput("Synthetic historical load", 960));
  const allocations: { allocationId: string; revisionId: string; resourceId: string }[] = [];
  for (let index = 0; index < resources.length; index++) {
    if (index % 20 === 0) await resetStaffingFixtureRates();
    if (index % 50 === 0) actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const resourceId = resources[index];
    const proposed = await proposeAllocation(actor, { requestKey: randomUUID(), rationale: "Synthetic historical capacity fixture",
      allocation: { resourceId, demandId: historical.demandId, demandRevisionId: historical.revisionId, demandDigest: historical.contentDigest,
        expectedDemandVersion: historical.aggregateVersion, days: dates.slice(0, 20).map(date => ({ date, minutes: 1 })) } });
    allocations.push({ allocationId: proposed.allocationId!, revisionId: proposed.revisionId!, resourceId });
  }
  await withTransaction(async db => {
    // Deliberate physical load fixture, consistent with both daily ledgers.
    // No decision receipt is fabricated; measured decisions below use the domain.
    await db.query(`INSERT INTO staffing_allocation_days(allocation_id,revision_id,resource_id,demand_id,service_date,minutes,billable)
      SELECT a."allocationId",a."revisionId",a."resourceId",$2,d.date,1,true
      FROM jsonb_to_recordset($1::jsonb) AS a("allocationId" uuid,"revisionId" uuid,"resourceId" uuid)
      CROSS JOIN unnest($3::date[]) AS d(date)`, [JSON.stringify(allocations), historical.demandId, dates.slice(0, 20)]);
    await db.query(`UPDATE staffing_allocations SET state='confirmed',confirmed_revision_id=current_revision_id WHERE id=ANY($1::uuid[])`, [allocations.map(value => value.allocationId)]);
    await db.query(`INSERT INTO staffing_capacity_days(resource_id,service_date,confirmed_minutes,generation)
      SELECT resource_id,service_date,SUM(minutes)::int,1 FROM staffing_allocation_days GROUP BY resource_id,service_date`);
    await db.query(`INSERT INTO staffing_demand_days(demand_id,service_date,confirmed_minutes,generation)
      SELECT demand_id,service_date,SUM(minutes)::int,1 FROM staffing_allocation_days GROUP BY demand_id,service_date
      ON CONFLICT(demand_id,service_date) DO UPDATE SET confirmed_minutes=EXCLUDED.confirmed_minutes,generation=staffing_demand_days.generation+1`);
    const counts = (await db.query(`SELECT (SELECT count(*)::int FROM workforce_resources) AS resources,
      (SELECT count(*)::int FROM workforce_skills) AS skills,(SELECT count(*)::int FROM workforce_competency_revisions) AS competencies,
      (SELECT count(*)::int FROM staffing_allocation_days) AS allocations`)).rows[0];
    if (counts.resources !== shape.resources || counts.skills !== shape.skills || counts.competencies !== shape.competencyRevisions || counts.allocations !== shape.allocationDays) throw new Error("Representative benchmark corpus is incomplete");
    const baseline = (await db.query("SELECT decision_id FROM milestone_baselines WHERE id=$1", [f.accepted.baselineId])).rows[0];
    const imported = (await db.query(`SELECT c.current_accepted_revision_id,r.source_version_id,r.extraction_id,r.mapping_revision_id
      FROM workforce_competencies c JOIN workforce_competency_revisions r ON r.id=c.current_accepted_revision_id WHERE c.id=$1`, [f.workforce.competencyId])).rows[0];
    if (baseline?.decision_id !== f.accepted.decisionId || imported?.current_accepted_revision_id !== f.workforce.competencyRevisionId ||
      imported.source_version_id !== f.workforce.sourceVersionId || imported.extraction_id !== f.workforce.extractionId || imported.mapping_revision_id !== f.workforce.mappingId) {
      throw new Error("Actual source-bound benchmark lineage was not preserved");
    }
  });
  actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
  return { f, actor, resources, primary, primaries, dates, reviewResources, confirmationResources };
}
async function qualified(actor: Inputs["actors"]["reviewer"], f: Inputs, demand: unknown) {
  const draft = await createDemand(actor, { requestKey: randomUUID(), rationale: "Synthetic source-bound benchmark demand", demand });
  await qualifyDemand(actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Exact source-bound work package qualification" });
  return readDemand(actor, draft.demandId);
}
function percentile(values: number[], ratio: number) { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.max(0, Math.ceil(sorted.length * ratio)-1)]; }
class CountedFailure extends Error { constructor(readonly queries: number, readonly category: string) { super("Counted benchmark operation failed"); } }
async function measure(name: string, call: (index: number, client: number) => Promise<number>, prepare?: (index: number, client: number) => Promise<void>) {
  let warmupFailures = 0;
  for (let i = 0; i < shape.warmups; i++) { await prepare?.(i, i % shape.clients); try { await call(i, i % shape.clients); } catch { warmupFailures++; } }
  const durations: number[] = [], queries: number[] = []; let index = 0, failures = 0;
  const failureCategories: Record<string, number> = {};
  await Promise.all(Array.from({ length: shape.clients }, async (_unused, client) => {
    while (index < shape.measuredCalls) { const current = index++; await prepare?.(current + shape.warmups, client); const started = performance.now();
      try { queries.push(await call(current + shape.warmups, client)); } catch (error) {
        failures++; if (error instanceof CountedFailure) { queries.push(error.queries); failureCategories[error.category] = (failureCategories[error.category] ?? 0) + 1; }
      }
      durations.push(performance.now()-started);
    }
  }));
  return { name, calls: durations.length, failures, failureCategories, warmupFailures, p50: percentile(durations,.5), p95: percentile(durations,.95), p99: percentile(durations,.99),
    queryCounts: queries.length === durations.length ? { minimum: Math.min(...queries), maximum: Math.max(...queries), total: queries.reduce((sum,n) => sum+n,0) } : null,
    passed: warmupFailures === 0 && failures === 0 && durations.length === shape.measuredCalls && percentile(durations,.95) <= 2000 };
}

try {
  await withStaffingEvalEnvironment(async environment => {
    await environment.prepareRuntime(); const corpus = await seed(); const { actor, primary, dates } = corpus;
    const counter = installPoolQueryCounter(getRuntimePool());
    const counted = async (run: () => Promise<void>) => { const result = await counter.observe(run);
      if (!result.ok) throw new CountedFailure(result.queries,
        result.error && typeof result.error === "object" && "code" in result.error && typeof result.error.code === "string" && /^[a-z_]{1,40}$/.test(result.error.code)
          ? result.error.code : "assertion_failed"); return result.queries; };
    const results = [];
    try {
    results.push(await measure("roster", () => counted(async () => { const result = await listResources(actor, { pageSize: 20 }); if (result.items.length !== 20) throw new Error("Incomplete roster"); })));
    results.push(await measure("detail", () => counted(async () => { const result = await readResource(actor, corpus.confirmationResources[0]); if (result.resourceId !== corpus.confirmationResources[0] || result.skills.length !== 40) throw new Error("Incorrect resource"); })));
    // Count every real domain/preflight transaction while retaining independent
    // contexts for five concurrent clients. No injected transaction shortcuts.
    const matchActors = await withTransaction(async db => {
      const clients: CurrentSession[] = [];
      for (let index = 0; index < shape.clients; index++) {
        const principalId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
        const loginName = `benchmark_internal_${index}_${randomUUID().slice(0, 8)}`;
        await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic benchmark internal lead')", [principalId,loginName]);
        await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",
          [membershipId,principalId,actor.workspaceId]);
        await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [sessionId,principalId,createHash("sha256").update(sessionId).digest("hex")]);
        clients.push({ sessionId, token: "fixture", expiresAt: new Date(Date.now()+3_600_000), principalId, membershipId,
          workspaceId: actor.workspaceId, loginName, displayName: "Synthetic benchmark internal lead", kind: "internal", role: "member" });
      }
      return clients;
    });
    const matchPhases = { create: [] as number[], release: [] as number[] };
    results.push(await measure("match", (_index, client) => counted(async () => {
      const lead = matchActors[client];
      const createStart = performance.now();
      const created = await createMatchingResult(lead, primary.demandId, { ...staffingExact(primary), requestKey: randomUUID(), rationale: "Representative whole-pool comparison" });
      matchPhases.create.push(performance.now() - createStart);
      const releaseStart = performance.now();
      const page = await readMatchingResult(lead, primary.demandId, { resultId: created.entityId, pageSize: 50 });
      matchPhases.release.push(performance.now() - releaseStart);
      if (page.items.length !== 50 || page.formulaVersion !== "staffing-matching-v1" || page.items.some(item => item.status !== "eligible" || item.minimumRemainingAfterRequest !== 119) ||
        JSON.stringify(page).includes("PRIVATE_SYNTHETIC_JOURNEY_PERSONNEL_EVIDENCE") || JSON.stringify(page).includes(corpus.f.practice.privateOriginName)) throw new Error("Incorrect matching page");
    })));
    results.push(await measure("operations", () => counted(async () => { const report = await readStaffingOperations(actor,
      { customerId: corpus.f.customerId, fromDate: dates[0], toDate: dates.at(-1), pageSize: 20 });
      const fail = (code: string): never => { throw Object.assign(new Error("Incorrect operations result"), { code }); };
      if (report.items.length !== 20) fail("operations_page_size");
      if (report.actualUtilization !== null) fail("operations_utilization");
      for (const value of report.items) {
        if (value.days.length !== shape.serviceDays) fail("operations_day_count");
        for (const [index, day] of value.days.entries()) {
          if (!day.capacity) fail("operations_capacity_missing");
          if (day.capacity.availableMinutes !== 480) fail("operations_available");
          if (day.capacity.protectedMinutes !== 60) fail("operations_protected");
          if (day.confirmedMinutes !== (index < 20 ? 1 : 0)) fail("operations_confirmed");
          if (day.customerConfirmedMinutes !== (index < 20 ? 1 : 0)) fail("operations_customer_confirmed");
          if (day.capacity.remainingMinutes !== (index < 20 ? 419 : 420)) fail("operations_remaining");
          // The first resource keeps the actual imported required competency,
          // which remains valid even when its other synthetic heads are stale.
          if (index < 20 && value.resourceId !== corpus.resources[0] && corpus.reviewResources.has(value.resourceId) && !day.needsReview)
            fail("operations_review_flag");
        }
      }
    })));
    const decisionInputs = new Map<number, { allocationId: string; body: Record<string, unknown> }>();
    results.push(await measure("confirmation", index => counted(async () => {
      const prepared = decisionInputs.get(index); if (!prepared) throw new Error("Exact confirmation preview is missing");
      const result = await decideAllocation(actor, prepared.allocationId, prepared.body);
      if (result.state !== "confirmed") throw new Error("Confirmation was not committed");
    }), async (index, client) => {
      // Preparation is outside the timed acknowledgement and uses independent
      // synthetic requests; clear only the owned fixture's admission window.
      await resetStaffingFixtureRates();
      const resourceId = corpus.confirmationResources[client], demand = corpus.primaries[client];
      const proposed = await proposeAllocation(actor, { requestKey: randomUUID(), rationale: "Synthetic measured human-confirmation setup",
        allocation: { resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId, demandDigest: demand.contentDigest,
          expectedDemandVersion: demand.aggregateVersion, days: [{ date: dates[0], minutes: 1 }] } });
      const preview = await createAllocationReviewPreview(actor, proposed.allocationId, { ...staffingExact(proposed), requestKey: randomUUID(), action: "confirm", rationale: "Exact measured capacity review" });
      decisionInputs.set(index, { allocationId: proposed.allocationId!, body: { ...staffingExact(proposed), requestKey: randomUUID(), reviewPreviewId: preview.previewId, action: "confirm", rationale: "Actual measured domain confirmation" } });
    }));
    const report = { shape, results, matchPhaseP95: { create: percentile(matchPhases.create, .95), release: percentile(matchPhases.release, .95) },
      fixtureOnlyHistory: true, sourceBoundBaseline: true, hiddenSharedOrigin: true,
      queryAccounting: "all timed pool/transaction calls; BEGIN/COMMIT/ROLLBACK included", confirmationTiming: "decision acknowledgement; proposal/preview excluded",
      passed: results.length === 5 && results.every(result => result.passed) };
    await writeFile(resolve(directory,"report.json"), JSON.stringify(report,null,2), { mode: 0o600 });
    console.log(JSON.stringify(report));
    if (!report.passed) throw new Error("Representative performance/correctness goal was not met");
    } finally { counter.restore(); }
  });
} catch (error) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) : "gate_failed";
  console.error(JSON.stringify({ gate: "benchmark-staffing", code }));
  console.error("007 representative benchmark is incomplete or failed; inspect private owned evidence"); process.exitCode = 1;
} finally { console.info = originalInfo; closeSync(diagnostic); }
