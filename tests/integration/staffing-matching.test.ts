import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createDemand, qualifyDemand, reviseDemand, cancelDemand } from "../../lib/server/staffing/demands";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { approveCalendar, readCalendar } from "../../lib/server/staffing/calendars";
import { readMatchingCalendars } from "../../lib/server/staffing/calendar-inputs";
import { lockApprovedReadInputs } from "../../lib/server/staffing/read";
import { createMatchingResult, readMatchingResult } from "../../lib/server/staffing/matching";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
const key = () => `synthetic_${randomUUID()}`;

const exact = (result: Awaited<ReturnType<typeof createDemand>>) => ({ revisionId: result.revisionId!, contentDigest: result.contentDigest!, expectedAggregateVersion: result.aggregateVersion! });
describe("staffing exact baseline demand lifecycle", () => {
  it("compares the whole pool with explicit missing capacity and fences a result immediately after accepted source withdrawal", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(async db => {
      const baseline = await createSyntheticDemandBaseline(db);
      const resource = await createResource(baseline.actor, { requestKey: key(), rationale: "Synthetic matching resource", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      await createResource(baseline.actor, { requestKey: key(), rationale: "Synthetic whole-pool decoy", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      const draft = await createDemand(baseline.actor, { requestKey: key(), rationale: "Synthetic exact matching demand", demand: baseline.demand }, db);
      const demand = await qualifyDemand(baseline.actor, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic matching qualification" }, db);
      const assessment = await createManualAssessment(baseline.actor, { requestKey: key(), rationale: "Synthetic source-backed matching assessment",
        resourceId: resource.resourceId, skillId: baseline.demand.requiredSkills[0].skillId, level: 3, assessmentDate: "2026-09-29",
        nextReviewDate: "2026-12-20", evidence: "PRIVATE_SYNTHETIC_MATCHING_EVIDENCE" }, db);
      await decideCompetencies(baseline.actor, { requestKey: key(), rows: [{ competencyId: assessment.competencyId,
        candidateRevisionId: assessment.revisionId, candidateDigest: assessment.contentDigest, sourceGeneration: 1,
        expectedAggregateVersion: assessment.aggregateVersion, action: "accept", rationale: "Synthetic exact review" }] }, db);
      const source = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [assessment.revisionId])).rows[0].manual_evidence_id;
      return { ...baseline, resourceId: resource.resourceId!, demand, source };
    });
    const request = { ...exact(f.demand), requestKey: key(), rationale: "Synthetic deterministic comparison" };
    const result = await createMatchingResult(f.actor, f.demand.demandId, request);
    expect(await createMatchingResult(f.actor, f.demand.demandId, request)).toEqual(result);
    const page = await readMatchingResult(f.actor, f.demand.demandId, { resultId: result.entityId, pageSize: 50 });
    const match = page.items.find(row => row.resourceId === f.resourceId)!;
    expect(match.status).toBe("needs_review");
    expect(match.constraints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "required_skill", outcome: "passed" }),
      expect.objectContaining({ kind: "calendar_coverage", outcome: "unknown" }), expect.objectContaining({ kind: "capacity", outcome: "unknown" })]));
    for (const field of ["PRIVATE_SYNTHETIC_MATCHING_EVIDENCE", "rationale", "minorUnits", "annual_leave", "source_generation_current"]) expect(JSON.stringify(page)).not.toContain(field);
    const firstPage = await readMatchingResult(f.actor, f.demand.demandId, { resultId: result.entityId, pageSize: 1 });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await readMatchingResult(f.actor, f.demand.demandId, { resultId: result.entityId, pageSize: 1, cursor: firstPage.nextCursor });
    expect(secondPage.items[0].resourceId).not.toBe(firstPage.items[0].resourceId);
    await withdrawManualEvidence(f.actor, f.source, { requestKey: key(), rationale: "Synthetic immediate source withdrawal", sourceGeneration: 1 });
    await expect(readMatchingResult(f.actor, f.demand.demandId, { resultId: result.entityId })).rejects.toMatchObject({ status: 409 });
    const replacement = await createMatchingResult(f.actor, f.demand.demandId, { ...request, requestKey: key() });
    await expect(readMatchingResult(f.actor, f.demand.demandId, { resultId: replacement.entityId, cursor: firstPage.nextCursor })).rejects.toMatchObject({ status: 422 });
    const current = await readMatchingResult(f.actor, f.demand.demandId, { resultId: replacement.entityId, pageSize: 50 });
    expect(current.items.find(row => row.resourceId === f.resourceId)?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "required_skill", reason: "source_ineligible", outcome: "unknown" })]));
  }, 120_000);
  it("publishes date-specific approved calendars and retains narrow replacements without operational absence categories", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
      const result = await createResource(actor, { requestKey: key(), rationale: "Synthetic UTC calendar resource", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      return { actor, panel, resourceId: result.resourceId! };
    });
    const window = (date: string, from: string, to: string) => ({ date, from: `${date}T${from}`, to: `${date}T${to}`, fromOffset: null, toOffset: null });
    const calendar = { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      fromDate: "2026-10-01", toDate: "2026-10-02", days: ["2026-10-01", "2026-10-02"].map(date => ({ date,
        contracted: [window(date, "09:00", "17:00")], holidays: [], leave: [{ ...window(date, "10:00", "11:00"), category: "annual_leave" }],
        protected: [window(date, "16:00", "17:00")] })) };
    const command = { requestKey: key(), rationale: "Synthetic certified availability", calendar };
    const first = await approveCalendar(f.actor, f.resourceId, command);
    expect(await approveCalendar(f.actor, f.resourceId, command)).toEqual(first);
    const period = { fromDate: calendar.fromDate, toDate: calendar.toDate }, before = await readCalendar(f.panel, f.resourceId, period);
    expect(before.days.map(day => day.capacity)).toEqual([expect.objectContaining({ contractedMinutes: 480, availableMinutes: 420, protectedMinutes: 60, remainingMinutes: 360 }),
      expect.objectContaining({ contractedMinutes: 480, availableMinutes: 420, protectedMinutes: 60, remainingMinutes: 360 })]);
    for (const field of ["annual_leave", "category", "rationale", "localStart", "localEnd"]) expect(JSON.stringify(before)).not.toContain(field);
    const replacement = { ...calendar, toDate: "2026-10-01", days: [{ ...calendar.days[0], contracted: [window("2026-10-01", "09:00", "12:00")], leave: [], protected: [] }] };
    const second = await approveCalendar(f.actor, f.resourceId, { ...exact(first), requestKey: key(), rationale: "Synthetic narrow replacement", calendar: replacement });
    const after = await readCalendar(f.panel, f.resourceId, period);
    expect(after.days.map(day => [day.revisionId, day.capacity?.remainingMinutes])).toEqual([[second.revisionId, 180], [first.revisionId, 360]]);
    await expect(approveCalendar(f.actor, f.resourceId, { ...exact(first), requestKey: key(), rationale: "Synthetic stale approval", calendar: replacement })).rejects.toMatchObject({ status: 409 });
    await expect(approveCalendar(f.panel, f.resourceId, { requestKey: key(), rationale: "Synthetic denied approval", calendar })).rejects.toMatchObject({ status: 403 });
    await withTransaction(async db => {
      expect((await db.query("SELECT count(*)::int AS n FROM resource_calendar_revisions WHERE resource_id=$1", [f.resourceId])).rows[0].n).toBe(2);
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE resource_id=$1", [f.resourceId])).rows[0].n).toBe(0);
    });
  }, 120_000);
  it("rechecks selected immutable calendar revisions and current ledger after a cached matching read", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer");
      const resource = await createResource(actor, { requestKey: key(), rationale: "Synthetic cache-bound resource",
        resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      return { actor, resourceId: resource.resourceId! };
    });
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const slot = (end: string) => ({ date, from: `${date}T09:00`, to: `${date}T${end}`, fromOffset: null, toOffset: null });
    const calendar = { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      fromDate: date, toDate: date, days: [{ date, contracted: [slot("17:00")], holidays: [], leave: [], protected: [] }] };
    const first = await approveCalendar(f.actor, f.resourceId, { requestKey: key(), rationale: "Synthetic first calendar", calendar });
    const snapshot = () => withTransaction(async db => {
      await lockApprovedReadInputs(db, f.actor, [f.resourceId]);
      return (await readMatchingCalendars(db, f.actor, [f.resourceId], { fromDate: date, toDate: date })).get(f.resourceId)![0];
    });
    expect(await snapshot()).toMatchObject({ revisionId: first.revisionId, availableMinutes: 480, remainingMinutes: 480 });
    const replacement = { ...calendar, days: [{ ...calendar.days[0], contracted: [slot("13:00")] }] };
    const second = await approveCalendar(f.actor, f.resourceId,
      { ...exact(first), requestKey: key(), rationale: "Synthetic narrower calendar", calendar: replacement });
    expect(await snapshot()).toMatchObject({ revisionId: second.revisionId, availableMinutes: 240, remainingMinutes: 240 });
    expect(await snapshot()).toMatchObject({ revisionId: second.revisionId, remainingMinutes: 240 });
    await withTransaction(async db => {
      await db.query(`INSERT INTO staffing_capacity_days(resource_id,service_date,confirmed_minutes,generation)
        VALUES($1,$2,30,1)`, [f.resourceId, date]);
    });
    expect(await snapshot()).toMatchObject({ revisionId: second.revisionId, capacityGeneration: 1,
      confirmedMinutes: 30, availableMinutes: 240, remainingMinutes: 210 });
    await withTransaction(async db => {
      await db.query(`UPDATE staffing_capacity_days SET confirmed_minutes=45,generation=2
        WHERE resource_id=$1 AND service_date=$2`, [f.resourceId, date]);
    });
    expect(await snapshot()).toMatchObject({ revisionId: second.revisionId, capacityGeneration: 2,
      confirmedMinutes: 45, availableMinutes: 240, remainingMinutes: 195 });
  }, 120_000);
  it("serializes competing first calendar approvals and preserves uncertified dates as unknown", async () => {
    requireOwnedStaffingClone();
    const f = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer"), resource = await createResource(actor,
        { requestKey: key(), rationale: "Synthetic first calendar race", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      return { actor, resourceId: resource.resourceId! };
    });
    const calendar = { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
      fromDate: "2026-10-01", toDate: "2026-10-01", days: [{ date: "2026-10-01", contracted: [], holidays: [], leave: [], protected: [] }] };
    const results = await Promise.allSettled([0, 1].map(() => approveCalendar(f.actor, f.resourceId, { requestKey: key(), rationale: "Synthetic first certification", calendar })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected").map(result => result.reason.status)).toEqual([409]);
    const read = await readCalendar(f.actor, f.resourceId, { fromDate: "2026-10-01", toDate: "2026-10-02" });
    expect(read.days[0].capacity).toMatchObject({ availableMinutes: 0, plannedBillableRatio: null, ratioReason: "zero_available" });
    expect(read.days[1]).toMatchObject({ capacity: null, freshness: "unknown", reason: "calendar_missing" });
  }, 120_000);
  it("qualifies the accepted revision despite a newer working draft and records exact audit rationale", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db);
      const created = await createDemand(f.actor, { requestKey: key(), rationale: "Synthetic draft demand", demand: f.demand }, db);
      await submitPlanCommand(f.actor, { action: "save", requestKey: key(), planId: f.created.planId,
        parentRevisionId: f.created.revisionId, baseAcceptedRevisionId: f.created.revisionId, changeReason: "Synthetic working-only edit",
        expectedAggregateVersion: f.accepted.aggregateVersion, content: { ...f.content, title: "Synthetic newer working draft" } }, db);
      const request = { ...exact(created), requestKey: key(), rationale: "Synthetic exact draft qualification rationale" };
      const result = await qualifyDemand(f.actor, created.demandId, request, db);
      expect(result).toMatchObject({ state: "qualified", revisionId: created.revisionId, aggregateVersion: 2 });
      expect(await qualifyDemand(f.actor, created.demandId, request, db)).toEqual(result);
      const events = await db.query(`SELECT e.action,e.aggregate_version::int,e.revision_id,p.rationale
        FROM staffing_demand_events e JOIN staffing_demand_event_payloads p ON p.event_id=e.id
        WHERE e.demand_id=$1 ORDER BY e.aggregate_version`, [created.demandId]);
      expect(events.rows.map(e => e.action)).toEqual(["create", "qualify"]);
      expect(events.rows[1]).toMatchObject({ revision_id: created.revisionId, rationale: request.rationale });
    });
  }, 120_000);
  it("retains stable committed demand minutes across reduced drafts and cancellation while disabled", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db), created = await createDemand(f.actor, { requestKey: key(), rationale: "Synthetic original draft", demand: f.demand }, db);
      // Existing ledger fixture only; not proof that confirmation is implemented.
      await db.query("UPDATE staffing_demand_days SET confirmed_minutes=180 WHERE demand_id=$1 AND service_date='2026-10-01'", [created.demandId]);
      const revision = await reviseDemand(f.actor, created.demandId, { ...exact(created), requestKey: key(), rationale: "Synthetic smaller revision",
        demand: { ...f.demand, toDate: "2026-10-01", days: [{ date: "2026-10-01", requiredMinutes: 60 }] } }, db);
      expect(revision).toMatchObject({ state: "draft", aggregateVersion: 2 });
      const before = (await db.query("SELECT service_date::text,confirmed_minutes,generation::text FROM staffing_demand_days WHERE demand_id=$1 ORDER BY service_date", [created.demandId])).rows;
      expect(before.map(row => row.confirmed_minutes)).toEqual([180, 0]);
      const prior = process.env.TURAS_007_DISABLED; process.env.TURAS_007_DISABLED = "1";
      try {
        const cancelled = await cancelDemand(f.actor, created.demandId, { ...exact(revision), requestKey: key(), rationale: "Synthetic disabled cancellation" }, db);
        expect(cancelled.state).toBe("cancelled");
      } finally { if (prior === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = prior; }
      expect((await db.query("SELECT service_date::text,confirmed_minutes,generation::text FROM staffing_demand_days WHERE demand_id=$1 ORDER BY service_date", [created.demandId])).rows).toEqual(before);
      expect((await db.query("SELECT count(*)::int AS count FROM staffing_demand_revisions WHERE demand_id=$1", [created.demandId])).rows[0].count).toBe(2);
    });
  }, 120_000);
  it("rejects wrong baseline digest or work package and stale exact heads without terminal receipts", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db);
      for (const demand of [{ ...f.demand, baselineDigest: "a".repeat(64) }, { ...f.demand, workPackageKey: "missing_package" }]) {
        const requestKey = key(); await expect(createDemand(f.actor, { requestKey, rationale: "Synthetic invalid binding", demand }, db)).rejects.toMatchObject({ status: 404 });
        expect((await db.query("SELECT id FROM staffing_command_receipts WHERE request_key=$1", [requestKey])).rowCount).toBe(0);
      }
      const created = await createDemand(f.actor, { requestKey: key(), rationale: "Synthetic valid draft", demand: f.demand }, db);
      await expect(qualifyDemand(f.actor, created.demandId, { ...exact(created), contentDigest: "b".repeat(64), requestKey: key(), rationale: "Synthetic wrong head" }, db)).rejects.toMatchObject({ status: 409, code: "version_conflict" });
      expect((await db.query("SELECT state,aggregate_version::int FROM staffing_demands WHERE id=$1", [created.demandId])).rows[0]).toEqual({ state: "draft", aggregate_version: 1 });
    });
  }, 120_000);
});
