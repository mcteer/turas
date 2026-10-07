import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { saveSupportProposal } from "../../lib/server/support/service";
import { createSupportReviewPreview, decideSupportRevision } from "../../lib/server/support/review";
import { readSupportReadiness, readSupportHistory, readSupportWorkspace } from "../../lib/server/support/projection";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { supportReceiptKeyHashes } from "../../lib/server/support/commands";

describe("support exact readiness review", () => {
  let panel: CurrentSession, reviewer: CurrentSession, partner: CurrentSession;
  beforeAll(async () => {
    ({ panel, reviewer, partner } = await withSupportDatabase(async db => ({ panel: await createProfileTestSession(db, "panel"),
      reviewer: await createProfileTestSession(db, "mcteer"), partner: await createProfileTestSession(db, "partner") })));
  });
  async function draft() {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic readiness review',true)", [customerId, DEMO_IDS.workspace]));
    const input = { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
      workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [], content: unknownSupportAssessment() };
    return { customerId, input, receipt: await saveSupportProposal(panel, customerId, input) };
  }
  it("accepts the exact unknown assessment once without approving customer facts", async () => {
    const f = await draft(), preview = await createSupportReviewPreview(reviewer, f.customerId,
      { workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId });
    const input = { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(), workloadId: null,
      recordId: f.receipt.recordId, revisionId: f.receipt.revisionId, expectedVersion: preview.expectedVersion,
      sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Six explicit unknowns; verify operating ownership" };
    const [accepted, simultaneousReplay] = await Promise.all([
      decideSupportRevision(reviewer, f.customerId, input), decideSupportRevision(reviewer, f.customerId, input) ]);
    expect(simultaneousReplay).toEqual(accepted);
    expect(accepted.outcome).toBe("accepted");
    expect(await decideSupportRevision(reviewer, f.customerId, input)).toEqual(accepted);
    await withSupportDatabase(async db => {
      expect((await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [accepted.recordId])).rows[0].accepted_revision_id).toBe(accepted.revisionId);
      expect(Number((await db.query("SELECT count(*) AS count FROM support_review_decisions WHERE record_id=$1", [accepted.recordId])).rows[0].count)).toBe(1);
      expect(Number((await db.query("SELECT count(*) AS count FROM profile_records WHERE customer_id=$1", [f.customerId])).rows[0].count)).toBe(0);
    });
  }, 30_000);
  it("does not admit a review using an expired command key", async () => {
    const f = await draft(), preview = await createSupportReviewPreview(reviewer, f.customerId,
      { workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId });
    const requestKey = randomUUID();
    const hash = supportReceiptKeyHashes(process.env.TURAS_ENVIRONMENT_ID!, reviewer.workspaceId, reviewer.membershipId, requestKey)[0];
    await withSupportDatabase(db => db.query("INSERT INTO support_expired_command_keys(key_hash) VALUES($1)", [hash]));
    await expect(decideSupportRevision(reviewer, f.customerId, { contractVersion: "support-v1", operation: "review_revision",
      requestKey, workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId,
      expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Expired review probe" }))
      .rejects.toMatchObject({ status: 409, code: "expired_receipt" });
    await withSupportDatabase(async db => {
      expect(Number((await db.query("SELECT count(*) AS count FROM support_review_decisions WHERE record_id=$1", [f.receipt.recordId])).rows[0].count)).toBe(0);
      expect((await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [f.receipt.recordId])).rows[0].accepted_revision_id).toBeNull();
    });
  }, 30_000);
  it("denies panel review even when they authored the assessment", async () => {
    const f = await draft();
    await expect(createSupportReviewPreview(panel, f.customerId, { workloadId: null, recordId: f.receipt.recordId,
      revisionId: f.receipt.revisionId })).rejects.toMatchObject({ status: 403 });
  });
  it("returns an empty no-engagement scope without initializing it", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic empty support',true)", [customerId, DEMO_IDS.workspace]));
    expect((await readSupportReadiness(panel, customerId, null, "delivery")).effectiveReadiness).toBe("not_assessed");
    await withSupportDatabase(async db => expect(Number((await db.query("SELECT count(*) AS count FROM support_scopes WHERE customer_id=$1", [customerId])).rows[0].count)).toBe(0));
  });
  it("denies a nonexistent workload even when the customer has no support scope", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic workload boundary',true)", [customerId, panel.workspaceId]));
    await expect(readSupportWorkspace(panel, customerId, randomUUID(), "internal", { limit: 20 })).rejects.toMatchObject({ status: 404 });
    await withSupportDatabase(async db => {
      expect(Number((await db.query("SELECT count(*) AS count FROM support_scopes WHERE customer_id=$1", [customerId])).rows[0].count)).toBe(0);
    });
  });
  it("returns complete empty-scope metadata without exposing owner choices to a partner", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(async db => {
      await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic metadata projection',true)", [customerId, DEMO_IDS.workspace]);
      await db.query(`INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by)
        VALUES($1,$2,$3,$4,'active',1,$5)`, [randomUUID(), partner.membershipId, partner.workspaceId, customerId, reviewer.principalId]);
    });
    const internal = await readSupportWorkspace(panel, customerId, null, "internal", { limit: 20 });
    expect(internal.metadata.customer).toEqual({ id: customerId, displayName: "Synthetic metadata projection", synthetic: true });
    expect(internal.metadata.workloads).toEqual([]);
    expect(internal.metadata.engagements).toEqual([]);
    expect(internal.metadata.maturity).toEqual([]);
    expect(internal.metadata.owners.map(owner => owner.membershipId)).toContain(reviewer.membershipId);
    const delivery = await readSupportWorkspace(partner, customerId, null, "delivery", { limit: 20 });
    expect(delivery.metadata.customer).toEqual(internal.metadata.customer);
    expect(delivery.metadata.owners).toEqual([]);
    expect(delivery.metadata.ownerSelectionIncomplete).toBe(false);
    expect(delivery.actions).toEqual([]);
    await withSupportDatabase(async db => {
      expect(Number((await db.query("SELECT count(*) AS count FROM support_scopes WHERE customer_id=$1", [customerId])).rows[0].count)).toBe(0);
    });
  }, 30_000);
  it("hides pending delivery guidance from an assigned partner", async () => {
    const f = await draft();
    await withSupportDatabase(db => db.query(`INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by)
      VALUES($1,$2,$3,$4,'active',1,$5)`, [randomUUID(), partner.membershipId, partner.workspaceId, f.customerId, reviewer.principalId]));
    const partnerView = await readSupportReadiness(partner, f.customerId, null, "delivery");
    expect(partnerView.scope).toBeNull();
    expect(partnerView.proposal).toBeNull();
    expect((await readSupportReadiness(panel, f.customerId, null, "delivery")).proposal?.revisionId).toBe(f.receipt.revisionId);
  }, 30_000);
  it("rejects an expired preview without a partial decision", async () => {
    const f = await draft(), preview = await createSupportReviewPreview(reviewer, f.customerId,
      { workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId });
    await withSupportDatabase(db => db.query("UPDATE support_review_previews SET expires_at=now()-interval '1 second' WHERE preview_digest=$1", [preview.sourceDigest]));
    await expect(decideSupportRevision(reviewer, f.customerId, { contractVersion: "support-v1", operation: "review_revision",
      requestKey: randomUUID(), workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId,
      expectedVersion: 1, sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Expired decision" })).rejects.toMatchObject({ status: 409 });
    await withSupportDatabase(async db => expect((await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [f.receipt.recordId])).rows[0].accepted_revision_id).toBeNull());
  }, 30_000);
  it("permits accepted history but never exposes later partner-visible drafts", async () => {
    const f = await draft();
    await withSupportDatabase(db => db.query(`INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by)
      VALUES($1,$2,$3,$4,'active',1,$5)`, [randomUUID(), partner.membershipId, partner.workspaceId, f.customerId, reviewer.principalId]));
    const preview = await createSupportReviewPreview(reviewer, f.customerId,
      { workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId });
    await decideSupportRevision(reviewer, f.customerId, { contractVersion: "support-v1", operation: "review_revision",
      requestKey: randomUUID(), workloadId: null, recordId: f.receipt.recordId, revisionId: f.receipt.revisionId,
      expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Retain explicit unknowns" });
    await saveSupportProposal(panel, f.customerId, { ...f.input, requestKey: randomUUID(), recordId: f.receipt.recordId,
      expectedVersion: 2, content: { ...f.input.content, title: "Private pending change" } });
    const history = await readSupportHistory(partner, f.customerId, null, "delivery", f.receipt.recordId);
    expect(history.revisions.map(row => row.revisionId)).toEqual([f.receipt.revisionId]);
    expect(JSON.stringify(history)).not.toContain("Private pending change");
    await expect(readSupportHistory(partner, f.customerId, null, "internal", f.receipt.recordId)).rejects.toMatchObject({ status: 404 });
  }, 30_000);
});
