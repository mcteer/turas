import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { createProfileTestSession } from "../fixtures/profiles";
import { readEngagement } from "../../lib/server/engagements/read";
import { readDemand } from "../../lib/server/staffing/demands";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { staffingAssignmentSchema } from "../../lib/contracts/staffing-assignments";
import { revisePartnerEligibility } from "../../lib/server/staffing/resources";
describe("confirmed delivery assignment projection", () => {
  it("withholds an assigned partner's narrative for missing/retracted declarations and inactive organization while retaining commitment minutes", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      await db.query("SAVEPOINT partner_eligibility_projection");
      try {
        const partner = await createProfileTestSession(db, "partner");
        const org = (await db.query("SELECT partner_org_id FROM memberships WHERE id=$1", [partner.membershipId])).rows[0].partner_org_id;
        const f = await createConfirmedAllocationLedgerFixture(db, { kind: "partner", membershipId: partner.membershipId, partnerOrganizationId: org });
        const demand = await readDemand(f.actor, f.demand.demandId, db);
        const read = async () => (await readEngagement(partner, demand.engagementId, db)).staffingAssignments!.items[0];
        expect(await read()).toMatchObject({ displayName: null, deliveryRole: null, days: [{ date: f.firstDate, minutes: 120 }], reviewRequired: true });
        const declaration = { requestKey: randomUUID(), rationale: "Synthetic explicit future partner eligibility", customerId: demand.customerId,
          fromDate: f.firstDate, toDate: f.firstDate, state: "active", revisionId: f.resource.revisionId,
          contentDigest: f.resource.contentDigest, expectedAggregateVersion: f.resource.aggregateVersion };
        await revisePartnerEligibility(f.actor, f.resource.resourceId, declaration, db);
        expect(await read()).toMatchObject({ displayName: f.profile.displayName, deliveryRole: demand.demand!.role });
        await db.query("UPDATE partner_organizations SET active=false WHERE id=$1", [org]);
        await expect(read()).rejects.toMatchObject({ status: 404 });
        await db.query("UPDATE partner_organizations SET active=true WHERE id=$1", [org]);
        await revisePartnerEligibility(f.actor, f.resource.resourceId, { ...declaration, requestKey: randomUUID(),
          rationale: "Synthetic explicit eligibility retraction", state: "retracted", expectedAggregateVersion: f.resource.aggregateVersion! + 1 }, db);
        expect(await read()).toMatchObject({ displayName: null, deliveryRole: null, days: [{ date: f.firstDate, minutes: 120 }] });
        expect((await db.query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].minutes).toBe(120);
      } finally { await db.query("ROLLBACK TO SAVEPOINT partner_eligibility_projection"); }
    });
  }, 120_000);
  it("reads only granted confirmed future minutes and withholds personnel narrative immediately after source withdrawal", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      await db.query("SAVEPOINT partner_assignment_fixture");
      try {
        // Seeded-ledger projection case, not human confirmation/trusted journey proof.
        const f = await createConfirmedAllocationLedgerFixture(db), partner = await createProfileTestSession(db, "partner");
        const demand = await readDemand(f.actor, f.demand.demandId, db);
        const candidate = await createManualAssessment(f.actor, { requestKey: randomUUID(), rationale: "Synthetic partner source",
          resourceId: f.resource.resourceId, skillId: demand.demand!.requiredSkills[0].skillId, level: 3,
          assessmentDate: new Date().toISOString().slice(0, 10), nextReviewDate: f.firstDate, evidence: "PRIVATE_SYNTHETIC_PARTNER_PERSONNEL_EVIDENCE" }, db);
        await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [{ competencyId: candidate.competencyId,
          candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest, expectedAggregateVersion: candidate.aggregateVersion,
          sourceGeneration: 1, action: "accept", rationale: "Synthetic exact personnel approval" }] }, db);
        const current = await readEngagement(partner, demand.engagementId, db);
        expect(current.staffingAssignments?.items).toHaveLength(1);
        const record = current.staffingAssignments!.items[0];
        expect(record).toMatchObject({ assignmentId: f.allocation.allocationId, displayName: f.profile.displayName,
          deliveryRole: demand.demand!.role, days: [{ date: f.firstDate, minutes: 120 }], reviewRequired: true });
        expect(staffingAssignmentSchema.safeParse(record).success).toBe(true);
        const text = JSON.stringify(current.staffingAssignments);
        expect(text).not.toMatch(/resourceId|skillId|evidence|provenance|minorUnits|currency|leave|confirmed_revision|rationale/);
        const manualId = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [candidate.revisionId])).rows[0].manual_evidence_id;
        await withdrawManualEvidence(f.actor, manualId, { requestKey: randomUUID(), rationale: "Synthetic post-projection source withdrawal", sourceGeneration: 1 }, db);
        const withdrawn = await readEngagement(partner, demand.engagementId, db);
        expect(withdrawn.staffingAssignments!.items[0]).toMatchObject({ displayName: null, deliveryRole: null,
          days: [{ date: f.firstDate, minutes: 120 }], reviewRequired: true });
        expect((await db.query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].minutes).toBe(120);
        await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1 AND customer_id=$2", [partner.membershipId, demand.customerId]);
        await expect(readEngagement(partner, demand.engagementId, db)).rejects.toMatchObject({ status: 404 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT partner_assignment_fixture"); }
    });
  }, 120_000);
  it("excludes unconfirmed and released heads and rejects arbitrary assignment query shape", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      await db.query("SAVEPOINT partner_assignment_filter");
      try {
        const f = await createConfirmedAllocationLedgerFixture(db), partner = await createProfileTestSession(db, "partner");
        const demand = await readDemand(f.actor, f.demand.demandId, db);
        for (const state of ["tentative", "proposed", "released", "cancelled"] as const) {
          await db.query("UPDATE staffing_allocations SET state=$2 WHERE id=$1", [f.allocation.allocationId, state]);
          expect((await readEngagement(partner, demand.engagementId, db)).staffingAssignments?.items).toEqual([]);
        }
        await expect(readEngagement(partner, demand.engagementId, db, { includeEvidence: true })).rejects.toMatchObject({ status: 422 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT partner_assignment_filter"); }
    });
  }, 120_000);
});
