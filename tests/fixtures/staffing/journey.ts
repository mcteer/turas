import { createHash, randomUUID } from "node:crypto";
import { withTransaction } from "../../../lib/server/db/client";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { createOwnedConversation } from "../../../lib/server/conversations/repository";
import { createArtifactUploadBatch } from "../../../lib/server/artifacts/intake";
import { stageArtifactUpload, completeArtifactUpload } from "../../../lib/server/artifacts/upload";
import { claimArtifactRun } from "../../../lib/server/artifacts/jobs";
import { runArtifactJob } from "../../../lib/server/artifacts/runner";
import { readArtifactVersion } from "../../../lib/server/artifacts/read";
import { submitArtifactProposal } from "../../../lib/server/artifacts/proposals";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { heartbeatArtifactWorker } from "../../../lib/server/artifacts/worker-readiness";
import { heartbeatWorkforceWorker } from "../../../lib/server/staffing/worker-readiness";
import { createImportIntent, uploadImportOriginal, completeImport } from "../../../lib/server/staffing/imports";
import { claimWorkforceImport } from "../../../lib/server/staffing/jobs";
import { runWorkforceImport } from "../../../lib/server/staffing/runner";
import { createImportMapping } from "../../../lib/server/staffing/mapping";
import { decideCompetencies } from "../../../lib/server/staffing/competencies";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
import { createProfileTestSession } from "../profiles";
import { createReviewedPlanWorkload, createPublishedPlanPractice } from "../plans/journey";
import { PLAN_FIXTURE_SCOPE, syntheticPlanContent } from "../plans/seed";
import { searchEvidence } from "../../../lib/server/retrieval/search";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview, decidePlan } from "../../../lib/server/plans/decisions";
import { createResource } from "../../../lib/server/staffing/resources";
import { createSkill } from "../../../lib/server/staffing/skills";
import { syntheticResource, syntheticSkill } from "./seed";
import { approveCalendar } from "../../../lib/server/staffing/calendars";
import { staffingExact } from "./allocations";
/** Actual 004 upload/scan/container extraction and 003 human approval. The
 * fixture never inserts acceptance, extraction or clean-scan receipts directly.
 * Call only in an owned clone with the prepared isolated artifact runtime. */
