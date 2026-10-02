import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { withTransaction } from "../../lib/server/db/client";
import { createReviewedStaffingJourneyInputs } from "../fixtures/staffing/journey";
import { createDemand, qualifyDemand } from "../../lib/server/staffing/demands";
import { createMatchingResult, readMatchingResult } from "../../lib/server/staffing/matching";
import { proposeAllocation } from "../../lib/server/staffing/allocations";
import { createAllocationReviewPreview, decideAllocation } from "../../lib/server/staffing/decisions";
import { createFinanceInput, approveFinancePolicy, staffingFinancePolicyDigest } from "../../lib/server/staffing/economics";
import { createStaffingScenario, readStaffingScenario } from "../../lib/server/staffing/scenarios";
import { staffingExact, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { readEngagement } from "../../lib/server/engagements/read";
import { readStaffingOperations } from "../../lib/server/staffing/operations";
import { retireArtifactVersion } from "../../lib/server/artifacts/lifecycle";
import { readPlan } from "../../lib/server/plans/read";

describe("actual reviewed trusted-context staffing journey", () => {
  it("preserves actual artifact/review/retrieval/shared-review/acceptance/import/confirmation identities and exact finance totals", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const { actors, customerId, workloadId, artifact, practice, content, accepted, profile, resource, skill, serviceDate, end, workforce } = await createReviewedStaffingJourneyInputs();
    const acceptedPlan = await readPlan(actors.author, accepted.planId, accepted.planRevisionId);
    expect({ digest: acceptedPlan.contentDigest === accepted.baselineDigest,
      engagement: acceptedPlan.engagementId === accepted.engagementId,
      availability: acceptedPlan.contentAvailability, reviewRequired: acceptedPlan.reviewRequired })
      .toEqual({ digest: true, engagement: true, availability: "readable", reviewRequired: false });
    const draft = await createDemand(actors.author, { requestKey: randomUUID(), rationale: "Demand from the actual accepted source-bound work package",
      demand: { customerId, workloadId, engagementId: accepted.engagementId, planId: accepted.planId, baselineId: accepted.baselineId,
        planRevisionId: accepted.planRevisionId, baselineDigest: accepted.baselineDigest, workPackageKey: content.workPackages[0].key,
        title: "Synthetic source-bound delivery staffing", role: "Application delivery lead", fromDate: serviceDate, toDate: serviceDate,
        requiredSkills: [{ skillId: skill.skillId, minimumLevel: 2 }], desiredSkills: [], days: [{ date: serviceDate, requiredMinutes: 240 }],
        allowedRegions: [], billable: true, overlap: null } });
    const qualified = await qualifyDemand(actors.author, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Exact accepted baseline and work-package qualification" });
    const match = await createMatchingResult(actors.author, draft.demandId, { ...staffingExact(qualified), requestKey: randomUUID(), rationale: "Actual whole-pool comparison" });
    const matches = await readMatchingResult(actors.author, draft.demandId, { resultId: match.entityId, pageSize: 50 });
    expect(matches.items.find(row => row.resourceId === resource.resourceId)).toMatchObject({ status: "eligible" });
    const proposed = await proposeAllocation(actors.author, { requestKey: randomUUID(), rationale: "Human proposal after actual reviewed match",
      allocation: { resourceId: resource.resourceId, demandId: draft.demandId, demandRevisionId: qualified.revisionId,
        demandDigest: qualified.contentDigest, expectedDemandVersion: qualified.aggregateVersion, days: [{ date: serviceDate, minutes: 120 }] } });
    const preview = await createAllocationReviewPreview(actors.reviewer, proposed.allocationId, { ...staffingExact(proposed), action: "confirm",
      requestKey: randomUUID(), rationale: "Review current exact resource and demand capacity" });
    const decisionBody = { ...staffingExact(proposed), action: "confirm", reviewPreviewId: preview.previewId,
      requestKey: randomUUID(), rationale: "Human exact confirmation of the actual source-bound imported resource" };
    const confirmed = await decideAllocation(actors.reviewer, proposed.allocationId, decisionBody);
    expect(await decideAllocation(actors.reviewer, proposed.allocationId, decisionBody)).toEqual(confirmed);
    for (const [rateKind, minorUnitsPerHour] of [["loaded_cost", "1000"], ["service", "2000"]] as const) await createFinanceInput(actors.reviewer,
      { requestKey: randomUUID(), rationale: "Human entered synthetic effective hourly rate", provenance: "Synthetic explicit journey rate reference",
        input: { kind: "rate", rateKind, resourceId: resource.resourceId!, currency: "USD", fromDate: serviceDate, toDate: end, minorUnitsPerHour } });
    for (const [kind, minorUnits] of [["contracted_revenue", "10000"], ["nonlabor", "500"]] as const) await createFinanceInput(actors.reviewer,
      { requestKey: randomUUID(), rationale: "Human entered exact synthetic commercial amount", provenance: "Synthetic exact one-day entered amount",
        input: { kind, engagementId: accepted.engagementId!, baselineId: accepted.baselineId!, currency: "USD", fromDate: serviceDate, toDate: end, minorUnits } });
    const policy = await approveFinancePolicy(actors.reviewer, { requestKey: randomUUID(), rationale: "Human review of the exact planning formula and input policy",
      formulaVersion: "staffing-economics-v1", inputPolicyDigest: staffingFinancePolicyDigest() });
    const scenario = await createStaffingScenario(actors.reviewer, { requestKey: randomUUID(), rationale: "Reproducible forecast from actual human-confirmed persisted minutes",
      customerId, engagementId: accepted.engagementId, baselineId: accepted.baselineId, baselineDigest: accepted.baselineDigest,
      currency: "USD", fromDate: serviceDate, toDate: serviceDate });
    expect(await readStaffingScenario(actors.reviewer, scenario.scenarioId)).toMatchObject({ contentAvailability: "readable", status: "complete", content: {
      deliveryCost: "2000", contractedRevenue: "10000", nonlaborCost: "500", contribution: "7500", marginPercentage: "75.00",
      hypotheticalServiceRevenue: "4000", policyApproval: "approved", policyDecisionId: policy.decisionId } });
    const partner = await readEngagement(actors.partner, accepted.engagementId!);
    expect(partner.staffingAssignments!.items.find(row => row.assignmentId === proposed.allocationId)).toMatchObject({ displayName: profile.displayName,
      deliveryRole: "Application delivery lead", days: [{ date: serviceDate, minutes: 120 }] });
    expect(JSON.stringify(partner)).not.toContain("PRIVATE_SYNTHETIC_JOURNEY_PERSONNEL_EVIDENCE");
    expect(JSON.stringify(partner)).not.toContain(practice.privateOriginName);
    await withTransaction(async db => {
      expect((await db.query("SELECT artifact_selection_id FROM profile_evidence_links WHERE profile_revision_id=$1", [artifact.profileRevisionId])).rows[0].artifact_selection_id).toBe(artifact.selectionId);
      expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [workforce.competencyId])).rows[0].current_accepted_revision_id).toBe(workforce.competencyRevisionId);
      expect((await db.query("SELECT source_version_id,extraction_id,mapping_revision_id FROM workforce_competency_revisions WHERE id=$1", [workforce.competencyRevisionId])).rows[0])
        .toMatchObject({ source_version_id: workforce.sourceVersionId, extraction_id: workforce.extractionId, mapping_revision_id: workforce.mappingId });
      expect((await db.query("SELECT decision_id FROM milestone_baselines WHERE id=$1", [accepted.baselineId])).rows[0].decision_id).toBe(accepted.decisionId);
      expect((await db.query("SELECT id FROM workforce_review_decisions WHERE revision_id=$1", [workforce.competencyRevisionId])).rows[0].id).toBe(workforce.decision.decisionId);
      expect((await db.query("SELECT revision_id,minutes,billable FROM staffing_allocation_days WHERE allocation_id=$1", [proposed.allocationId])).rows)
        .toEqual([{ revision_id: proposed.revisionId, minutes: 120, billable: true }]);
      expect((await db.query("SELECT count(*)::int AS n FROM staffing_decisions WHERE allocation_id=$1", [proposed.allocationId])).rows[0].n).toBe(1);
    });
    const period = { customerId, fromDate: serviceDate, toDate: serviceDate };
    const current = await readStaffingOperations(actors.author, period);
    const currentDay = current.items.find(item => item.resourceId === resource.resourceId)!.days[0];
    expect(currentDay).toMatchObject({ confirmedMinutes: 120, customerConfirmedMinutes: 120, needsReview: false });
    const original = await withTransaction(async db => (await db.query("SELECT lifecycle_generation,submitted_at FROM artifact_versions WHERE id=$1",
      [artifact.artifactVersionId])).rows[0]);
    await retireArtifactVersion(original.submitted_at ? actors.reviewer : actors.author, artifact.artifactVersionId, {
      action: "withdraw", expectedGeneration: Number(original.lifecycle_generation), reason: "Synthetic original source withdrawn after staffing confirmation",
      idempotencyKey: randomUUID() });
    const withdrawn = await readStaffingOperations(actors.author, period);
    const retainedDay = withdrawn.items.find(item => item.resourceId === resource.resourceId)!.days[0];
    expect(retainedDay).toMatchObject({ confirmedMinutes: 120, customerConfirmedMinutes: 120, needsReview: true, reason: "baseline_review_required" });
    expect(retainedDay.capacity).toEqual(currentDay.capacity);
    expect(JSON.stringify(withdrawn)).not.toContain(artifact.text);
    expect(JSON.stringify(withdrawn)).not.toContain(practice.privateOriginName);
    expect(JSON.stringify(withdrawn)).not.toContain("PRIVATE_SYNTHETIC_JOURNEY_PERSONNEL_EVIDENCE");
  }, 300_000);
});
