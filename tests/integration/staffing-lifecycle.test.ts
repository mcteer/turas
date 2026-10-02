import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { query, withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createConfirmedAllocationLedgerFixture, staffingExact, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { createAllocationReviewPreview, readAllocationReviewPreview, decideAllocation } from "../../lib/server/staffing/decisions";
import { reviseResource, revisePartnerEligibility, lockResourceHeads } from "../../lib/server/staffing/resources";
import { createProfileTestSession } from "../fixtures/profiles";
import { lockStaffingActor } from "../../lib/server/staffing/policy";
import { lockDemandIdentity } from "../../lib/server/staffing/demands";
import { lockAllocationLedgers, readConfirmedAllocationLedger, applyAllocationLedgerChange } from "../../lib/server/staffing/ledger";
import { createReviewedAllocationProposalFixture } from "../fixtures/staffing/allocations";
import { approveCalendar, readCalendar } from "../../lib/server/staffing/calendars";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { readAllocation } from "../../lib/server/staffing/allocations";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createPlanReviewPreview, decidePlan } from "../../lib/server/plans/decisions";
import { decideCompetencies } from "../../lib/server/staffing/competencies";
import { reviseDemand, qualifyDemand, cancelDemand } from "../../lib/server/staffing/demands";
const key = () => randomUUID();
describe("governed identity-only allocation release", () => {
  beforeEach(resetStaffingFixtureRates);
  it("retains earlier confirmed minutes across reduced and cancelled demand revisions until exact release", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic original demand review", action: "confirm" });
    const confirmed = await decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
      rationale: "Synthetic original demand confirmation", action: "confirm", reviewPreviewId: preview.previewId });
    const revision = await reviseDemand(f.actor, f.demand.demandId, { ...staffingExact(f.demand), requestKey: key(),
      rationale: "Synthetic reduction retains previous commitments", demand: { ...f.demandInput, days: [{ date: f.date, requiredMinutes: 60 }] } });
    const qualified = await qualifyDemand(f.actor, f.demand.demandId, { ...staffingExact(revision), requestKey: key(), rationale: "Synthetic reduced demand qualification" });
    const retained = async () => {
      expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows[0].confirmed_minutes).toBe(240);
      expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows[0].confirmed_minutes).toBe(240);
      expect((await query("SELECT revision_id,minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows).toEqual([{ revision_id: f.allocation.revisionId, minutes: 240 }]);
      expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ state: "confirmed", reviewRequired: true });
    };
    await retained();
    await cancelDemand(f.actor, f.demand.demandId, { ...staffingExact(qualified), requestKey: key(), rationale: "Synthetic demand cancellation retains capacity" });
    await retained();
    const releasePreview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(confirmed), requestKey: key(), action: "release", rationale: "Synthetic identity-only release of cancelled demand" });
    await decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(confirmed), requestKey: key(), action: "release",
      reviewPreviewId: releasePreview.previewId, rationale: "Synthetic human release after demand cancellation" });
    expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows[0].confirmed_minutes).toBe(0);
    expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.date])).rows[0].confirmed_minutes).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
  }, 120_000);
  it("serializes confirmation against real partner customer-grant revocation and retains an earlier commitment for review", async () => {
    requireOwnedStaffingClone();
    const partner = await withTransaction(db => createProfileTestSession(db, "partner"));
    const organization = (await query("SELECT partner_org_id FROM memberships WHERE id=$1", [partner.membershipId])).rows[0].partner_org_id as string;
    const f = await createReviewedAllocationProposalFixture({ kind: "partner", membershipId: partner.membershipId, partnerOrganizationId: organization });
    const grant = (await query("SELECT id,state FROM customer_grants WHERE membership_id=$1 AND customer_id=$2", [partner.membershipId, f.demandInput.customerId])).rows[0];
    expect(grant?.state).toBe("active");
    await revisePartnerEligibility(f.actor, f.resource.resourceId, { ...staffingExact(f.resource), requestKey: key(),
      customerId: f.demandInput.customerId, fromDate: f.date, toDate: f.date, state: "active", rationale: "Synthetic current dated partner eligibility" });
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic actual partner-grant review", action: "confirm" });
    try {
      const [confirmed, revoked] = await Promise.allSettled([
        decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
          rationale: "Synthetic confirmation racing partner grant loss", action: "confirm", reviewPreviewId: preview.previewId }),
        withTransaction(async db => {
          expect((await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE id=$1 RETURNING id", [grant.id])).rowCount).toBe(1);
        }),
      ]);
      expect(revoked.status).toBe("fulfilled");
      if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
      expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes)).toEqual(confirmed.status === "fulfilled" ? [240] : []);
      if (confirmed.status === "fulfilled") expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ state: "confirmed", reviewRequired: true });
      await expect(createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic lost partner grant cannot support new staffing", action: "confirm" })).rejects.toMatchObject({ status: 409 });
    } finally {
      await query("UPDATE customer_grants SET state=$2,revision=revision+1 WHERE id=$1", [grant.id, grant.state]);
    }
  }, 120_000);
  it("serializes confirmation against exact accepted competency retraction without inheriting withdrawn approval", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const competency = (await query("SELECT aggregate_version,current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.assessment.competencyId])).rows[0];
    expect(competency.current_accepted_revision_id).toBe(f.assessment.revisionId);
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic approved competency race review", action: "confirm" });
    const [confirmed, retracted] = await Promise.allSettled([
      decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic confirmation racing approval retraction", action: "confirm", reviewPreviewId: preview.previewId }),
      decideCompetencies(f.actor, { requestKey: key(), rows: [{ competencyId: f.assessment.competencyId,
        candidateRevisionId: f.assessment.revisionId, candidateDigest: f.assessment.contentDigest, sourceGeneration: 1,
        expectedAggregateVersion: Number(competency.aggregate_version), action: "retract", rationale: "Synthetic exact approval retraction" }] }),
    ]);
    expect(retracted.status).toBe("fulfilled");
    if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
    expect((await query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.assessment.competencyId])).rows[0].current_accepted_revision_id).toBeNull();
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes))
      .toEqual(confirmed.status === "fulfilled" ? [240] : []);
    if (confirmed.status === "fulfilled") expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ state: "confirmed", reviewRequired: true });
    await expect(createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
      rationale: "Synthetic retracted approval cannot support confirmation", action: "confirm" })).rejects.toMatchObject({ status: 409 });
  }, 120_000);
  it("serializes confirmation against an actual accepted-baseline replacement and preserves an earlier commitment for review", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const saved = await submitPlanCommand(f.actor, { action: "save", requestKey: `synthetic_${key()}`,
      planId: f.baseline.created.planId, parentRevisionId: f.baseline.created.revisionId,
      baseAcceptedRevisionId: f.baseline.created.revisionId, expectedAggregateVersion: f.baseline.accepted.aggregateVersion,
      changeReason: "Synthetic human replacement for staffing baseline race",
      content: { ...f.baseline.content, title: "Synthetic replacement baseline for the same engagement" } });
    const submitted = await submitPlanCommand(f.actor, { action: "submit", requestKey: `synthetic_${key()}`,
      planId: saved.planId, ...staffingExact(saved) });
    const planPreview = await createPlanReviewPreview(f.actor, saved.planId, {
      ...staffingExact(submitted), requestKey: `synthetic_${key()}` });
    const allocationPreview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic original-baseline staffing review", action: "confirm" });
    const [confirmed, replaced] = await Promise.allSettled([
      decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic confirmation racing accepted replacement", action: "confirm", reviewPreviewId: allocationPreview.previewId }),
      decidePlan(f.actor, saved.planId, { ...staffingExact(submitted), requestKey: `synthetic_${key()}`, action: "accept",
        reviewPreviewId: planPreview.previewId, rationale: "Synthetic exact replacement acceptance", deliverySuitabilityConfirmed: true }),
    ]);
    expect(replaced.status).toBe("fulfilled");
    if (replaced.status === "fulfilled") {
      expect(replaced.value.engagementId).toBe(f.baseline.accepted.engagementId);
      expect(replaced.value.baselineId).not.toBe(f.baseline.accepted.baselineId);
    }
    if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes))
      .toEqual(confirmed.status === "fulfilled" ? [240] : []);
    expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ reviewRequired: true });
    await expect(createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
      rationale: "Synthetic superseded baseline cannot authorize a new commitment", action: "confirm" })).rejects.toMatchObject({ status: 409 });
  }, 120_000);
  it("serializes confirmation against a capacity-reducing calendar revision without silently changing an earlier commitment", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic calendar-race review", action: "confirm" });
    const [confirmed, revised] = await Promise.allSettled([
      decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic exact confirmation racing reduced capacity", action: "confirm", reviewPreviewId: preview.previewId }),
      approveCalendar(f.actor, f.resource.resourceId, { ...staffingExact(f.approvedCalendar), requestKey: key(),
        rationale: "Synthetic human reduced working calendar", calendar: { ...f.calendar,
          days: [{ date: f.date, contracted: [{ date: f.date, from: `${f.date}T09:00`, to: `${f.date}T11:00`, fromOffset: null, toOffset: null }],
            holidays: [], leave: [], protected: [] }] } }),
    ]);
    expect(revised.status).toBe("fulfilled");
    if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
    const committedMinutes = confirmed.status === "fulfilled" ? 240 : 0;
    const current = await readCalendar(f.actor, f.resource.resourceId, { fromDate: f.date, toDate: f.date });
    expect(current.days[0]).toMatchObject({ confirmedMinutes: committedMinutes,
      capacity: { availableMinutes: 120, confirmedMinutes: committedMinutes, remainingMinutes: 120 - committedMinutes } });
    const allocation = await readAllocation(f.actor, f.allocation.allocationId);
    if (committedMinutes) expect(allocation).toMatchObject({ state: "confirmed", reviewRequired: true });
    const entries = (await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows;
    expect(entries.map(row => row.minutes)).toEqual(committedMinutes ? [240] : []);
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n)
      .toBe(committedMinutes ? 1 : 0);
  }, 120_000);
  it("serializes confirmation against accepted original withdrawal and retains only commitments that won before withdrawal", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic original-source race review", action: "confirm" });
    const [confirmed, withdrawn] = await Promise.allSettled([
      decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic confirmation racing original withdrawal", action: "confirm", reviewPreviewId: preview.previewId }),
      withdrawManualEvidence(f.actor, f.manualEvidenceId, { requestKey: key(), sourceGeneration: 1, rationale: "Synthetic concurrent source withdrawal" }),
    ]);
    expect(withdrawn.status).toBe("fulfilled");
    if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
    const committed = confirmed.status === "fulfilled";
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes))
      .toEqual(committed ? [240] : []);
    expect((await query("SELECT confirmed_minutes FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.date])).rows[0].confirmed_minutes)
      .toBe(committed ? 240 : 0);
    if (committed) expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ state: "confirmed", reviewRequired: true });
    await expect(createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
      rationale: "Synthetic new confirmation cannot reuse withdrawn evidence", action: "confirm" })).rejects.toMatchObject({ status: 409 });
  }, 120_000);
  it("serializes confirmation against resource inactivation without exposing or removing a previously committed allocation", async () => {
    requireOwnedStaffingClone(); const f = await createReviewedAllocationProposalFixture();
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, {
      ...staffingExact(f.allocation), requestKey: key(), rationale: "Synthetic resource-eligibility race review", action: "confirm" });
    const [confirmed, inactive] = await Promise.allSettled([
      decideAllocation(f.actor, f.allocation.allocationId, { ...staffingExact(f.allocation), requestKey: key(),
        rationale: "Synthetic confirmation racing resource inactivation", action: "confirm", reviewPreviewId: preview.previewId }),
      reviseResource(f.actor, f.resource.resourceId, { ...staffingExact(f.resource), requestKey: key(), rationale: "Synthetic concurrent resource inactivation",
        resource: { ...f.profile, state: "inactive" } }),
    ]);
    expect(inactive.status).toBe("fulfilled");
    if (confirmed.status === "rejected") expect(confirmed.reason).toMatchObject({ status: 409 });
    expect(await readAllocation(f.actor, f.allocation.allocationId)).toMatchObject({ allocation: null, rationale: null, contentAvailability: "withheld", reviewRequired: true });
    expect((await query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows.map(row => row.minutes))
      .toEqual(confirmed.status === "fulfilled" ? [240] : []);
  }, 120_000);
  it("invalidates changed resource previews and releases future time after inactivation while disabled, with exact replay", async () => {
    requireOwnedStaffingClone(); const f = await withTransaction(createConfirmedAllocationLedgerFixture);
    const input = { ...staffingExact(f.allocation), action: "release" as const, rationale: "Synthetic explicit future release" };
    const old = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...input, requestKey: key() });
    expect((await readAllocationReviewPreview(f.actor, f.allocation.allocationId, old.previewId)).effects.removedFutureRows).toHaveLength(1);
    await reviseResource(f.actor, f.resource.resourceId, { ...staffingExact(f.resource), requestKey: key(), rationale: "Synthetic lost eligibility",
      resource: { ...f.profile, state: "inactive" } });
    await expect(decideAllocation(f.actor, f.allocation.allocationId, { ...input, requestKey: key(), reviewPreviewId: old.previewId })).rejects.toMatchObject({ code: "preview_expired" });
    const disabled = process.env.TURAS_007_DISABLED;
    try {
      process.env.TURAS_007_DISABLED = "1";
      const fresh = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...input, requestKey: key() });
      const request = { ...input, requestKey: key(), reviewPreviewId: fresh.previewId };
      const released = await decideAllocation(f.actor, f.allocation.allocationId, request);
      expect(released).toMatchObject({ state: "released", aggregateVersion: 2 });
      expect(await decideAllocation(f.actor, f.allocation.allocationId, request)).toEqual(released);
      expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(1);
      expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
      expect((await query("SELECT confirmed_minutes,generation::int FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.firstDate])).rows[0]).toEqual({ confirmed_minutes: 0, generation: 2 });
      expect((await query("SELECT confirmed_minutes,generation::int FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.firstDate])).rows[0]).toEqual({ confirmed_minutes: 0, generation: 2 });
    } finally { if (disabled === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = disabled; }
  }, 120_000);
  it("refuses operational access and a preview whose stable ledger generation changed", async () => {
    requireOwnedStaffingClone(); const f = await withTransaction(createConfirmedAllocationLedgerFixture);
    const input = { ...staffingExact(f.allocation), requestKey: key(), action: "cancel" as const, rationale: "Synthetic exact cancel" };
    const panel = await withTransaction(db => createProfileTestSession(db, "panel"));
    await expect(createAllocationReviewPreview(panel, f.allocation.allocationId, input)).rejects.toMatchObject({ status: 403 });
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, input);
    await expect(readAllocationReviewPreview(panel, f.allocation.allocationId, preview.previewId)).rejects.toMatchObject({ status: 403 });
    await query("UPDATE staffing_capacity_days SET confirmed_minutes=confirmed_minutes+1,generation=generation+1 WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.firstDate]);
    await expect(decideAllocation(f.actor, f.allocation.allocationId, { ...input, requestKey: key(), reviewPreviewId: preview.previewId })).rejects.toMatchObject({ code: "preview_expired" });
    expect((await query("SELECT state FROM staffing_allocations WHERE id=$1", [f.allocation.allocationId])).rows[0].state).toBe("confirmed");
    expect((await query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(0);
  }, 120_000);
  it("rejects a genuinely expired actor-bound preview without ledger or decision effects", async () => {
    requireOwnedStaffingClone(); const f = await withTransaction(createConfirmedAllocationLedgerFixture);
    const input = { ...staffingExact(f.allocation), action: "release" as const, rationale: "Synthetic expired release" };
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, { ...input, requestKey: key() });
    const expiredId = key();
    // Owned synthetic fixture, preserving the real immutable-trigger contract.
    await query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS instant)
      INSERT INTO staffing_review_previews(id,environment_id,workspace_id,allocation_id,revision_id,
      actor_membership_id,actor_session_id,action,aggregate_version,content_digest,dependency_digest,dependencies,created_at,expires_at)
      SELECT $1,environment_id,workspace_id,allocation_id,revision_id,actor_membership_id,actor_session_id,action,
      aggregate_version,content_digest,dependency_digest,dependencies,clock.instant-interval '11 minutes',clock.instant-interval '1 minute'
      FROM staffing_review_previews CROSS JOIN clock WHERE id=$2`, [expiredId, preview.previewId]);
    await expect(decideAllocation(f.actor, f.allocation.allocationId, { ...input, requestKey: key(), reviewPreviewId: expiredId })).rejects.toMatchObject({ code: "preview_expired" });
    expect((await query("SELECT confirmed_minutes FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.firstDate])).rows[0].confirmed_minutes).toBe(120);
  }, 120_000);
  it("rolls back all ledger row and generation writes after an actual post-ledger SQL failure", async () => {
    requireOwnedStaffingClone(); const f = await withTransaction(createConfirmedAllocationLedgerFixture);
    await expect(withTransaction(async db => {
      await lockStaffingActor(db, f.actor, "manager", { write: true });
      await lockDemandIdentity(db, f.actor, f.demand.demandId!);
      const oldRows = await readConfirmedAllocationLedger(db, f.actor, f.allocation.allocationId!);
      await lockResourceHeads(db, f.actor, oldRows.map(row => row.resourceId));
      const locks = await lockAllocationLedgers(db, f.actor, oldRows, []);
      await db.query("SELECT id FROM staffing_allocations WHERE id=$1 FOR UPDATE", [f.allocation.allocationId]);
      await applyAllocationLedgerChange(db, f.actor, locks, { allocationId: f.allocation.allocationId!, revisionId: f.allocation.revisionId!,
        action: "release", schedulableMinutes: new Map(), requiredMinutes: new Map() });
      await db.query("SELECT 1/0");
    })).rejects.toMatchObject({ code: "22012" });
    expect((await query("SELECT count(*)::int AS n FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].n).toBe(1);
    expect((await query("SELECT confirmed_minutes,generation::int FROM staffing_capacity_days WHERE resource_id=$1 AND service_date=$2", [f.resource.resourceId, f.firstDate])).rows[0]).toEqual({ confirmed_minutes: 120, generation: 1 });
    expect((await query("SELECT confirmed_minutes,generation::int FROM staffing_demand_days WHERE demand_id=$1 AND service_date=$2", [f.demand.demandId, f.firstDate])).rows[0]).toEqual({ confirmed_minutes: 120, generation: 1 });
  }, 120_000);
});
