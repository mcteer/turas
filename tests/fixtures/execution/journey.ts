import { createHash,randomUUID } from "node:crypto";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import { requireOwnedExecutionClone } from "../../../scripts/execution-eval-environment";
import { createOwnedConversation } from "../../../lib/server/conversations/repository";
import { createArtifactUploadBatch } from "../../../lib/server/artifacts/intake";
import { stageArtifactUpload,completeArtifactUpload } from "../../../lib/server/artifacts/upload";
import { claimArtifactRun } from "../../../lib/server/artifacts/jobs";
import { runArtifactJob } from "../../../lib/server/artifacts/runner";
import { readArtifactVersion } from "../../../lib/server/artifacts/read";
import { submitArtifactProposal } from "../../../lib/server/artifacts/proposals";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { heartbeatArtifactWorker } from "../../../lib/server/artifacts/worker-readiness";
import { createReviewedPlanWorkload } from "../plans/journey";
import { createProfileTestSession } from "../profiles";
import { syntheticPlanContent } from "../plans/seed";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { searchEvidence } from "../../../lib/server/retrieval/search";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../../../lib/server/plans/decisions";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";

/** Real004 upload/scan/extraction and human003 review in an owned008 clone. */
export async function createReviewedExecutionArtifact(actor: CurrentSession, reviewer: CurrentSession,
  customerId: string, workloadId: string,
  text = "The synthetic public web workload requires a reviewed application delivery lead.") {
  requireOwnedExecutionClone();
  const bytes = Buffer.from(text, "utf8"), today = new Date().toISOString().slice(0, 10);
  const conversation = await createOwnedConversation(actor, { customerId, requestKey: randomUUID(), title: "Synthetic execution evidence intake" });
  await heartbeatArtifactWorker();
  const batch = await createArtifactUploadBatch(actor, { conversationId: conversation.conversation.id, customerId, workloadId,
    idempotencyKey: randomUUID(), files: [{ name: "synthetic-execution-delivery.txt", expectedSizeBytes: bytes.length,
      declaredType: "text/plain", sourcePublishedOn: today, sourceObservedOn: today, rightsNote: "Synthetic owned journey evidence",
      audience: "delivery", dataCategory: "delivery_context" }] });
  async function* original() { yield bytes; }
  await stageArtifactUpload(actor, batch.intents[0].id, original(), bytes.length);
  const completed = await completeArtifactUpload(actor, batch.intents[0].id, randomUUID());
  if (!completed.versionId) throw new Error("Synthetic journey upload did not complete");
  const claim = await claimArtifactRun();
  if (!claim || claim.versionId !== completed.versionId) throw new Error("Journey requires its isolated artifact job at the owned queue head");
  await runArtifactJob(claim);
  const version = await readArtifactVersion(actor, completed.versionId);
  if (version.state !== "ready" || !version.publishedRunId) throw new Error("Actual artifact scan/extraction did not publish a complete journey source");
  const source = await withTransaction(async db => {
    const units = (await db.query("SELECT id,text,ordinal FROM artifact_extraction_units WHERE run_id=$1 ORDER BY ordinal", [version.publishedRunId])).rows;
    const unit = units.find(row => row.text === text);
    if (!unit) throw new Error("Actual extraction did not preserve the exact synthetic source text");
    const proposal = await submitArtifactProposal(actor, { selection: { versionId: version.id, runId: version.publishedRunId!,
      lifecycleGeneration: version.lifecycleGeneration, ranges: [{ unitId: unit.id, start: 0, end: Array.from(text).length }],
      excerpt: text, excerptDigest: createHash("sha256").update(text).digest("hex"), audience: "delivery", dataCategory: "delivery_context" },
      command: { action: "propose_record", requestKey: randomUUID(), workloadId, requestedAudience: "delivery", dataCategory: "delivery_context",
        payload: { kind: "product_use", productKey: `synthetic-execution-${randomUUID().slice(0, 8)}`,
          displayName: "Synthetic public web", state: "actual", usageDescription: text,
          observedAt: new Date(Date.now() - 10_000).toISOString() },
        qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 2,
          reliabilityRationale: "Exact synthetic uploaded observation reviewed by a human",
          directnessRationale: "The selected text directly describes delivery execution",
          corroborationRationale: "Single reviewed synthetic source; no independent corroboration",
          informationType: "adoption_process", dateBasis: "observation" } } }, db);
    const current = (await db.query(`SELECT r.content_digest,p.version,p.current_accepted_revision_id FROM profile_revisions r
      JOIN profile_records p ON p.id=r.record_id WHERE r.id=$1`, [proposal.revisionId])).rows[0];
    await submitProfileCommand(reviewer, customerId, { action: "accept_revision", requestKey: randomUUID(), revisionId: proposal.revisionId,
      digest: current.content_digest, expectedRecordVersion: Number(current.version), expectedAcceptedRevisionId: current.current_accepted_revision_id,
      rationale: "Human review of actual extracted journey text and source identity" }, db);
    const projection = await materializeCurrentProjection(db, "accepted_profile", proposal.revisionId, "delivery");
    if (!projection) throw new Error("Actual reviewed artifact claim did not materialize for delivery retrieval");
    return { profileRevisionId: proposal.revisionId, selectionId: proposal.selectionId, unitId: unit.id as string };
  });
  return { ...source, artifactVersionId: version.id, extractionRunId: version.publishedRunId, text, conversationId: conversation.conversation.id };
}

