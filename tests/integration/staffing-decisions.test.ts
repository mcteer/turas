import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withTransaction, query } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "../fixtures/staffing/demands";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { createDemand, qualifyDemand } from "../../lib/server/staffing/demands";
import { proposeAllocation, reviseAllocation, cancelAllocationProposal, readAllocation, listAllocations, reserveAllocation } from "../../lib/server/staffing/allocations";
import { expireStaffingReservations } from "../../lib/server/staffing/reservations";
import { reviseResource } from "../../lib/server/staffing/resources";
import { createReviewedAllocationProposalFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { createAllocationReviewPreview, decideAllocation, readAllocationReviewPreview } from "../../lib/server/staffing/decisions";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { approveCalendar } from "../../lib/server/staffing/calendars";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
const key = () => randomUUID();
const exact = (result: { revisionId?: string; contentDigest?: string; aggregateVersion?: number }) => ({
  revisionId: result.revisionId!, contentDigest: result.contentDigest!, expectedAggregateVersion: result.aggregateVersion! });
describe("staffing proposal revision boundaries", () => {
  beforeEach(resetStaffingFixtureRates);
  it("rolls back a complete confirmation after an owned SQL fault following ledger writes, then permits exact retry", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...exact(f.allocation), requestKey: key(), rationale: "Synthetic rollback review", action: "confirm" });
    const request = { ...exact(f.allocation), requestKey: key(), rationale: "Synthetic faulted exact confirmation", action: "confirm" as const, reviewPreviewId: preview.previewId };
    const beforeCapacity = (await query("SELECT confirmed_minutes,generation FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows;
    const beforeDemand = (await query("SELECT confirmed_minutes,generation FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows;
    // Only this owned clone/allocation is affected. No production code fault hook
    // or immutable-trigger replacement is installed.
    const fault = `staffing_fault_${key().replaceAll("-", "")}`;
    await query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.allocation_id='${f.allocation.allocationId}'::uuid THEN PERFORM 1/0; END IF; RETURN NEW; END $$`);
    try {
      await query(`CREATE TRIGGER ${fault} BEFORE INSERT ON staffing_decisions FOR EACH ROW EXECUTE FUNCTION ${fault}()`);
      await expect(decideAllocation(f.actor, f.allocation.allocationId, request)).rejects.toMatchObject({ code: "22012" });
      expect((await query("SELECT confirmed_minutes,generation FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows).toEqual(beforeCapacity);
      expect((await query("SELECT confirmed_minutes,generation FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows).toEqual(beforeDemand);
      expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
      expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
      expect((await query("SELECT count(*)::int AS n FROM staffing_command_receipts WHERE request_key=$1", [request.requestKey])).rows[0].n).toBe(0);
      expect((await query("SELECT used_decision_id FROM staffing_review_previews WHERE id=$1", [preview.previewId])).rows[0].used_decision_id).toBeNull();
      expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ state: "proposed", aggregateVersion: f.allocation.aggregateVersion, confirmedRevisionId: null });
    } finally {
      await query(`DROP TRIGGER IF EXISTS ${fault} ON staffing_decisions`);
      await query(`DROP FUNCTION ${fault}()`);
    }
    const result = await decideAllocation(f.actor, f.allocation.allocationId, request);
    expect(result).toMatchObject({ state: "confirmed", aggregateVersion: f.allocation.aggregateVersion! + 1 });
    expect(await decideAllocation(f.actor, f.allocation.allocationId, request)).toEqual(result);
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes)).toEqual([240]);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(1);
  }, 120_000);
  it("serializes a cross-resource amendment against cancellation with one atomic old/new ledger outcome", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const firstPreview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...exact(f.allocation), requestKey: key(), rationale: "Synthetic first human review", action: "confirm" });
    const confirmed = await decideAllocation(f.actor, f.allocation.allocationId, { ...exact(f.allocation), requestKey: key(),
      rationale: "Synthetic first human confirmation", action: "confirm", reviewPreviewId: firstPreview.previewId });
    const replacement = await withTransaction(async db => {
      const resource = await createResource(f.actor, { requestKey: key(), rationale: "Synthetic amendment resource",
        resource: { ...syntheticResource("Synthetic replacement engineer"), timezone: "UTC" } }, db);
      const assessment = await createManualAssessment(f.actor, { requestKey: key(), rationale: "Synthetic replacement skill assessment",
        resourceId: resource.resourceId, skillId: f.demandInput.requiredSkills[0].skillId, level: 3,
        assessmentDate: new Date().toISOString().slice(0, 10), nextReviewDate: new Date(Date.parse(f.date) + 86_400_000).toISOString().slice(0, 10),
        evidence: "Synthetic dated replacement competency source" }, db);
      await decideCompetencies(f.actor, { requestKey: key(), rows: [{ competencyId: assessment.competencyId,
        candidateRevisionId: assessment.revisionId, candidateDigest: assessment.contentDigest, expectedAggregateVersion: assessment.aggregateVersion,
        sourceGeneration: 1, action: "accept", rationale: "Synthetic replacement competency approval" }] }, db);
      return resource;
    });
    await approveCalendar(f.actor, replacement.resourceId, { requestKey: key(), rationale: "Synthetic replacement working calendar", calendar: f.calendar });
    const revised = await reviseAllocation(f.actor, f.allocation.allocationId, { ...exact(confirmed), requestKey: key(),
      rationale: "Synthetic exact cross-resource amendment", allocation: { ...f.allocationInput, resourceId: replacement.resourceId } });
    const actions = ["amend", "cancel"] as const;
    const previews = await Promise.all(actions.map(action => createAllocationReviewPreview(f.actor, f.allocation.allocationId,
      { ...exact(revised), requestKey: key(), rationale: `Synthetic ${action} review`, action })));
    const outcomes = await Promise.allSettled(actions.map((action, i) => decideAllocation(f.actor, f.allocation.allocationId,
      { ...exact(revised), requestKey: key(), rationale: `Synthetic concurrent ${action} decision`, action, reviewPreviewId: previews[i].previewId })));
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected").map(outcome => outcome.reason.status)).toEqual([409]);
    const amended = outcomes[0].status === "fulfilled";
    const capacities = (await query("SELECT resource_id,confirmed_minutes FROM staffing_capacity_days WHERE resource_id=ANY($1::uuid[]) AND service_date=$2",
      [[f.resource.resourceId, replacement.resourceId], f.date])).rows;
    expect(capacities.find(row => row.resource_id === f.resource.resourceId)?.confirmed_minutes).toBe(0);
    expect(capacities.find(row => row.resource_id === replacement.resourceId)?.confirmed_minutes).toBe(amended ? 240 : 0);
    expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows[0].confirmed_minutes).toBe(amended ? 240 : 0);
    expect((await query("SELECT resource_id,revision_id,minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows)
      .toEqual(amended ? [{ resource_id: replacement.resourceId, revision_id: revised.revisionId, minutes: 240 }] : []);
    expect((await query("SELECT action FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.action).sort())
      .toEqual(["confirm", amended ? "amend" : "cancel"].sort());
    const current = await readAllocation(f.actor, f.allocation.allocationId);
    expect(current).toMatchObject({ state: amended ? "confirmed" : "cancelled", aggregateVersion: revised.aggregateVersion! + 1,
      confirmedRevisionId: amended ? revised.revisionId : f.allocation.revisionId });
  }, 120_000);
  it("serializes separate demands competing for the same insufficient resource/date capacity", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    await approveCalendar(f.actor, f.resource.resourceId, { ...exact(f.approvedCalendar), requestKey: key(),
      rationale: "Synthetic six-hour capacity shared by independent demands", calendar: { ...f.calendar,
        days: [{ ...f.calendar.days[0], contracted: [{ date: f.date, from: `${f.date}T09:00`, to: `${f.date}T15:00`, fromOffset: null, toOffset: null }] }] } });
    const draft = await createDemand(f.actor, { requestKey: key(), rationale: "Synthetic independent demand", demand: f.demandInput });
    const demand = await qualifyDemand(f.actor, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic independent qualification" });
    const second = await proposeAllocation(f.actor, { requestKey: key(), rationale: "Synthetic independent competing proposal", allocation: {
      ...f.allocationInput, demandId: demand.demandId, demandRevisionId: demand.revisionId,
      demandDigest: demand.contentDigest, expectedDemandVersion: demand.aggregateVersion } });
    const allocations = [f.allocation, second];
    const previews = await Promise.all(allocations.map(allocation => createAllocationReviewPreview(f.actor, allocation.allocationId,
      { ...exact(allocation), requestKey: key(), rationale: "Synthetic independent capacity review", action: "confirm" })));
    const outcomes = await Promise.allSettled(allocations.map((allocation, i) => decideAllocation(f.actor, allocation.allocationId,
      { ...exact(allocation), requestKey: key(), rationale: "Synthetic competing human confirmation", action: "confirm", reviewPreviewId: previews[i].previewId })));
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected").map(outcome => outcome.reason.status)).toEqual([409]);
    expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows[0].confirmed_minutes).toBe(240);
    expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=ANY($1::uuid[]) AND service_date=$2", [[f.demand.demandId, demand.demandId], f.date]))
      .rows.map(row => row.confirmed_minutes).sort((a, b) => a - b)).toEqual([0, 240]);
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=ANY($1::uuid[])", [allocations.map(allocation => allocation.allocationId)])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=ANY($1::uuid[])", [allocations.map(allocation => allocation.allocationId)])).rows[0].n).toBe(1);
  }, 120_000);
  it("rechecks current session authority before replaying a committed exact confirmation receipt", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...exact(f.allocation), requestKey: key(), rationale: "Synthetic authority-bound confirmation review", action: "confirm" });
    const request = { ...exact(f.allocation), requestKey: key(), rationale: "Synthetic exact human confirmation", action: "confirm" as const, reviewPreviewId: preview.previewId };
    const committed = await decideAllocation(f.actor, f.allocation.allocationId, request);
    expect(await decideAllocation(f.actor, f.allocation.allocationId, request)).toEqual(committed);
    await expect(decideAllocation(f.actor, f.allocation.allocationId, { ...request, rationale: "Synthetic changed content cannot reuse a committed key" }))
      .rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
    await query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [f.actor.sessionId]);
    await expect(decideAllocation(f.actor, f.allocation.allocationId, request)).rejects.toMatchObject({ status: 401, code: "authentication_required" });
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(1);
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes)).toEqual([240]);
  }, 120_000);
  it("serializes two real first confirmations across the same resource/date and stable demand/date", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const second = await proposeAllocation(f.actor, { requestKey: key(), rationale: "Synthetic competing exact proposal", allocation: f.allocationInput });
    const allocations = [f.allocation, second];
    const previews = await Promise.all(allocations.map(allocation => createAllocationReviewPreview(f.actor, allocation.allocationId,
      { ...exact(allocation), requestKey: key(), rationale: "Synthetic competing staffing review", action: "confirm" })));
    const results = await Promise.allSettled(allocations.map((allocation, i) => decideAllocation(f.actor, allocation.allocationId,
      { ...exact(allocation), requestKey: key(), rationale: "Synthetic exact human confirmation", action: "confirm", reviewPreviewId: previews[i].previewId })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected").map(result => result.reason.status)).toEqual([409]);
    expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows[0].confirmed_minutes).toBe(240);
    expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows[0].confirmed_minutes).toBe(240);
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE demand_id=$1", [f.demand.demandId])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=ANY($1::uuid[])", [allocations.map(allocation => allocation.allocationId)])).rows[0].n).toBe(1);
  }, 120_000);
  it("binds preview action in request digests and refuses withdrawn accepted competency sources before any commitment", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const request = { ...exact(f.allocation), requestKey: key(), rationale: "Synthetic exact source review", action: "confirm" as const };
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, request);
    expect(await createAllocationReviewPreview(f.actor, f.allocation.allocationId, request)).toEqual(preview);
    await expect(createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...request, action: "amend" })).rejects.toMatchObject({ code: "request_key_conflict" });
    const projection = await readAllocationReviewPreview(f.actor, f.allocation.allocationId, preview.previewId);
    expect(projection.effects.insertedFutureRows).toEqual([expect.objectContaining({ date: f.date, minutes: 240 })]);
    expect(JSON.stringify(projection)).not.toContain("PRIVATE_SYNTHETIC_DECISION_EVIDENCE");
    await withdrawManualEvidence(f.actor, f.manualEvidenceId, { requestKey: key(), rationale: "Synthetic revoked competency source", sourceGeneration: 1 });
    await expect(decideAllocation(f.actor, f.allocation.allocationId, { ...request, requestKey: key(), reviewPreviewId: preview.previewId })).rejects.toMatchObject({ code: "source_changed" });
    expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows[0].confirmed_minutes).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
  }, 120_000);
  it("reconciles concurrent exact reservations and expires tentative time without changing ledgers even while disabled", async () => {
    requireOwnedStaffingClone();
    const firstDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const f = await withTransaction(async db => {
      const baseline = await createSyntheticDemandBaseline(db), actor = await createProfileTestSession(db, "panel");
      const resource = await createResource(baseline.actor, { requestKey: key(), rationale: "Synthetic reservation resource", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      const draft = await createDemand(actor, { requestKey: key(), rationale: "Synthetic reservation demand",
        demand: { ...baseline.demand, fromDate: firstDate, toDate: firstDate, days: [{ date: firstDate, requiredMinutes: 240 }] } }, db);
      const demand = await qualifyDemand(actor, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic reservation qualification" }, db);
      const proposed = await proposeAllocation(actor, { requestKey: key(), rationale: "Synthetic reservation proposal", allocation: {
        resourceId: resource.resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId,
        demandDigest: demand.contentDigest, expectedDemandVersion: demand.aggregateVersion, days: [{ date: firstDate, minutes: 120 }] } }, db);
      return { actor, proposed, resourceId: resource.resourceId };
    });
    const input = { ...exact(f.proposed), requestKey: key(), rationale: "Synthetic tentative interest" };
    const outcomes = await Promise.all([reserveAllocation(f.actor, f.proposed.allocationId, input), reserveAllocation(f.actor, f.proposed.allocationId, input)]);
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]).toMatchObject({ state: "tentative", aggregateVersion: 2, expiresAt: `${firstDate}T00:00:00.000Z` });
    await withTransaction(async db => {
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocation_events WHERE allocation_id=$1 AND action='reserve'", [f.proposed.allocationId])).rows[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.proposed.allocationId])).rows[0].n).toBe(0);
      await db.query("UPDATE staffing_allocations SET reservation_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [f.proposed.allocationId]);
    });
    const oldDisabled = process.env.TURAS_007_DISABLED;
    try {
      process.env.TURAS_007_DISABLED = "1";
      await Promise.all([expireStaffingReservations(), expireStaffingReservations()]);
      await withTransaction(async db => {
        expect((await db.query("SELECT state,aggregate_version,confirmed_revision_id FROM staffing_allocations WHERE id=$1", [f.proposed.allocationId])).rows[0])
          .toMatchObject({ state: "expired", aggregate_version: "3", confirmed_revision_id: null });
        expect((await db.query("SELECT count(*)::int AS n FROM staffing_reservation_expirations WHERE allocation_id=$1", [f.proposed.allocationId])).rows[0].n).toBe(1);
        expect((await db.query("SELECT count(*)::int AS n FROM staffing_capacity_days WHERE resource_id=$1 AND confirmed_minutes<>0", [f.resourceId])).rows[0].n).toBe(0);
      });
    } finally { if (oldDisabled === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = oldDisabled; }
    expect(await reserveAllocation(f.actor, f.proposed.allocationId, input)).toEqual(outcomes[0]);
    await expect(reserveAllocation(f.actor, f.proposed.allocationId, { ...input, requestKey: key() })).rejects.toMatchObject({ status: 409 });
  }, 120_000);
  it("withholds inactive resource payloads and permits exact proposal cancellation while disabled without ledger effects", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db), panel = await createProfileTestSession(db, "panel"), profile = syntheticResource();
      const resource = await createResource(f.actor, { requestKey: key(), rationale: "Synthetic cancel resource", resource: profile }, db);
      const draft = await createDemand(panel, { requestKey: key(), rationale: "Synthetic cancel demand", demand: f.demand }, db);
      const demand = await qualifyDemand(panel, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic qualification" }, db);
      const allocation = { resourceId: resource.resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId,
        demandDigest: demand.contentDigest, expectedDemandVersion: demand.aggregateVersion, days: [{ date: "2026-10-01", minutes: 120 }] };
      const proposed = await proposeAllocation(panel, { requestKey: key(), rationale: "PRIVATE_SYNTHETIC_ALLOCATION", allocation }, db);
      expect(await readAllocation(panel, proposed.allocationId, db)).toMatchObject({ allocation, contentAvailability: "readable", rationale: "PRIVATE_SYNTHETIC_ALLOCATION" });
      const page = await listAllocations(panel, { customerId: f.demand.customerId, demandId: demand.demandId }, db);
      expect(page.items).toEqual([expect.objectContaining({ allocationId: proposed.allocationId })]);
      expect(JSON.stringify(page)).not.toContain("PRIVATE_SYNTHETIC_ALLOCATION");
      await reviseResource(f.actor, resource.resourceId, { ...exact(resource), requestKey: key(), rationale: "Synthetic resource inactivation",
        resource: { ...profile, state: "inactive" } }, db);
      expect(await readAllocation(panel, proposed.allocationId, db)).toMatchObject({ allocation: null, rationale: null, contentAvailability: "withheld" });
      const command = { ...exact(proposed), requestKey: key(), rationale: "Synthetic exact cancellation" };
      const priorDisabled = process.env.TURAS_007_DISABLED;
      try {
        process.env.TURAS_007_DISABLED = "1";
        const cancelled = await cancelAllocationProposal(panel, proposed.allocationId, command, db);
        expect(cancelled).toMatchObject({ state: "cancelled", aggregateVersion: 2 });
        expect(await cancelAllocationProposal(panel, proposed.allocationId, command, db)).toEqual(cancelled);
      } finally { if (priorDisabled === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = priorDisabled; }
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [proposed.allocationId])).rows[0].n).toBe(0);
      expect((await db.query("SELECT action,state FROM staffing_allocation_events WHERE allocation_id=$1 ORDER BY aggregate_version", [proposed.allocationId])).rows)
        .toEqual([{ action: "propose", state: "proposed" }, { action: "cancel_proposal", state: "cancelled" }]);
      await expect(cancelAllocationProposal(panel, proposed.allocationId, { ...command, requestKey: key() }, db)).rejects.toMatchObject({ status: 409 });
    });
  }, 120_000);
  it("proposes and revises exact qualified demand without consuming confirmed or tentative capacity", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db), panel = await createProfileTestSession(db, "panel");
      const resource = await createResource(f.actor, { requestKey: key(), rationale: "Synthetic proposal resource", resource: syntheticResource() }, db);
      const draft = await createDemand(panel, { requestKey: key(), rationale: "Synthetic operational demand", demand: f.demand }, db);
      const demand = await qualifyDemand(panel, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic qualify" }, db);
      const allocation = { resourceId: resource.resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId,
        demandDigest: demand.contentDigest, expectedDemandVersion: demand.aggregateVersion, days: [{ date: "2026-10-01", minutes: 120 }] };
      const request = { requestKey: key(), rationale: "Synthetic proposal", allocation };
      const proposed = await proposeAllocation(panel, request, db);
      expect(await proposeAllocation(panel, request, db)).toEqual(proposed);
      expect(proposed).toMatchObject({ state: "proposed", warnings: ["feasibility_unreviewed"] });
      const revised = await reviseAllocation(panel, proposed.allocationId, { ...exact(proposed), requestKey: key(), rationale: "Synthetic revised proposal",
        allocation: { ...allocation, days: [{ date: "2026-10-01", minutes: 60 }] } }, db);
      expect(revised).toMatchObject({ state: "proposed", aggregateVersion: 2 });
      expect((await db.query("SELECT count(*)::int AS count FROM staffing_allocation_days WHERE allocation_id=$1", [proposed.allocationId])).rows[0].count).toBe(0);
      expect((await db.query("SELECT count(*)::int AS count FROM staffing_capacity_days WHERE resource_id=$1", [resource.resourceId])).rows[0].count).toBe(0);
      expect((await db.query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1", [demand.demandId])).rows.every(row => row.confirmed_minutes === 0)).toBe(true);
      expect((await db.query("SELECT count(*)::int AS count FROM staffing_allocation_revisions WHERE allocation_id=$1", [proposed.allocationId])).rows[0].count).toBe(2);
      await expect(reviseAllocation(f.actor, proposed.allocationId, { ...exact(revised), requestKey: key(), rationale: "Synthetic other-author edit", allocation }, db))
        .rejects.toMatchObject({ status: 403 });
    });
  }, 120_000);
  it("rejects draft demand and dates outside exact qualified effort before writing a proposal", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const f = await createSyntheticDemandBaseline(db);
      const resource = await createResource(f.actor, { requestKey: key(), rationale: "Synthetic guarded resource", resource: syntheticResource() }, db);
      const draft = await createDemand(f.actor, { requestKey: key(), rationale: "Synthetic draft", demand: f.demand }, db);
      const allocation = { resourceId: resource.resourceId, demandId: draft.demandId, demandRevisionId: draft.revisionId,
        demandDigest: draft.contentDigest, expectedDemandVersion: draft.aggregateVersion, days: [{ date: "2026-10-01", minutes: 120 }] };
      await expect(proposeAllocation(f.actor, { requestKey: key(), rationale: "Synthetic unqualified proposal", allocation }, db)).rejects.toMatchObject({ code: "demand_conflict" });
      const qualified = await qualifyDemand(f.actor, draft.demandId, { ...exact(draft), requestKey: key(), rationale: "Synthetic qualify" }, db);
      for (const days of [[{ date: "2026-10-03", minutes: 60 }], [{ date: "2026-10-01", minutes: 300 }]]) {
        await expect(proposeAllocation(f.actor, { requestKey: key(), rationale: "Synthetic invalid proposal dates", allocation: { ...allocation,
          expectedDemandVersion: qualified.aggregateVersion, days } }, db)).rejects.toMatchObject({ status: 422 });
      }
      expect((await db.query("SELECT count(*)::int AS count FROM staffing_allocations WHERE demand_id=$1", [draft.demandId])).rows[0].count).toBe(0);
    });
  }, 120_000);
});
