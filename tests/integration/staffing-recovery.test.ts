import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { closeRuntimePool, query, withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { createImportIntent, uploadImportOriginal, completeImport } from "../../lib/server/staffing/imports";
import { claimWorkforceImport, heartbeatWorkforceImport, failWorkforceImport } from "../../lib/server/staffing/jobs";
import { retireImport, withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { heartbeatWorkforceWorker } from "../../lib/server/staffing/worker-readiness";
import { runWorkforceCleanupTick } from "../../lib/server/staffing/cleanup";
import { WorkforceStore } from "../../lib/server/staffing/store";
import { resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { createResource } from "../../lib/server/staffing/resources";
import { createSkill } from "../../lib/server/staffing/skills";
import { createManualAssessment, correctAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { readResource, readCompetencyHistory } from "../../lib/server/staffing/read";
import { syntheticResource, syntheticSkill } from "../fixtures/staffing/seed";

async function original() {
  requireOwnedStaffingClone(); await resetStaffingFixtureRates(); await heartbeatWorkforceWorker();
  const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
  const bytes = Buffer.from("resource,skill,level,assessment,review,evidence\nsynthetic,web,2,2026-10-01,2026-10-03,SYNTHETIC_RECOVERY_PRIVATE_EVIDENCE\n");
  const contentDigest = createHash("sha256").update(bytes).digest("hex");
  const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "synthetic-recovery.csv", format: "csv", byteSize: bytes.length, contentDigest });
  async function* stream() { yield bytes; }
  await uploadImportOriginal(actor, intent.importId!, stream(), "text/csv");
  const completed = await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest, sourceGeneration: 1 });
  return { actor, bytes, intent, completed };
}