export async function createReviewedStaffingArtifact(actor: CurrentSession, reviewer: CurrentSession,
  customerId: string, workloadId: string,
  text = "The synthetic public web workload requires a reviewed application delivery lead.") {
  requireOwnedStaffingClone();
  const bytes = Buffer.from(text, "utf8"), today = new Date().toISOString().slice(0, 10);
  const conversation = await createOwnedConversation(actor, { customerId, requestKey: randomUUID(), title: "Synthetic staffing evidence intake" });
  await heartbeatArtifactWorker();
  const batch = await createArtifactUploadBatch(actor, { conversationId: conversation.conversation.id, customerId, workloadId,
    idempotencyKey: randomUUID(), files: [{ name: "synthetic-staffing-delivery.txt", expectedSizeBytes: bytes.length,
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
        payload: { kind: "product_use", productKey: `synthetic-staffing-${randomUUID().slice(0, 8)}`,
          displayName: "Synthetic public web", state: "actual", usageDescription: text,
          observedAt: new Date(Date.now() - 10_000).toISOString() },
        qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 2,
          reliabilityRationale: "Exact synthetic uploaded observation reviewed by a human",
          directnessRationale: "The selected text directly describes delivery staffing",
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

/** Actual scanner/parser, literal mapping and exact human row approval. */
export async function createReviewedStaffingImport(actor: CurrentSession, resourceId: string, skillId: string, reviewDate: string) {
  requireOwnedStaffingClone(); await heartbeatWorkforceWorker();
  const today = new Date().toISOString().slice(0, 10);
  const bytes = Buffer.from(`resource,skill,level,assessment,review,evidence\nexact-resource,exact-skill,3,${today},${reviewDate},PRIVATE_SYNTHETIC_JOURNEY_PERSONNEL_EVIDENCE\n`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "synthetic-staffing-journey.csv", format: "csv",
    byteSize: bytes.length, contentDigest: digest });
  async function* original() { yield bytes; }
  await uploadImportOriginal(actor, intent.importId!, original(), "text/csv");
  const completed = await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: 1 });
  const claim = await claimWorkforceImport();
  if (!claim || claim.sourceId !== intent.sourceId) throw new Error("Journey requires its isolated workforce job at the owned queue head");
  await runWorkforceImport(claim);
  const extraction = await withTransaction(async db => (await db.query("SELECT id,content_digest,complete,scan_clean FROM workforce_extractions WHERE source_version_id=$1",
    [completed.sourceVersionId])).rows[0]);
  if (!extraction?.complete || !extraction.scan_clean) throw new Error("Actual workforce extraction did not establish complete clean journey evidence");
  const mapped = await createImportMapping(actor, intent.importId!, { requestKey: randomUUID(), sourceVersionId: completed.sourceVersionId,
    sourceGeneration: 1, extractionRunId: extraction.id, extractionDigest: extraction.content_digest, csvDateConvention: "ISO",
    tables: [{ sheetIndex: 0, startRow: 1, headerRow: 1, endRow: 2, startColumn: 1, endColumn: 6,
      columns: { resource: 1, skill: 2, level: 3, assessmentDate: 4, nextReviewDate: 5, evidence: 6 } }],
    resources: [{ value: "exact-resource", resourceId }], skills: [{ value: "exact-skill", skillId }], corrections: [] });
  if (mapped.state !== "mapped") throw new Error("Exact journey import mapping requires correction");
  const candidate = await withTransaction(async db => (await db.query(`SELECT c.id,c.aggregate_version,v.id AS revision_id,v.content_digest,p.locators
    FROM workforce_competencies c JOIN workforce_competency_revisions v ON v.id=c.current_pending_revision_id
    JOIN workforce_competency_payloads p ON p.revision_id=v.id WHERE c.resource_id=$1 AND c.skill_id=$2 AND v.source_version_id=$3`,
    [resourceId, skillId, completed.sourceVersionId])).rows[0]);
  if (!candidate || candidate.locators.length !== 6 || candidate.locators.some((locator: { cellId?: string }) => !locator.cellId)) {
    throw new Error("Actual workforce candidate did not retain all six exact cell identities");
  }
  const accepted = await decideCompetencies(actor, { requestKey: randomUUID(), rows: [{ competencyId: candidate.id, candidateRevisionId: candidate.revision_id,
    candidateDigest: candidate.content_digest, expectedAggregateVersion: Number(candidate.aggregate_version), sourceGeneration: 1,
    action: "accept", rationale: "Human review of exact literal imported cells and explicit resource/skill identities" }] });
  return { sourceId: intent.sourceId!, sourceVersionId: completed.sourceVersionId!, extractionId: extraction.id as string,
    mappingId: mapped.revisionId!, competencyId: candidate.id as string, competencyRevisionId: candidate.revision_id as string, decision: accepted.rows![0], locators: candidate.locators };
}


/** Actual reviewed source-bound baseline and workforce inputs shared by domain
 * and browser journeys. Human domain commands run here; staffing commitment
 * and scenario actions remain with each test. No accepted rows are seeded. */
export async function createReviewedStaffingJourneyInputs(options: { artifactText?: string } = {}) {
  requireOwnedStaffingClone();
    const customerId = PLAN_FIXTURE_SCOPE.customerId;
    const actors = await withTransaction(async db => ({ author: await createProfileTestSession(db, "panel"),
      reviewer: await createProfileTestSession(db, "mcteer"), partner: await createProfileTestSession(db, "partner") }));
    const workloadId = await withTransaction(db => createReviewedPlanWorkload(db, actors.author, actors.reviewer, customerId));
    const artifact = await createReviewedStaffingArtifact(actors.author, actors.reviewer, customerId, workloadId, options.artifactText);
    const practice = await withTransaction(db => createPublishedPlanPractice(db, actors.author, actors.reviewer, actors.reviewer.workspaceId));
    // Exercise actual governed lexical retrieval without a paid embedding call.
    const key = process.env.AI_GATEWAY_API_KEY;
    let retrieval: Awaited<ReturnType<typeof searchEvidence>>;
    try { delete process.env.AI_GATEWAY_API_KEY;
      retrieval = await searchEvidence(actors.author, { scope: "customer", customerId, workloadId,
        query: "synthetic public web workload reviewed application delivery lead", use: "discovery", limit: 10 }, { audience: "delivery", workloadId });
    } finally { if (key === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = key; }
    const retrieved = retrieval.results.find(row => row.sourceRevisionId === artifact.profileRevisionId);
    if (!retrieved) throw new Error("Actual reviewed artifact was absent from governed retrieval");
    const header = await withTransaction(async db => (await db.query(`SELECT source_generation,content_digest FROM retrieval_sources
      WHERE source_kind='accepted_profile' AND source_revision_id=$1 AND lifecycle_state='current' AND audience='delivery'`, [artifact.profileRevisionId])).rows[0]);
    if (!header) throw new Error("Actual reviewed artifact has no current delivery retrieval header");
    const content = syntheticPlanContent() as PlanDraftContent;
    // Keep the authored as-of safely behind the database clock; host and
    // container clocks can differ by a few milliseconds at insert time.
    content.asOf = new Date(Date.now() - 10_000).toISOString(); content.title = "Synthetic actual staffing trusted-context journey";
    const reference = { id: randomUUID(), kind: "accepted_profile" as const, sourceRevisionId: artifact.profileRevisionId,
      generation: Number(header.source_generation), contentDigest: header.content_digest as string, locator: retrieved.locators[0], citationId: retrieved.citationId };
    // Shared practice publication is exercised above, but its public quality
    // intentionally has unknown freshness. Keep the active staffing baseline
    // bound to the separately reviewed, dated customer observation.
    content.sourceDependencies = [reference];
    content.assertions = [{ key: "reviewed_delivery_role", kind: "accepted_fact", text: artifact.text,
      sourceDependencyIds: [reference.id], decisionCritical: false }];
    const accepted = await withTransaction(async db => {
      const created = await submitPlanCommand(actors.author, { action: "create", requestKey: randomUUID(), workspaceId: actors.author.workspaceId,
        customerId, workloadId, audience: "delivery", ownerMembershipId: actors.author.membershipId, content }, db);
      const submitted = await submitPlanCommand(actors.author, { action: "submit", requestKey: randomUUID(), planId: created.planId,
        ...staffingExact(created) }, db);
      const preview = await createPlanReviewPreview(actors.reviewer, created.planId, { requestKey: randomUUID(), revisionId: created.revisionId,
        contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion }, db);
      const decision = await decidePlan(actors.reviewer, created.planId, { action: "accept", requestKey: randomUUID(), revisionId: created.revisionId,
        contentDigest: created.contentDigest, expectedAggregateVersion: submitted.aggregateVersion, reviewPreviewId: preview.previewId,
        rationale: "Actual reviewed artifact and shared practice checked for this workload", deliverySuitabilityConfirmed: true }, db);
      return { ...decision, planId: created.planId, planRevisionId: created.revisionId, baselineDigest: created.contentDigest };
    });
    const profile = { ...syntheticResource("Synthetic reviewed journey delivery resource"), timezone: "UTC" };
    const resource = await createResource(actors.reviewer, { requestKey: randomUUID(), rationale: "Synthetic explicit resource identity", resource: profile });
    const skill = await createSkill(actors.reviewer, { requestKey: randomUUID(), rationale: "Synthetic explicit taxonomy", skill: syntheticSkill() });
    const serviceDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), end = new Date(Date.parse(serviceDate) + 86_400_000).toISOString().slice(0, 10);
    const workforce = await createReviewedStaffingImport(actors.reviewer, resource.resourceId!, skill.skillId!, end);
    await approveCalendar(actors.reviewer, resource.resourceId, { requestKey: randomUUID(), rationale: "Human approved exact future working calendar",
      calendar: { timezone: "UTC", observedAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        fromDate: serviceDate, toDate: serviceDate, days: [{ date: serviceDate, contracted: [{ date: serviceDate,
          from: `${serviceDate}T09:00`, to: `${serviceDate}T17:00`, fromOffset: null, toOffset: null }], holidays: [], leave: [], protected: [] }] } });
    return { actors, customerId, workloadId, artifact, practice, content, accepted, profile, resource, skill, serviceDate, end, workforce };
}
