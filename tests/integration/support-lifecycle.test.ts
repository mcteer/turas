import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { createProfileTestSession } from "../fixtures/profiles";
import { withSupportDatabase } from "../fixtures/support/environment";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { saveSupportProposal } from "../../lib/server/support/service";
import { invalidateSupportSource, queueSupportRevisionPurge } from "../../lib/server/support/invalidation";
import { runSupportCleanupTick, minimizeSupportAudit } from "../../lib/server/support/maintenance";
import { requireSupportEnvironment } from "../../lib/server/support/repository";

describe("support lifecycle cleanup boundaries", () => {
  let actor: CurrentSession;
  beforeAll(async () => { actor = await withSupportDatabase(db => createProfileTestSession(db, "panel")); });
  async function draft() {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic retention customer',true)", [customerId, actor.workspaceId]));
    return saveSupportProposal(actor, customerId, { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
      workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [], content: unknownSupportAssessment() });
  }
  it("indexes original-source fanout without exposing or prematurely purging payloads", async () => {
    const saved = await draft(), sourceId = randomUUID();
    await withSupportDatabase(async db => {
      await db.query("INSERT INTO support_private_dependencies(revision_id,source_kind,source_revision_id) VALUES($1,'accepted_profile',$2)", [saved.revisionId, sourceId]);
      expect(await invalidateSupportSource(db, "accepted_profile", sourceId)).toBe(1);
      expect(await invalidateSupportSource(db, "accepted_profile", sourceId)).toBe(1);
      expect((await db.query("SELECT 1 FROM support_invalidations WHERE revision_id=$1", [saved.revisionId])).rowCount).toBe(1);
      const jobs = (await db.query("SELECT due_at,created_at FROM support_cleanup_jobs WHERE revision_id=$1", [saved.revisionId])).rows;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].due_at.getTime() - jobs[0].created_at.getTime()).toBeGreaterThan(23 * 3600000);
    });
    await runSupportCleanupTick();
    await withSupportDatabase(async db => expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [saved.revisionId])).rowCount).toBe(1));
  });
  it("purges an abandoned old revision but never deletes the newer payload or receipt", async () => {
    const saved = await draft(), oldId = randomUUID();
    await withSupportDatabase(async db => {
      await db.query(`INSERT INTO support_revisions(id,record_id,scope_id,author_membership_id,workspace_id,ordinal,
        content_digest,source_state_digest,contract_version,selected_engagement_ids,created_at)
        SELECT $2,record_id,scope_id,author_membership_id,workspace_id,2,content_digest,source_state_digest,
          contract_version,selected_engagement_ids,clock_timestamp()-interval '91 days' FROM support_revisions WHERE id=$1`, [saved.revisionId, oldId]);
      await db.query("INSERT INTO support_payloads(revision_id,content_digest,content) SELECT $2,content_digest,content FROM support_payloads WHERE revision_id=$1", [saved.revisionId, oldId]);
    });
    expect((await runSupportCleanupTick()).purged).toBeGreaterThan(0);
    await withSupportDatabase(async db => {
      expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [oldId])).rowCount).toBe(0);
      expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [saved.revisionId])).rowCount).toBe(1);
      expect((await db.query("SELECT 1 FROM support_command_receipts WHERE id=$1", [saved.id])).rowCount).toBe(1);
    });
    expect((await runSupportCleanupTick()).purged).toBe(0);
  });
  it("advances bounded audit minimization past already-minimized identities", async () => {
    const saved = await draft(), identities = [randomUUID(), randomUUID(), randomUUID()];
    await withSupportDatabase(async db => {
      for (const [index, id] of identities.entries()) {
        await db.query(`INSERT INTO support_review_decisions(id,record_id,revision_id,actor_membership_id,workspace_id,
          decision,source_digest,expected_version,created_at) VALUES($1,$2,$3,$4,$5,'reject',$6,1,
          clock_timestamp()-interval '370 days'+$7*interval '1 hour')`,
        [id, saved.recordId, saved.revisionId, actor.membershipId, actor.workspaceId, "a".repeat(64), index]);
        if (index > 0) await db.query("INSERT INTO support_decision_payloads(decision_id,rationale) VALUES($1,'Synthetic old rationale')", [id]);
      }
    });
    expect(await minimizeSupportAudit(1)).toBe(1);
    expect(await minimizeSupportAudit(1)).toBe(1);
    expect(await minimizeSupportAudit(1)).toBe(0);
    await withSupportDatabase(async db => {
      expect((await db.query("SELECT 1 FROM support_review_decisions WHERE id=ANY($1::uuid[])", [identities])).rowCount).toBe(3);
      expect((await db.query("SELECT 1 FROM support_decision_payloads WHERE decision_id=ANY($1::uuid[])", [identities])).rowCount).toBe(0);
    });
  });
  it("retains a young abandoned draft and purges it only after the 90-day clock", async () => {
    const saved = await draft();
    const youngId = randomUUID(), oldId = randomUUID();
    await withSupportDatabase(async db => {
      for (const [id, ordinal, days] of [[youngId, 2, 89], [oldId, 3, 91]] as const) {
        await db.query(`INSERT INTO support_revisions(id,record_id,scope_id,author_membership_id,workspace_id,ordinal,
          content_digest,source_state_digest,contract_version,selected_engagement_ids,created_at)
          SELECT $2,record_id,scope_id,author_membership_id,workspace_id,$3,content_digest,source_state_digest,
            contract_version,selected_engagement_ids,clock_timestamp()-$4*interval '1 day'
          FROM support_revisions WHERE id=$1`, [saved.revisionId, id, ordinal, days]);
        await db.query("INSERT INTO support_payloads(revision_id,content_digest,content) SELECT $2,content_digest,content FROM support_payloads WHERE revision_id=$1", [saved.revisionId, id]);
      }
    });
    await runSupportCleanupTick();
    await withSupportDatabase(async db => {
      expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [youngId])).rowCount).toBe(1);
      expect((await db.query("SELECT 1 FROM support_invalidations WHERE revision_id=$1", [youngId])).rowCount).toBe(0);
      expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [oldId])).rowCount).toBe(0);
      expect((await db.query("SELECT 1 FROM support_revisions WHERE id=ANY($1::uuid[])", [[youngId, oldId]])).rowCount).toBe(2);
      expect((await db.query("SELECT 1 FROM support_command_receipts WHERE id=$1", [saved.id])).rowCount).toBe(1);
    });
  });
  it("disable mode denies new work without disabling reads and retention", async () => {
    const previous = process.env.TURAS_010_DISABLED;
    process.env.TURAS_010_DISABLED = "1";
    try {
      await expect(draft()).rejects.toMatchObject({ status: 503, code: "feature_disabled" });
      await withSupportDatabase(async db => {
        await expect(requireSupportEnvironment(db)).resolves.toBeUndefined();
        await expect(requireSupportEnvironment(db, false, true)).resolves.toBeUndefined();
        await expect(requireSupportEnvironment(db, true, true)).rejects.toMatchObject({ status: 503, code: "feature_disabled" });
      });
      await expect(runSupportCleanupTick()).resolves.toMatchObject({ claimed: expect.any(Number) });
      await expect(minimizeSupportAudit()).resolves.toEqual(expect.any(Number));
    } finally {
      if (previous === undefined) delete process.env.TURAS_010_DISABLED;
      else process.env.TURAS_010_DISABLED = previous;
    }
  });
  it("shortens an existing purge deadline without replacing its lease or accepting a stale lease", async () => {
    const saved = await draft(), sourceId = randomUUID(), lease = randomUUID();
    let jobId: string;
    await withSupportDatabase(async db => {
      await db.query("INSERT INTO support_private_dependencies(revision_id,source_kind,source_revision_id) VALUES($1,'accepted_profile',$2)", [saved.revisionId, sourceId]);
      await invalidateSupportSource(db, "accepted_profile", sourceId);
      const job = (await db.query("SELECT id FROM support_cleanup_jobs WHERE revision_id=$1", [saved.revisionId])).rows[0];
      jobId = job.id;
      await db.query("UPDATE support_cleanup_jobs SET state='leased',lease_token=$2,lease_until=clock_timestamp()+interval '60 seconds' WHERE id=$1", [jobId, lease]);
      await queueSupportRevisionPurge(db, saved.revisionId!, true);
      const shortened = (await db.query("SELECT state,lease_token,due_at<=clock_timestamp() AS due FROM support_cleanup_jobs WHERE id=$1", [jobId])).rows[0];
      expect(shortened).toEqual({ state: "leased", lease_token: lease, due: true });
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, randomUUID()])).rows[0].purged).toBe(false);
      expect((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [saved.revisionId])).rowCount).toBe(1);
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, lease])).rows[0].purged).toBe(true);
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, lease])).rows[0].purged).toBe(false);
    });
  });
});
