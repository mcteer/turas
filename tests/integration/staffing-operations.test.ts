import { describe, expect, it } from "vitest";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { withTransaction } from "../../lib/server/db/client";
import { createConfirmedAllocationLedgerFixture, createReviewedAllocationProposalFixture, resetStaffingFixtureRates, staffingExact } from "../fixtures/staffing/allocations";
import { randomUUID } from "node:crypto";
import { createAllocationReviewPreview, decideAllocation } from "../../lib/server/staffing/decisions";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { cancelDemand } from "../../lib/server/staffing/demands";
import { createProfileTestSession } from "../fixtures/profiles";
import { readStaffingOperations } from "../../lib/server/staffing/operations";
describe("authorized operations preserve historical load without private inputs", () => {
  it("warns after a confirmed commitment's evidence is withdrawn without releasing its capacity or revealing evidence", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await createReviewedAllocationProposalFixture();
    const request = { ...staffingExact(f.allocation), requestKey: randomUUID(), rationale: "Synthetic operations review", action: "confirm" as const };
    const preview = await createAllocationReviewPreview(f.actor, f.allocation.allocationId, request);
    await decideAllocation(f.actor, f.allocation.allocationId, { ...request, requestKey: randomUUID(), reviewPreviewId: preview.previewId });
    const { panel, customerId } = await withTransaction(async db => ({ panel: await createProfileTestSession(db, "panel"),
      customerId: (await db.query("SELECT customer_id FROM staffing_allocations WHERE id=$1", [f.allocation.allocationId])).rows[0].customer_id }));
    const input = { customerId, fromDate: f.date, toDate: f.date };
    const before = await readStaffingOperations(panel, input);
    const day = before.items.find(item => item.resourceId === f.resource.resourceId)!.days[0];
    expect(day).toMatchObject({ customerConfirmedMinutes: 240, confirmedMinutes: 240, needsReview: false, reason: null });
    await withdrawManualEvidence(f.actor, f.manualEvidenceId, { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Synthetic withdrawn original" });
    const after = await readStaffingOperations(panel, input);
    const retained = after.items.find(item => item.resourceId === f.resource.resourceId)!.days[0];
    expect(retained).toMatchObject({ customerConfirmedMinutes: 240, confirmedMinutes: 240, needsReview: true, reason: "competency_review_required" });
    expect(retained.capacity).toEqual(day.capacity);
    expect(JSON.stringify(after)).not.toContain("PRIVATE_SYNTHETIC_DECISION_EVIDENCE");
    expect(JSON.stringify(after)).not.toContain(f.manualEvidenceId);
    await cancelDemand(f.actor, f.demand.demandId, { ...staffingExact(f.demand), requestKey: randomUUID(), rationale: "Synthetic cancelled future demand" });
    const cancelled = await readStaffingOperations(panel, input);
    const cancelledDay = cancelled.items.find(item => item.resourceId === f.resource.resourceId)!.days[0];
    expect(cancelledDay).toMatchObject({ confirmedMinutes: 240, customerConfirmedMinutes: 240, needsReview: true, reason: "baseline_review_required" });
    expect(cancelledDay.capacity).toEqual(day.capacity);
  }, 120_000);
  it("reports unknown calendar and committed load after inactivation, separates customer totals and denies partner retrieval", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      // Direct ledger fixture tests projection only, never governed confirmation.
      const f = await createConfirmedAllocationLedgerFixture(db);
      const customerId = (await db.query("SELECT customer_id FROM staffing_allocations WHERE id=$1", [f.allocation.allocationId])).rows[0].customer_id;
      const period = { customerId, fromDate: f.firstDate, toDate: f.firstDate };
      const panel = await createProfileTestSession(db, "panel"), partner = await createProfileTestSession(db, "partner");
      const report = await readStaffingOperations(panel, period, db);
      expect(report).toMatchObject({ formulaVersion: "staffing-capacity-v1", actualUtilization: null, actualReason: "actual_unavailable" });
      const projected = report.items.find(item => item.resourceId === f.resource.resourceId);
      expect(projected).toBeDefined();
      expect(projected!.days[0]).toMatchObject({ confirmedMinutes: 120, confirmedBillableMinutes: 120,
        customerConfirmedMinutes: 120, tentativeMinutes: 0, capacity: null, needsReview: true, reason: "calendar_missing" });
      expect(JSON.stringify(report)).not.toMatch(/rationale|evidence|provenance|leave|minorUnits|cost|margin/);
      await db.query("UPDATE workforce_resources SET active=false WHERE id=$1", [f.resource.resourceId]);
      const inactive = await readStaffingOperations(panel, period, db);
      expect(inactive.items.find(item => item.resourceId === f.resource.resourceId)!.days[0])
        .toMatchObject({ confirmedMinutes: 120, capacity: null, reason: "resource_inactive" });
      await expect(readStaffingOperations(partner, period, db)).rejects.toMatchObject({ status: 403 });
      await expect(readStaffingOperations(panel, { ...period, includeFinance: true }, db)).rejects.toMatchObject({ status: 422 });
      await expect(readStaffingOperations(panel, { ...period, cursor: "untrusted" }, db)).rejects.toMatchObject({ status: 422 });
    });
  }, 120_000);
});