export async function createReviewedExecutionJourney() {
  requireOwnedExecutionClone();
  const actors=await withTransaction(async db=>({author:await createProfileTestSession(db,'panel'),reviewer:await createProfileTestSession(db,'mcteer'),partner:await createProfileTestSession(db,'partner')}));
  const customerId=DEMO_IDS.sharedCustomer,workloadId=await withTransaction(db=>createReviewedPlanWorkload(db,actors.author,actors.reviewer,customerId));
  const artifact=await createReviewedExecutionArtifact(actors.author,actors.reviewer,customerId,workloadId);
  const previous=process.env.AI_GATEWAY_API_KEY;let search:Awaited<ReturnType<typeof searchEvidence>>;
  try{delete process.env.AI_GATEWAY_API_KEY;search=await searchEvidence(actors.author,{scope:'customer',customerId,workloadId,query:'synthetic public web workload reviewed application delivery lead',use:'discovery',limit:10},{audience:'delivery',workloadId});}
  finally{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;}
  const retrieved=search.results.find(r=>r.sourceRevisionId===artifact.profileRevisionId);if(!retrieved)throw new Error('Actually reviewed journey artifact missing from retrieval');
  const metadata=await withTransaction(async db=>(await db.query("SELECT source_generation,content_digest FROM retrieval_sources WHERE source_kind='accepted_profile' AND source_revision_id=$1 AND lifecycle_state='current' AND audience='delivery'",[artifact.profileRevisionId])).rows[0]);
  const reference={id:randomUUID(),kind:'accepted_profile' as const,sourceRevisionId:artifact.profileRevisionId,generation:Number(metadata.source_generation),contentDigest:metadata.content_digest as string,locator:retrieved.locators[0],citationId:retrieved.citationId};
  const content=syntheticPlanContent() as PlanDraftContent;content.asOf=new Date(Date.now()-10000).toISOString();content.title='Synthetic reviewed execution journey';content.sourceDependencies=[reference];
  content.assertions=[{key:'reviewed_delivery',kind:'accepted_fact',text:artifact.text,sourceDependencyIds:[reference.id],decisionCritical:false}];
  const accepted=await withTransaction(async db=>{
    const created=await submitPlanCommand(actors.author,{action:'create',requestKey:randomUUID(),workspaceId:actors.author.workspaceId,customerId,workloadId,audience:'delivery',ownerMembershipId:actors.author.membershipId,content},db);
    const submitted=await submitPlanCommand(actors.author,{action:'submit',requestKey:randomUUID(),planId:created.planId,revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:created.aggregateVersion},db);
    const preview=await createPlanReviewPreview(actors.reviewer,created.planId,{requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},db);
    const decision=await decidePlan(actors.reviewer,created.planId,{action:'accept',requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Human verified the actual synthetic source and exact plan',deliverySuitabilityConfirmed:true},db);
    if(!decision.engagementId||!decision.baselineId)throw new Error('Journey plan acceptance incomplete');return {...decision,planId:created.planId,planRevisionId:created.revisionId,baselineDigest:created.contentDigest};
  });
  return {actors,customerId,workloadId,artifact,reference,content,accepted,engagementId:accepted.engagementId!,baselineId:accepted.baselineId!};
}
