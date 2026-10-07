import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource } from "../fixtures/staffing/seed";
import { createResource, revisePartnerEligibility } from "../../lib/server/staffing/resources";
import { createFinanceInput, reviseFinanceInput, approveFinancePolicy, staffingFinancePolicyDigest } from "../../lib/server/staffing/economics";
import { createStaffingScenario, readStaffingScenario, listStaffingScenarios } from "../../lib/server/staffing/scenarios";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { readDemand } from "../../lib/server/staffing/demands";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
const request = (resourceId: string) => ({ requestKey: randomUUID(), rationale: "Synthetic entered cost rate", provenance: "Synthetic source reference",
  input: { kind: "rate", rateKind: "loaded_cost", resourceId, currency: "USD", fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "1500" } });
describe("canonical finance input and human policy boundary", () => {
  it("withholds a retained partner forecast after dated eligibility is retracted without changing its confirmed ledger", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      await db.query("SAVEPOINT finance_partner_eligibility");
      try {
        const partner = await createProfileTestSession(db, "partner");
        const org = (await db.query("SELECT partner_org_id FROM memberships WHERE id=$1", [partner.membershipId])).rows[0].partner_org_id;
        const f = await createConfirmedAllocationLedgerFixture(db, { kind: "partner", membershipId: partner.membershipId, partnerOrganizationId: org });
        const demand = await readDemand(f.actor, f.demand.demandId, db);
        const declaration = { requestKey: randomUUID(), rationale: "Synthetic partner financial eligibility", customerId: demand.customerId,
          fromDate: f.firstDate, toDate: f.firstDate, state: "active", revisionId: f.resource.revisionId,
          contentDigest: f.resource.contentDigest, expectedAggregateVersion: f.resource.aggregateVersion };
        await revisePartnerEligibility(f.actor, f.resource.resourceId, declaration, db);
        const scenario = await createStaffingScenario(f.actor, { requestKey: randomUUID(), rationale: "Synthetic partner forecast",
          customerId: demand.customerId, engagementId: demand.engagementId, baselineId: demand.baselineId, baselineDigest: demand.baselineDigest,
          currency: "USD", fromDate: f.firstDate, toDate: f.firstDate }, db);
        expect(await readStaffingScenario(f.actor, scenario.scenarioId, db)).toMatchObject({ contentAvailability: "readable", status: "incomplete" });
        await revisePartnerEligibility(f.actor, f.resource.resourceId, { ...declaration, requestKey: randomUUID(), state: "retracted",
          expectedAggregateVersion: f.resource.aggregateVersion! + 1 }, db);
        expect(await readStaffingScenario(f.actor, scenario.scenarioId, db)).toMatchObject({ contentAvailability: "withheld", status: "stale", content: null });
        expect((await db.query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].minutes).toBe(120);
      } finally { await db.query("ROLLBACK TO SAVEPOINT finance_partner_eligibility"); }
    });
  }, 120_000);
  it("withholds a retained forecast immediately after approved personnel source withdrawal, before cleanup", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      const f = await createConfirmedAllocationLedgerFixture(db), demand = await readDemand(f.actor, f.demand.demandId, db);
      const end = new Date(Date.parse(f.firstDate) + 86_400_000).toISOString().slice(0, 10);
      const assessment = await createManualAssessment(f.actor, { requestKey: randomUUID(), rationale: "Synthetic current financial lineage",
        resourceId: f.resource.resourceId, skillId: demand.demand!.requiredSkills[0].skillId, level: 3,
        assessmentDate: new Date().toISOString().slice(0, 10), nextReviewDate: end, evidence: "PRIVATE_SYNTHETIC_FINANCE_PERSONNEL_EVIDENCE" }, db);
      await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [{ competencyId: assessment.competencyId, candidateRevisionId: assessment.revisionId,
        candidateDigest: assessment.contentDigest, expectedAggregateVersion: assessment.aggregateVersion, sourceGeneration: 1,
        action: "accept", rationale: "Synthetic human competency review" }] }, db);
      const manualId = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [assessment.revisionId])).rows[0].manual_evidence_id;
      await createFinanceInput(f.actor, { requestKey: randomUUID(), rationale: "Synthetic source-linked cost", provenance: "Synthetic declared rate",
        input: { kind: "rate", rateKind: "loaded_cost", resourceId: f.resource.resourceId, currency: "USD", fromDate: f.firstDate, toDate: end, minorUnitsPerHour: "1500" } }, db);
      const created = await createStaffingScenario(f.actor, { requestKey: randomUUID(), rationale: "Synthetic source-linked forecast", customerId: demand.customerId,
        engagementId: demand.engagementId, baselineId: demand.baselineId, baselineDigest: demand.baselineDigest, currency: "USD", fromDate: f.firstDate, toDate: f.firstDate }, db);
      const before = await readStaffingScenario(f.actor, created.scenarioId, db);
      expect(before).toMatchObject({ contentAvailability: "readable", content: { deliveryCost: "3000", contribution: null } });
      expect(JSON.stringify(before)).not.toContain("PRIVATE_SYNTHETIC_FINANCE_PERSONNEL_EVIDENCE");
      await withdrawManualEvidence(f.actor, manualId, { requestKey: randomUUID(), rationale: "Synthetic withdrawal after forecast", sourceGeneration: 1 }, db);
      const after = await readStaffingScenario(f.actor, created.scenarioId, db);
      expect(after).toMatchObject({ contentAvailability: "withheld", content: null, status: "stale" });
      // Opaque UUIDs and digests can contain the digits of a financial value.
      // Assert the complete metadata-only projection instead of substring absence.
      expect(after).toEqual({ scenarioId: before.scenarioId, customerId: before.customerId,
        engagementId: before.engagementId, baselineId: before.baselineId, contentDigest: before.contentDigest,
        contentAvailability: "withheld", content: null, status: "stale", reasons: ["inputs_unavailable"] });
      expect((await db.query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].minutes).toBe(120);
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_scenario_payloads WHERE scenario_id=$1", [created.scenarioId])).rows[0].n).toBe(1);
    });
  }, 120_000);
  it("persists exact entered contribution, flags revised rates stale and withholds inactive personnel without erasing commitments", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    await withTransaction(async db => {
      // Seeded confirmed ledger tests finance projection, not native/confirmation
      // or the separately required complete trusted-context journey.
      const f = await createConfirmedAllocationLedgerFixture(db), demand = await readDemand(f.actor, f.demand.demandId, db);
      const end = new Date(Date.parse(f.firstDate) + 86_400_000).toISOString().slice(0, 10);
      const enteredRate = { requestKey: randomUUID(), rationale: "Synthetic cost source", provenance: "PRIVATE_SYNTHETIC_SCENARIO_RATE_PROVENANCE",
        input: { kind: "rate" as const, rateKind: "loaded_cost" as const, resourceId: f.resource.resourceId!, currency: "USD" as const,
          fromDate: f.firstDate, toDate: end, minorUnitsPerHour: "1500" } };
      const cost = await createFinanceInput(f.actor, enteredRate, db);
      await createFinanceInput(f.actor, { ...enteredRate, requestKey: randomUUID(), input: { ...enteredRate.input, rateKind: "service", minorUnitsPerHour: "3600" } }, db);
      for (const [kind, minorUnits] of [["contracted_revenue", "10000"], ["nonlabor", "500"]] as const) await createFinanceInput(f.actor,
        { requestKey: randomUUID(), rationale: "Synthetic explicit amount", provenance: "Synthetic entered commercial reference",
          input: { kind, engagementId: demand.engagementId, baselineId: demand.baselineId, currency: "USD", fromDate: f.firstDate, toDate: end, minorUnits } }, db);
      const body = { requestKey: randomUUID(), rationale: "Synthetic immutable forecast", customerId: demand.customerId, engagementId: demand.engagementId,
        baselineId: demand.baselineId, baselineDigest: demand.baselineDigest, fromDate: f.firstDate, toDate: f.firstDate, currency: "USD" };
      const created = await createStaffingScenario(f.actor, body, db);
      expect(await createStaffingScenario(f.actor, body, db)).toEqual(created);
      const read = await readStaffingScenario(f.actor, created.scenarioId, db);
      expect(read).toMatchObject({ status: "complete", contentAvailability: "readable", content: {
        deliveryCost: "3000", contractedRevenue: "10000", nonlaborCost: "500", contribution: "6500", marginPercentage: "65.00",
        hypotheticalServiceRevenue: "7200", planningOnly: true, coverage: { confirmedRows: 1, confirmedMinutes: 120, resourceCount: 1 } } });
      expect(JSON.stringify(read)).not.toContain(enteredRate.provenance);
      const panel = await createProfileTestSession(db, "panel");
      await expect(readStaffingScenario(panel, created.scenarioId, db)).rejects.toMatchObject({ status: 403 });
      await expect(listStaffingScenarios(panel, { customerId: demand.customerId }, db)).rejects.toMatchObject({ status: 403 });
      await reviseFinanceInput(f.actor, cost.entityId, { ...enteredRate, requestKey: randomUUID(), revisionId: cost.revisionId,
        contentDigest: cost.contentDigest, expectedAggregateVersion: cost.aggregateVersion, input: { ...enteredRate.input, minorUnitsPerHour: "1800" } }, db);
      expect(await readStaffingScenario(f.actor, created.scenarioId, db)).toMatchObject({ status: "stale", contentAvailability: "historical_warning", content: { deliveryCost: "3000" } });
      const replacement = await createStaffingScenario(f.actor, { ...body, requestKey: randomUUID() }, db);
      expect(await readStaffingScenario(f.actor, replacement.scenarioId, db)).toMatchObject({ content: { deliveryCost: "3600", contribution: "5900", marginPercentage: "59.00" } });
      await db.query("UPDATE workforce_resources SET active=false WHERE id=$1", [f.resource.resourceId]);
      expect(await readStaffingScenario(f.actor, created.scenarioId, db)).toMatchObject({ status: "stale", contentAvailability: "withheld", content: null });
      expect((await db.query("SELECT minutes FROM staffing_allocation_days WHERE allocation_id=$1", [f.allocation.allocationId])).rows[0].minutes).toBe(120);
    });
  }, 120_000);
  it("denies panel before finance retrieval and keeps human formula approval exact", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
      const resource = await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic rate resource", resource: syntheticResource() }, db);
      await expect(createFinanceInput(panel, request(resource.resourceId!), db)).rejects.toMatchObject({ status: 403 });
      const approval = { requestKey: randomUUID(), rationale: "Synthetic explicit planning formula approval", formulaVersion: "staffing-economics-v1", inputPolicyDigest: staffingFinancePolicyDigest() };
      await expect(approveFinancePolicy(panel, approval, db)).rejects.toMatchObject({ status: 403 });
      await expect(approveFinancePolicy(manager, { ...approval, inputPolicyDigest: "f".repeat(64) }, db)).rejects.toMatchObject({ status: 409 });
      const approved = await approveFinancePolicy(manager, approval, db);
      expect(await approveFinancePolicy(manager, approval, db)).toEqual(approved);
      expect((await db.query("SELECT formula_version,input_policy_digest FROM staffing_finance_policy_decisions WHERE id=$1", [approved.decisionId])).rows[0])
        .toEqual({ formula_version: "staffing-economics-v1", input_policy_digest: staffingFinancePolicyDigest() });
    });
  });
  it("rejects current overlapping rates, preserves half-open adjacency and revisions without rewriting history", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      const manager = await createProfileTestSession(db, "mcteer");
      const resource = await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic rate resource", resource: syntheticResource() }, db);
      const initial = request(resource.resourceId!), first = await createFinanceInput(manager, initial, db);
      expect(await createFinanceInput(manager, initial, db)).toEqual(first);
      await expect(createFinanceInput(manager, { ...request(resource.resourceId!), input: { ...initial.input, fromDate: "2026-10-31", toDate: "2026-12-01" } }, db))
        .rejects.toMatchObject({ status: 409 });
      await createFinanceInput(manager, { ...request(resource.resourceId!), input: { ...initial.input, fromDate: "2026-11-01", toDate: "2026-12-01" } }, db);
      const revised = await reviseFinanceInput(manager, first.entityId, { ...initial, requestKey: randomUUID(), revisionId: first.revisionId,
        contentDigest: first.contentDigest, expectedAggregateVersion: first.aggregateVersion, input: { ...initial.input, minorUnitsPerHour: "1600" } }, db);
      expect(revised.aggregateVersion).toBe(2);
      await db.query("SAVEPOINT finance_identity_guard");
      await expect(db.query("UPDATE staffing_economic_inputs SET kind='service' WHERE id=$1", [first.entityId])).rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK TO SAVEPOINT finance_identity_guard");
      expect((await db.query("SELECT minor_units FROM staffing_economic_input_revisions WHERE input_id=$1 ORDER BY revision_number", [first.entityId])).rows.map(row => row.minor_units))
        .toEqual(["1500", "1600"]);
    });
  });
  it("serializes competing first effective rates under the stable resource identity", async () => {
    requireOwnedStaffingClone();
    const prepared = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer"), resource = await createResource(actor,
        { requestKey: randomUUID(), rationale: "Synthetic competing rate resource", resource: syntheticResource() }, db);
      return { actor, resourceId: resource.resourceId! };
    });
    const results = await Promise.allSettled([createFinanceInput(prepared.actor, request(prepared.resourceId)), createFinanceInput(prepared.actor, request(prepared.resourceId))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected"); expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ status: 409 });
    expect((await withTransaction(db => db.query("SELECT count(*)::int AS count FROM staffing_economic_inputs WHERE resource_id=$1", [prepared.resourceId]))).rows[0].count).toBe(1);
  }, 120_000);
});
