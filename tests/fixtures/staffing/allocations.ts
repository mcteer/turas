import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { createSyntheticDemandBaseline } from "./demands";
import { syntheticResource } from "./seed";
import { createResource } from "../../../lib/server/staffing/resources";
import { createDemand, qualifyDemand } from "../../../lib/server/staffing/demands";
import { proposeAllocation } from "../../../lib/server/staffing/allocations";
import { withTransaction, query } from "../../../lib/server/db/client";
import { getServerConfig } from "../../../lib/server/config";
import { STAFFING_FIXTURE_SCOPE } from "./seed";
import { createManualAssessment, decideCompetencies } from "../../../lib/server/staffing/competencies";
import { approveCalendar } from "../../../lib/server/staffing/calendars";
import type { StaffingResourceInput } from "../../../lib/contracts/staffing";
export const staffingExact = (result: { revisionId?: string; contentDigest?: string; aggregateVersion?: number }) => ({
  revisionId: result.revisionId!, contentDigest: result.contentDigest!, expectedAggregateVersion: result.aggregateVersion! });

/** Isolate synthetic scenarios without changing admission limits within a case. */
export async function resetStaffingFixtureRates() {
  requireOwnedStaffingClone();
  await query(`DELETE FROM staffing_write_windows WHERE environment_id=$1 AND workspace_id=$2`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, STAFFING_FIXTURE_SCOPE.workspaceId]);
}

/** Real 007 competency/calendar/proposal paths on a source-free synthetic 006
 * accepted baseline. This is not the separate 003–007 trusted-context journey. */
export async function createReviewedAllocationProposalFixture(resourceOverrides: Partial<StaffingResourceInput> = {}) {
  requireOwnedStaffingClone();
  const f = await withTransaction(async db => {
    const baseline = await createSyntheticDemandBaseline(db), profile = { ...syntheticResource(), timezone: "UTC", ...resourceOverrides };
    const resource = await createResource(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic reviewed resource", resource: profile }, db);
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
    const nextReview = new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);
    const assessment = await createManualAssessment(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic dated source",
      resourceId: resource.resourceId, skillId: baseline.demand.requiredSkills[0].skillId, level: 3, assessmentDate: today,
      nextReviewDate: nextReview, evidence: "PRIVATE_SYNTHETIC_DECISION_EVIDENCE" }, db);
    await decideCompetencies(baseline.actor, { requestKey: randomUUID(), rows: [{ competencyId: assessment.competencyId,
      candidateRevisionId: assessment.revisionId, candidateDigest: assessment.contentDigest, sourceGeneration: 1,
      expectedAggregateVersion: assessment.aggregateVersion, action: "accept", rationale: "Synthetic exact source approval" }] }, db);
    const manualEvidenceId = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [assessment.revisionId])).rows[0].manual_evidence_id as string;
    const demandInput = { ...baseline.demand, fromDate: date, toDate: date, days: [{ date, requiredMinutes: 240 }] };
    const draft = await createDemand(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic reviewed demand", demand: demandInput }, db);
    const demand = await qualifyDemand(baseline.actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic reviewed qualification" }, db);
    const allocationInput = { resourceId: resource.resourceId!, demandId: demand.demandId!, demandRevisionId: demand.revisionId!,
      demandDigest: demand.contentDigest!, expectedDemandVersion: demand.aggregateVersion!, days: [{ date, minutes: 240 }] };
    const allocation = await proposeAllocation(baseline.actor, { requestKey: randomUUID(), rationale: "Synthetic reviewed proposal", allocation: allocationInput }, db);
    return { actor: baseline.actor, baseline, resource, profile, demand, demandInput, allocation, allocationInput, date, assessment, manualEvidenceId };
  });
  const calendar = { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    fromDate: f.date, toDate: f.date, days: [{ date: f.date,
      contracted: [{ date: f.date, from: `${f.date}T09:00`, to: `${f.date}T17:00`, fromOffset: null, toOffset: null }], holidays: [], leave: [], protected: [] }] };
  const approvedCalendar = await approveCalendar(f.actor, f.resource.resourceId, { requestKey: randomUUID(), rationale: "Synthetic approved working calendar", calendar });
  return { ...f, calendar, approvedCalendar };
}

/** Confirmed ledger fixture ONLY. Direct ledger seeding is explicitly not proof
 * of a governed confirmation or the separately required trusted-context journey. */
export async function createConfirmedAllocationLedgerFixture(db: PoolClient, resourceOverrides: Partial<StaffingResourceInput> = {}) {
  requireOwnedStaffingClone();
  const f = await createSyntheticDemandBaseline(db), profile = { ...syntheticResource(), timezone: "UTC", ...resourceOverrides };
  const resource = await createResource(f.actor, { requestKey: randomUUID(), rationale: "Synthetic ledger fixture", resource: profile }, db);
  const firstDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const draft = await createDemand(f.actor, { requestKey: randomUUID(), rationale: "Synthetic ledger fixture demand",
    demand: { ...f.demand, fromDate: firstDate, toDate: firstDate, days: [{ date: firstDate, requiredMinutes: 240 }] } }, db);
  const demand = await qualifyDemand(f.actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic ledger fixture qualification" }, db);
  const allocation = await proposeAllocation(f.actor, { requestKey: randomUUID(), rationale: "Synthetic ledger fixture proposal",
    allocation: { resourceId: resource.resourceId, demandId: demand.demandId, demandRevisionId: demand.revisionId,
      demandDigest: demand.contentDigest, expectedDemandVersion: demand.aggregateVersion, days: [{ date: firstDate, minutes: 120 }] } }, db);
  await db.query(`INSERT INTO staffing_capacity_days(resource_id,service_date,confirmed_minutes) VALUES($1,$2,120)`, [resource.resourceId, firstDate]);
  await db.query(`UPDATE staffing_demand_days SET confirmed_minutes=120 WHERE demand_id=$1 AND service_date=$2`, [demand.demandId, firstDate]);
  await db.query(`INSERT INTO staffing_allocation_days(allocation_id,revision_id,resource_id,demand_id,service_date,minutes,billable)
    VALUES($1,$2,$3,$4,$5,120,true)`, [allocation.allocationId, allocation.revisionId, resource.resourceId, demand.demandId, firstDate]);
  await db.query(`UPDATE staffing_allocations SET state='confirmed',confirmed_revision_id=current_revision_id WHERE id=$1`, [allocation.allocationId]);
  return { actor: f.actor, resource, profile, demand, allocation, firstDate };
}
