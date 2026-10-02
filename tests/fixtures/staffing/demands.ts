import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createProfileTestSession } from "../profiles";
import { PLAN_FIXTURE_SCOPE, syntheticPlanContent } from "../plans/seed";
import { syntheticSkill } from "./seed";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview, decidePlan } from "../../../lib/server/plans/decisions";
import { createSkill } from "../../../lib/server/staffing/skills";
import { staffingDemandInputSchema } from "../../../lib/contracts/staffing-demands";
const key = () => `synthetic_${randomUUID()}`;
export async function createSyntheticDemandBaseline(db: PoolClient) {
  const actor = await createProfileTestSession(db, "mcteer"), content = syntheticPlanContent();
  // Source-free synthetic scope for exact-baseline domain checks. This does not
  // establish the separately required 003–007 trusted-context journey.
  content.assertions = []; content.sourceDependencies = [];
  const created = await submitPlanCommand(actor, { action: "create", requestKey: key(), workspaceId: PLAN_FIXTURE_SCOPE.workspaceId,
    customerId: PLAN_FIXTURE_SCOPE.customerId, workloadId: null, audience: "delivery", ownerMembershipId: actor.membershipId, content }, db);
  const submitted = await submitPlanCommand(actor, { action: "submit", requestKey: key(), planId: created.planId,
    revisionId: created.revisionId, contentDigest: created.contentDigest, expectedAggregateVersion: created.aggregateVersion }, db);
  const preview = await createPlanReviewPreview(actor, created.planId, { requestKey: key(), revisionId: created.revisionId,
    contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion }, db);
  const accepted = await decidePlan(actor, created.planId, { action: "accept", requestKey: key(), revisionId: created.revisionId,
    contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion, reviewPreviewId: preview.previewId,
    rationale: "Synthetic exact staffing baseline", deliverySuitabilityConfirmed: true }, db);
  const skill = await createSkill(actor, { requestKey: key(), rationale: "Synthetic demand skill", skill: syntheticSkill() }, db);
  const demand = staffingDemandInputSchema.parse({ customerId: PLAN_FIXTURE_SCOPE.customerId, workloadId: null,
    engagementId: accepted.engagementId, baselineId: accepted.baselineId, planId: created.planId, planRevisionId: created.revisionId,
    baselineDigest: created.contentDigest, workPackageKey: content.workPackages[0].key, title: "Synthetic exact work demand", role: "Delivery lead",
    fromDate: "2026-10-01", toDate: "2026-10-02", requiredSkills: [{ skillId: skill.skillId, minimumLevel: 2 }], desiredSkills: [],
    days: [{ date: "2026-10-01", requiredMinutes: 240 }, { date: "2026-10-02", requiredMinutes: 240 }], allowedRegions: [], billable: true, overlap: null });
  return { actor, content, created, accepted, demand };
}
