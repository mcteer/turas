import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview, decidePlan } from "../../../lib/server/plans/decisions";
import { createProfileTestSession } from "../profiles";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { syntheticPlanContent } from "../plans/seed";
import { requireOwnedExpansionClone } from "../../../scripts/expansion-eval-environment";
/** Foundation fixture uses real 006 review, with explicitly source-free synthetic
 * planning proposals. The full delivery journey supplies separately reviewed evidence. */
export async function createExpansionDeliveryBaseline(db: PoolClient, options:{plannedDate?:string;customerId?:string;sources?:import("../../../lib/contracts/plan-content").PlanDraftContent["sourceDependencies"]}={}) {
  requireOwnedExpansionClone();
  const reviewer = await createProfileTestSession(db, "mcteer"), author = await createProfileTestSession(db, "panel");
  const content = syntheticPlanContent() as import("../../../lib/contracts/plan-content").PlanDraftContent;
  if(options.plannedDate){content.milestones[0].plannedDate=options.plannedDate;delete content.milestones[0].plannedDateUnknownReason;} content.assertions = []; content.sourceDependencies = options.sources??[];
  content.asOf = new Date(Date.now() - 10000).toISOString();
  const created = await submitPlanCommand(author, { action: "create", requestKey: randomUUID(), workspaceId: author.workspaceId,
    customerId: options.customerId ?? DEMO_IDS.sharedCustomer, workloadId: null, audience: "internal", ownerMembershipId: author.membershipId, content }, db);
  const submitted = await submitPlanCommand(author, { action: "submit", requestKey: randomUUID(), planId: created.planId,
    revisionId: created.revisionId, contentDigest: created.contentDigest, expectedAggregateVersion: created.aggregateVersion }, db);
  const preview = await createPlanReviewPreview(reviewer, created.planId, { requestKey: randomUUID(), revisionId: created.revisionId,
    contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion }, db);
  const decision = await decidePlan(reviewer, created.planId, { action: "accept", requestKey: randomUUID(), revisionId: created.revisionId,
    contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion, reviewPreviewId: preview.previewId,
    rationale: "Human review of explicit synthetic planning proposals", deliverySuitabilityConfirmed: true }, db);
  if (!decision.engagementId || !decision.baselineId) throw new Error("Governed fixture requires accepted baseline");
  return { reviewer, author, content, created, decision, customerId: options.customerId ?? DEMO_IDS.sharedCustomer,
    engagementId: decision.engagementId, baselineId: decision.baselineId };
}