describe("owned workforce recovery and delayed cleanup", () => {
  it("reclaims an expired partial import after DB reconnection, denies old lease writes and preserves disable cancellation", async () => {
    const f = await original(), first = await claimWorkforceImport();
    if (!first || first.sourceId !== f.intent.sourceId) throw new Error("Owned recovery import must be at its isolated queue head");
    expect(await heartbeatWorkforceImport(first)).toBe(true);
    expect((await query("SELECT count(*)::int AS n FROM workforce_extractions WHERE source_version_id=$1", [f.completed.sourceVersionId])).rows[0].n).toBe(0);
    // Move only the mutable lease clock to exercise a real lost-worker reclaim.
    await query("UPDATE workforce_import_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND lease_token=$2", [first.jobId, first.leaseToken]);
    await closeRuntimePool();
    const second = await claimWorkforceImport();
    if (!second) throw new Error("Expired owned import lease was not reclaimed");
    expect(second.jobId).toBe(first.jobId); expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await heartbeatWorkforceImport(first)).toBe(false);
    await failWorkforceImport(first, "parser_timeout", true);
    expect((await query("SELECT state,lease_token FROM workforce_import_jobs WHERE id=$1", [second.jobId])).rows[0]).toMatchObject({ state: "running", lease_token: second.leaseToken });
    const previous = process.env.TURAS_007_DISABLED;
    try {
      process.env.TURAS_007_DISABLED = "1"; expect(await claimWorkforceImport()).toBeNull();
      await retireImport(f.actor, f.intent.importId, { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Human stops partial import while feature is disabled" }, "cancel");
    } finally { if (previous === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = previous; }
    expect(await heartbeatWorkforceImport(second)).toBe(false);
    expect((await query("SELECT state,lease_token FROM workforce_import_jobs WHERE id=$1", [first.jobId])).rows[0]).toMatchObject({ state: "cancelled", lease_token: null });
  }, 120_000);

  it("cleanup of a withdrawn original leaves a newer independently owned source intact and is idempotent", async () => {
    const old = await original(), current = await original();
    const keys = await query("SELECT id,object_key FROM workforce_source_versions WHERE id=ANY($1::uuid[])", [[old.completed.sourceVersionId, current.completed.sourceVersionId]]);
    const oldKey = keys.rows.find(row => row.id === old.completed.sourceVersionId)?.object_key as string;
    const currentKey = keys.rows.find(row => row.id === current.completed.sourceVersionId)?.object_key as string;
    if (!oldKey || !currentKey || oldKey === currentKey) throw new Error("Recovery requires distinct immutable owned originals");
    await retireImport(old.actor, old.intent.importId, { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Human withdraws the exact old source" }, "withdraw");
    await closeRuntimePool(); await runWorkforceCleanupTick();
    const store = new WorkforceStore();
    expect(createHash("sha256").update(await store.read(currentKey)).digest("hex")).toBe(createHash("sha256").update(current.bytes).digest("hex"));
    expect((await query("SELECT state FROM workforce_sources WHERE id=$1", [current.intent.sourceId])).rows[0].state).toBe("quarantined");
    expect((await query("SELECT state FROM workforce_sources WHERE id=$1", [old.intent.sourceId])).rows[0].state).toBe("deleted");
    await runWorkforceCleanupTick();
    expect(createHash("sha256").update(await store.read(currentKey)).digest("hex")).toBe(createHash("sha256").update(current.bytes).digest("hex"));
    await retireImport(current.actor, current.intent.importId, { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Clean up synthetic owned recovery input" }, "withdraw");
  }, 120_000);

  it("delayed cleanup of old evidence preserves a freshly reviewed correction on the same competency", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic recovery resource", resource: { ...syntheticResource(), timezone: "UTC" } });
    const skill = await createSkill(actor, { requestKey: randomUUID(), rationale: "Synthetic recovery taxonomy", skill: syntheticSkill() });
    const today = new Date().toISOString().slice(0, 10), review = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const fields = { resourceId: resource.resourceId!, skillId: skill.skillId!, level: 2, assessmentDate: today, nextReviewDate: review,
      evidence: "SYNTHETIC_OLD_RECOVERY_MANUAL_EVIDENCE" };
    const old = await createManualAssessment(actor, { requestKey: randomUUID(), rationale: "Human observed original exercise", ...fields });
    const accept = async (candidate: typeof old) => decideCompetencies(actor, { requestKey: randomUUID(), rows: [{
      competencyId: candidate.competencyId, candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest,
      sourceGeneration: candidate.generation, expectedAggregateVersion: candidate.aggregateVersion,
      action: "accept", rationale: "Human review of this exact recovery observation" }] });
    await accept(old);
    const head = (await query("SELECT aggregate_version FROM workforce_competencies WHERE id=$1", [old.competencyId])).rows[0];
    const current = await correctAssessment(actor, old.competencyId, { requestKey: randomUUID(), rationale: "Human corrects same competency with fresh evidence",
      revisionId: old.revisionId, contentDigest: old.contentDigest, expectedAggregateVersion: Number(head.aggregate_version),
      ...fields, level: 3, evidence: "SYNTHETIC_CURRENT_RECOVERY_MANUAL_EVIDENCE" });
    expect(current.competencyId).toBe(old.competencyId);
    expect((await query("SELECT current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies WHERE id=$1",
      [old.competencyId])).rows[0]).toMatchObject({ current_accepted_revision_id: old.revisionId, current_pending_revision_id: current.revisionId });
    await accept(current); // Correction must not inherit original approval.
    const original = (await query("SELECT manual_evidence_id,source_generation FROM workforce_competency_revisions WHERE id=$1", [old.revisionId])).rows[0];
    const replacement = (await query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [current.revisionId])).rows[0];
    expect(replacement.manual_evidence_id).not.toBe(original.manual_evidence_id);
    await withdrawManualEvidence(actor, original.manual_evidence_id, { requestKey: randomUUID(), sourceGeneration: Number(original.source_generation),
      rationale: "Human withdraws the old evidence after exact replacement approval" });
    await closeRuntimePool();
    for (let tick = 0; tick < 2; tick++) {
      await runWorkforceCleanupTick();
      const detail = await readResource(actor, resource.resourceId);
      expect(detail.skills).toHaveLength(1);
      expect(detail.skills[0]).toMatchObject({ skillId: skill.skillId, level: 3 });
      const history = await readCompetencyHistory(actor, old.competencyId);
      expect(history.items.find(row => row.revisionId === old.revisionId)).toMatchObject({ withheld: true, warning: "source_withheld" });
      expect(history.items.find(row => row.revisionId === current.revisionId)).toMatchObject({ withheld: false, level: 3,
        evidence: "SYNTHETIC_CURRENT_RECOVERY_MANUAL_EVIDENCE", state: "accepted" });
      expect((await query("SELECT revision_id FROM workforce_competency_payloads WHERE revision_id=ANY($1::uuid[])",
        [[old.revisionId, current.revisionId]])).rows).toEqual([{ revision_id: current.revisionId }]);
    }
  }, 120_000);
});
