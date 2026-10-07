import { randomUUID } from "node:crypto";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { createReviewedPlanWorkload } from "../plans/journey";
import { createSupportOutcomeEvidence } from "./outcome";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { syntheticPlanContent } from "../plans/seed";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview, decidePlan } from "../../../lib/server/plans/decisions";
import { saveSupportProposal } from "../../../lib/server/support/service";
import { createSupportReviewPreview, decideSupportRevision } from "../../../lib/server/support/review";

/** Profile portion of S01. The complete scenario must additionally establish
 * its selected engagement and open handoff before it can run a live model. */
export async function createSupportRichContext(author: CurrentSession, reviewer: CurrentSession, customerId: string) {
  requireOwnedSupportClone();
  const workloadId = await withTransaction(db => createReviewedPlanWorkload(db, author, reviewer, customerId));
  const operating = await createSupportOutcomeEvidence(author, reviewer, customerId, {
    additionalText: "Synthetic workload has documented operating ownership and a verified human review checkpoint. This is not ticket acknowledgement or engagement completion." });
  const observedAt = new Date(Date.now() - 10000).toISOString(), reviewAt = new Date(Date.now() + 7 * 86400000).toISOString();
  async function proposeAndAccept(payload: unknown) {
    return withTransaction(async db => {
      const saved = await submitProfileCommand(author, customerId, { action: "propose_record", requestKey: randomUUID(), workloadId,
        requestedAudience: "delivery", dataCategory: "delivery_context", payload }, db) as { revisionId: string };
      const row = (await db.query(`SELECT v.content_digest,r.version,r.current_accepted_revision_id
        FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1`, [saved.revisionId])).rows[0];
      await submitProfileCommand(reviewer, customerId, { action: "accept_revision", requestKey: randomUUID(), revisionId: saved.revisionId,
        digest: row.content_digest, expectedRecordVersion: Number(row.version), expectedAcceptedRevisionId: row.current_accepted_revision_id,
        rationale: "Human reviewed the exact synthetic workload context and its evidence limitations" }, db);
      return saved.revisionId;
    });
  }
  const ownerRevisionId = await proposeAndAccept({ kind: "stakeholder", name: "Synthetic operating lead", role: "Workload operating owner",
    responsibilities: "Accountable for operating verification and human handoff checkpoints", classification: "delivery" });
  const evidenceRevisionIds = [operating.reference.sourceRevisionId];
  const maturityRevisionId = await proposeAndAccept({ kind: "maturity_assessment", observationStart: observedAt, observationEnd: observedAt,
    assessor: "Synthetic human reviewer", rubricVersion: "customer-maturity-v1", rationale: "Synthetic assessed capabilities with explicitly limited operating evidence",
    dimensions: ["outcome_ownership", "delivery_collaboration", "experience_adoption", "operational_trust", "platform_organization", "innovation_ai"].map(key => ({ key,
      state: key === "operational_trust" ? "Emerging" : "Unknown", rationale: key === "operational_trust" ? "Reviewed operating observation supports emerging capability only" : "No reviewed evidence for this dimension",
      evidenceRevisionIds: key === "operational_trust" ? evidenceRevisionIds : [], nextCapability: "Human verifies the next measurable capability" })),
    nextCapability: "Verify operating handoff obligations without equating them with maturity", reviewAt, evidenceRevisionIds });
  return { workloadId, ownerRevisionId, maturityRevisionId, operatingSource: operating.reference };
}

export async function createSupportRichScenario(author: CurrentSession, reviewer: CurrentSession, customerId: string) {
  const context = await createSupportRichContext(author, reviewer, customerId);
  const engagementId = await withTransaction(async db => {
    const content = syntheticPlanContent();
    content.assertions = []; content.sourceDependencies = []; content.asOf = new Date(Date.now() - 10000).toISOString();
    const created = await submitPlanCommand(author, { action: "create", requestKey: randomUUID(), workspaceId: author.workspaceId,
      customerId, workloadId: context.workloadId, audience: "delivery", ownerMembershipId: author.membershipId, content }, db);
    const submitted = await submitPlanCommand(author, { action: "submit", requestKey: randomUUID(), planId: created.planId,
      revisionId: created.revisionId, contentDigest: created.contentDigest, expectedAggregateVersion: created.aggregateVersion }, db);
    const preview = await createPlanReviewPreview(reviewer, created.planId, { requestKey: randomUUID(), revisionId: created.revisionId,
      contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion }, db);
    const accepted = await decidePlan(reviewer, created.planId, { action: "accept", requestKey: randomUUID(), revisionId: created.revisionId,
      contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion, reviewPreviewId: preview.previewId,
      rationale: "Human reviewed synthetic delivery commitments; this is not evidence of completed handoff", deliverySuitabilityConfirmed: true }, db);
    if (!accepted.engagementId || !accepted.baselineId) throw new Error("S01 requires a real accepted engagement baseline");
    return accepted.engagementId;
  });
  const observationDate = new Date().toISOString().slice(0, 10), nextReviewDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const saved = await saveSupportProposal(author, customerId, { contractVersion: "support-v1", operation: "save_action", requestKey: randomUUID(),
    workloadId: context.workloadId, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [engagementId], sourceRefs: [context.operatingSource],
    content: { contractVersion: "support-v1", title: "Complete the operating-owner handoff verification", observationDate, nextReviewDate, timezone: "UTC",
      desiredOutcome: "Synthetic operating lead reviews the receiving checklist and outstanding handoff obligations",
      rationale: "The reviewed baseline does not establish completed operational handoff", validationCriterion: "Human reviews dated receiving-owner acknowledgement evidence",
      priority: "high", owner: { kind: "membership", membershipId: author.membershipId }, disposition: "open", outcomeSourceKeys: [] } });
  const preview = await createSupportReviewPreview(reviewer, customerId, { workloadId: context.workloadId, recordId: saved.recordId, revisionId: saved.revisionId });
  await decideSupportRevision(reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
    workloadId: context.workloadId, recordId: saved.recordId, revisionId: saved.revisionId, expectedVersion: preview.expectedVersion,
    sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Human accepts the owned open handoff obligation, not completed work" });
  return { ...context, engagementId, handoffRecordId: saved.recordId };
}
