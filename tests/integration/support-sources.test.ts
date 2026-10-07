import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import type { SupportSource } from "../../lib/server/support/schema";
import { lockSupportActor } from "../../lib/server/support/policy";
import { verifySupportSources } from "../../lib/server/support/sources";
import { withTransaction } from "../../lib/server/db/client";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { createReviewedPlanWorkload, createRetrievedPlanEvidence, createPublishedPlanPractice } from "../fixtures/plans/journey";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { saveSupportProposal } from "../../lib/server/support/service";
import { readSupportReadiness } from "../../lib/server/support/projection";
import { createSupportReviewPreview, decideSupportRevision } from "../../lib/server/support/review";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

describe("support original-source eligibility", () => {
  let panel: CurrentSession, reviewer: CurrentSession, workload: string, reference: SupportSource;
  beforeAll(async () => {
    ({ panel, reviewer } = await withSupportDatabase(async db => ({
      panel: await createProfileTestSession(db, "panel"), reviewer: await createProfileTestSession(db, "mcteer"),
    })));
    workload = await withTransaction(db => createReviewedPlanWorkload(db, panel, reviewer, DEMO_IDS.sharedCustomer));
    reference = (await createRetrievedPlanEvidence(panel, reviewer, DEMO_IDS.sharedCustomer, workload)).reference;
  }, 60_000);
  async function verify(customerId: string, workloadId: string | null, ref: SupportSource = reference) {
    return withTransaction(async db => {
      await lockSupportActor(db, panel, customerId, "read", "delivery");
      return verifySupportSources(db, panel, customerId, workloadId, "delivery", [], [ref], true);
    });
  }
  it("uses reviewed workload evidence from its workload or customer-wide scope", async () => {
    expect(await verify(DEMO_IDS.sharedCustomer, workload)).toMatch(/^[a-f0-9]{64}$/);
    expect(await verify(DEMO_IDS.sharedCustomer, null)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("never accepts cross-customer evidence or a forged original revision", async () => {
    await expect(verify(DEMO_IDS.deniedCustomer, null)).rejects.toMatchObject({ status: 409 });
    await expect(verify(DEMO_IDS.sharedCustomer, null, { ...reference, sourceRevisionId: randomUUID() })).rejects.toMatchObject({ status: 409 });
  });
  it("requires execution evidence to belong to explicitly selected engagements", async () => {
    await expect(verify(DEMO_IDS.sharedCustomer, null, { kind: "execution_record", id: randomUUID(),
      sourceRevisionId: randomUUID(), generation: 1, contentDigest: "a".repeat(64), engagementId: randomUUID() })).rejects.toMatchObject({ status: 404 });
  });
  it("refuses pending claims and forged source generations", async () => {
    const proposed = await submitProfileCommand(panel, DEMO_IDS.sharedCustomer, {
      action: "propose_record", requestKey: randomUUID(), requestedAudience: "delivery", dataCategory: "delivery_context",
      payload: { kind: "claim", text: "Unreviewed support entitlement", sourceType: "manual" },
    }) as { revisionId: string };
    await expect(verify(DEMO_IDS.sharedCustomer, null, { ...reference, sourceRevisionId: proposed.revisionId })).rejects.toMatchObject({ status: 409 });
    await expect(verify(DEMO_IDS.sharedCustomer, null, { ...reference, generation: reference.generation + 1 })).rejects.toMatchObject({ status: 409 });
  });
  it("accepts published shared guidance without exposing its private source customer", async () => {
    const practice = await withTransaction(db => createPublishedPlanPractice(db, panel, reviewer, panel.workspaceId));
    expect(await verify(DEMO_IDS.sharedCustomer, null, practice.reference)).toMatch(/^[a-f0-9]{64}$/);
  }, 60_000);
  it("withholds accepted support content immediately after original withdrawal", async () => {
    const source = await createRetrievedPlanEvidence(panel, reviewer, DEMO_IDS.sharedCustomer, workload);
    const content = unknownSupportAssessment();
    content.checks[0] = { ...content.checks[0], status: "gap", sourceKeys: [source.reference.id] };
    const saved = await saveSupportProposal(panel, DEMO_IDS.sharedCustomer, {
      contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(), workloadId: workload,
      expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [source.reference], content,
    });
    const insufficientPreview = await createSupportReviewPreview(reviewer, DEMO_IDS.sharedCustomer,
      { workloadId: workload, recordId: saved.recordId, revisionId: saved.revisionId });
    await expect(decideSupportRevision(reviewer, DEMO_IDS.sharedCustomer, { contractVersion: "support-v1", operation: "review_revision",
      requestKey: randomUUID(), workloadId: workload, expectedVersion: insufficientPreview.expectedVersion,
      recordId: saved.recordId, revisionId: saved.revisionId, sourceDigest: insufficientPreview.sourceDigest, decision: "accept", rationale: "Unsupported gap" })).rejects.toMatchObject({ status: 422 });
    content.checks[0] = { ...content.checks[0], status: "unknown" };
    const revised = await saveSupportProposal(panel, DEMO_IDS.sharedCustomer, {
      contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(), workloadId: workload,
      recordId: saved.recordId, expectedVersion: 1, audience: "delivery", selectedEngagementIds: [], sourceRefs: [source.reference], content,
    });
    const preview = await createSupportReviewPreview(reviewer, DEMO_IDS.sharedCustomer,
      { workloadId: workload, recordId: revised.recordId, revisionId: revised.revisionId });
    await decideSupportRevision(reviewer, DEMO_IDS.sharedCustomer, { contractVersion: "support-v1", operation: "review_revision",
      requestKey: randomUUID(), workloadId: workload, expectedVersion: preview.expectedVersion,
      recordId: revised.recordId, revisionId: revised.revisionId, sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Retain explicit unknown" });
    const version = await withSupportDatabase(async db => Number((await db.query(`SELECT r.version FROM profile_records r
      JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1`, [source.reviewedRevisionId])).rows[0].version));
    await submitProfileCommand(reviewer, DEMO_IDS.sharedCustomer, { action: "retract_revision", requestKey: randomUUID(),
      revisionId: source.reviewedRevisionId, expectedRecordVersion: version, rationale: "Synthetic source withdrawn" });
    const view = await readSupportReadiness(panel, DEMO_IDS.sharedCustomer, workload, "delivery");
    expect(view.assessment?.content).toBeNull();
    expect(view.effectiveReadiness).toBe("review_required");
  }, 60_000);
});
