import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { createResource } from "../../lib/server/staffing/resources";
import { createSkill } from "../../lib/server/staffing/skills";
import { createManualAssessment, correctAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { syntheticResource, syntheticSkill, syntheticManualCompetency } from "../fixtures/staffing/seed";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { readResource } from "../../lib/server/staffing/read";
import { resetStaffingFixtureRates } from "../fixtures/staffing/allocations";

async function fixture(db: Parameters<Parameters<typeof withTransaction>[0]>[0]) {
  const actor = await createProfileTestSession(db, "mcteer");
  const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic registry", resource: syntheticResource() }, db);
  const skill = await createSkill(actor, { requestKey: randomUUID(), rationale: "Synthetic taxonomy", skill: syntheticSkill() }, db);
  const candidate = await createManualAssessment(actor, { requestKey: randomUUID(), rationale: "Observed exercise",
    ...syntheticManualCompetency(resource.resourceId!, skill.skillId!, "2026-01-01") }, db);
  const row = { competencyId: candidate.competencyId, candidateRevisionId: candidate.revisionId,
    candidateDigest: candidate.contentDigest, sourceGeneration: candidate.generation,
    expectedAggregateVersion: candidate.aggregateVersion, action: "accept", rationale: "Verified exact observation" };
  return { actor, resource, skill, candidate, row };
}
import { createImportIntent, uploadImportOriginal, completeImport } from "../../lib/server/staffing/imports";
import { claimWorkforceImport } from "../../lib/server/staffing/jobs";
import { runWorkforceImport } from "../../lib/server/staffing/runner";
import { createImportMapping } from "../../lib/server/staffing/mapping";
import { retireImport, withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { enqueueExpiredManualEvidence, runWorkforceCleanupTick } from "../../lib/server/staffing/cleanup";
const packageRequire = createRequire(new URL("../../packages/artifact-extractor/package.json", import.meta.url));
const ExcelJS = packageRequire("exceljs") as typeof import("../../packages/artifact-extractor/node_modules/exceljs");

describe("exact accountable competency review", () => {
  it("serializes concurrent exact acceptance into one decision and preserves its original receipt on replay", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(fixture);
    const requests = [0, 1].map(() => ({ requestKey: randomUUID(), rows: [f.row] }));
    const results = await Promise.allSettled(requests.map(request => decideCompetencies(f.actor, request)));
    const winners = results.flatMap((result, index) => result.status === "fulfilled" ? [{ result: result.value, index }] : []);
    const losers = results.filter(result => result.status === "rejected");
    expect(winners).toHaveLength(1); expect(losers).toHaveLength(1);
    expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "version_conflict" });
    expect(await decideCompetencies(f.actor, requests[winners[0].index])).toEqual(winners[0].result);
    await withTransaction(async db => {
      const head = (await db.query("SELECT aggregate_version,current_pending_revision_id,current_accepted_revision_id FROM workforce_competencies WHERE id=$1",
        [f.candidate.competencyId])).rows[0];
      expect(head).toMatchObject({ aggregate_version: "2", current_pending_revision_id: null, current_accepted_revision_id: f.candidate.revisionId });
      expect((await db.query("SELECT id FROM workforce_review_decisions WHERE revision_id=$1", [f.candidate.revisionId])).rowCount).toBe(1);
      const receipts = (await db.query("SELECT request_key FROM workforce_command_receipts WHERE request_key=ANY($1::text[])",
        [requests.map(request => request.requestKey)])).rows;
      expect(receipts).toEqual([{ request_key: requests[winners[0].index].requestKey }]);
    });
  }, 120_000);
  it("serializes acceptance against original manual-source withdrawal without exposing withdrawn evidence", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(fixture);
    const sourceId = await withTransaction(async db => (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1",
      [f.candidate.revisionId])).rows[0].manual_evidence_id as string);
    const review = { requestKey: randomUUID(), rows: [f.row] };
    const withdrawal = { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Synthetic concurrent original-source withdrawal" };
    const [accepted, withdrawn] = await Promise.allSettled([decideCompetencies(f.actor, review), withdrawManualEvidence(f.actor, sourceId, withdrawal)]);
    expect(withdrawn.status).toBe("fulfilled");
    if (accepted.status === "rejected") expect(accepted.reason).toMatchObject({ status: 409, code: "source_changed" });
    const expectedDecisions = accepted.status === "fulfilled" ? 1 : 0;
    await withTransaction(async db => {
      expect((await db.query("SELECT state,generation FROM workforce_manual_evidence WHERE id=$1", [sourceId])).rows[0])
        .toMatchObject({ state: "withdrawn", generation: "2" });
      expect((await db.query("SELECT id FROM workforce_review_decisions WHERE revision_id=$1", [f.candidate.revisionId])).rowCount).toBe(expectedDecisions);
      expect((await db.query("SELECT id FROM workforce_command_receipts WHERE request_key=$1", [review.requestKey])).rowCount).toBe(expectedDecisions);
      const head = (await db.query("SELECT current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies WHERE id=$1",
        [f.candidate.competencyId])).rows[0];
      expect(head.current_accepted_revision_id).toBe(expectedDecisions ? f.candidate.revisionId : null);
      expect(head.current_pending_revision_id).toBe(expectedDecisions ? null : f.candidate.revisionId);
    });
    expect((await readResource(f.actor, f.resource.resourceId)).skills).toEqual([]);
  }, 120_000);
  it("serializes acceptance against correction without approving the replacement or leaving a losing write", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(fixture);
    const sourceCountBefore = await withTransaction(async db => Number((await db.query("SELECT count(*) AS n FROM workforce_manual_evidence")).rows[0].n));
    const review = { requestKey: randomUUID(), rows: [f.row] };
    const correction = { requestKey: randomUUID(), rationale: "Synthetic concurrent correction requiring its own approval",
      revisionId: f.candidate.revisionId, contentDigest: f.candidate.contentDigest, expectedAggregateVersion: f.candidate.aggregateVersion,
      ...syntheticManualCompetency(f.resource.resourceId!, f.skill.skillId!, "2026-02-01"), level: 3 };
    const [accepted, corrected] = await Promise.allSettled([decideCompetencies(f.actor, review),
      correctAssessment(f.actor, f.candidate.competencyId, correction)]);
    expect([accepted, corrected].filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const result of [accepted, corrected]) if (result.status === "rejected")
      expect(result.reason).toMatchObject({ status: 409, code: "version_conflict" });
    await withTransaction(async db => {
      const head = (await db.query("SELECT aggregate_version,current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies WHERE id=$1",
        [f.candidate.competencyId])).rows[0];
      expect(head.aggregate_version).toBe("2");
      expect(head.current_accepted_revision_id).toBe(accepted.status === "fulfilled" ? f.candidate.revisionId : null);
      expect(head.current_pending_revision_id).toBe(corrected.status === "fulfilled" ? corrected.value.revisionId : null);
      expect((await db.query("SELECT id FROM workforce_competency_revisions WHERE competency_id=$1", [f.candidate.competencyId])).rowCount)
        .toBe(corrected.status === "fulfilled" ? 2 : 1);
      expect((await db.query("SELECT id FROM workforce_review_decisions WHERE competency_id=$1", [f.candidate.competencyId])).rowCount)
        .toBe(accepted.status === "fulfilled" ? 1 : 0);
      expect(Number((await db.query("SELECT count(*) AS n FROM workforce_manual_evidence")).rows[0].n))
        .toBe(sourceCountBefore + (corrected.status === "fulfilled" ? 1 : 0));
      const receipts = (await db.query("SELECT request_key FROM workforce_command_receipts WHERE request_key=ANY($1::text[])",
        [[review.requestKey, correction.requestKey]])).rows;
      expect(receipts).toEqual([{ request_key: accepted.status === "fulfilled" ? review.requestKey : correction.requestKey }]);
    });
  }, 120_000);
  it("refuses a first accepted competency committed after head discovery and before the resource lock", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer");
      const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic first-head race", resource: { ...syntheticResource(), timezone: "UTC" } }, db);
      const skill = await createSkill(actor, { requestKey: randomUUID(), rationale: "Synthetic first-head taxonomy", skill: syntheticSkill() }, db);
      return { actor, resource, skill };
    });
    let interleaved = false, payloadReadsBeforeRefusal = 0;
    await expect(withTransaction(async db => {
      // Real two-transaction interleave. This proxy pauses only at the named
      // metadata boundary; all SQL, source/approval writes and commits are real.
      const observing = new Proxy(db, { get(target, property, receiver) {
        if (property !== "query") return Reflect.get(target, property, receiver);
        return async (...args: unknown[]) => {
          const sql = typeof args[0] === "string" ? args[0] : "";
          if (sql.includes("workforce_resource_payloads") || sql.includes("workforce_competency_payloads")) payloadReadsBeforeRefusal++;
          const result = await Reflect.apply(target.query, target, args);
          if (!interleaved && sql.includes("current_accepted_revision_id,current_pending_revision_id FROM workforce_competencies") && sql.includes("FOR SHARE")) {
            interleaved = true;
            await withTransaction(async writer => {
              const date = new Date().toISOString().slice(0, 10);
              const candidate = await createManualAssessment(f.actor, { requestKey: randomUUID(), rationale: "Synthetic committed phantom",
                ...syntheticManualCompetency(f.resource.resourceId!, f.skill.skillId!, date) }, writer);
              await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [{ competencyId: candidate.competencyId,
                candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest, sourceGeneration: candidate.generation,
                expectedAggregateVersion: candidate.aggregateVersion, action: "accept", rationale: "Synthetic exact concurrent approval" }] }, writer);
            });
          }
          return result;
        };
      } });
      await readResource(f.actor, f.resource.resourceId, observing);
    })).rejects.toMatchObject({ status: 409, code: "source_changed" });
    expect(interleaved).toBe(true);
    expect(payloadReadsBeforeRefusal).toBe(0);
    const fresh = await readResource(f.actor, f.resource.resourceId);
    expect(fresh.skills).toHaveLength(1);
    expect(fresh.skills[0].skillId).toBe(f.skill.skillId);
  }, 120_000);
  it("keeps manual assessments pending and old observation dates unchanged after approval", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT competency_fixture");
      try {
        const f = await fixture(db);
        expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.candidate.competencyId])).rows[0].current_accepted_revision_id).toBeNull();
        const request = { requestKey: randomUUID(), rows: [f.row] };
        const first = await decideCompetencies(f.actor, request, db);
        expect(await decideCompetencies(f.actor, request, db)).toEqual(first);
        expect((await db.query("SELECT assessment_date::text FROM workforce_competency_revisions WHERE id=$1", [f.candidate.revisionId])).rows[0].assessment_date).toBe("2026-01-01");
        expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.candidate.competencyId])).rows[0].current_accepted_revision_id).toBe(f.candidate.revisionId);
      } finally { await db.query("ROLLBACK TO SAVEPOINT competency_fixture"); }
    });
  });
  it("rolls back an entire review batch when any exact digest is stale", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT competency_fixture");
      try {
        const one = await fixture(db), two = await fixture(db);
        await expect(decideCompetencies(one.actor, { requestKey: randomUUID(), rows: [one.row,
          { ...two.row, candidateDigest: "f".repeat(64) }] }, db)).rejects.toMatchObject({ status: 409 });
        expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=ANY($1::uuid[])",
          [[one.candidate.competencyId, two.candidate.competencyId]])).rows.every(r => r.current_accepted_revision_id === null)).toBe(true);
        expect((await db.query("SELECT id FROM workforce_review_decisions WHERE competency_id=ANY($1::uuid[])",
          [[one.candidate.competencyId, two.candidate.competencyId]])).rowCount).toBe(0);
      } finally { await db.query("ROLLBACK TO SAVEPOINT competency_fixture"); }
    });
  });
  it("preserves accepted history through pending correction and exact supersession", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT competency_fixture");
      try {
        const f = await fixture(db);
        const accepted = await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [f.row] }, db);
        const corrected = await correctAssessment(f.actor, f.candidate.competencyId, {
          requestKey: randomUUID(), rationale: "Corrected observed result", revisionId: f.candidate.revisionId,
          contentDigest: f.candidate.contentDigest, expectedAggregateVersion: accepted.rows![0].aggregateVersion,
          ...syntheticManualCompetency(f.resource.resourceId!, f.skill.skillId!, "2026-02-01"), level: 3 }, db);
        expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.candidate.competencyId])).rows[0].current_accepted_revision_id).toBe(f.candidate.revisionId);
        await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [{ ...f.row,
          candidateRevisionId: corrected.revisionId, candidateDigest: corrected.contentDigest,
          sourceGeneration: corrected.generation, expectedAggregateVersion: corrected.aggregateVersion }] }, db);
        expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.candidate.competencyId])).rows[0].current_accepted_revision_id).toBe(corrected.revisionId);
        expect((await db.query("SELECT id FROM workforce_competency_revisions WHERE competency_id=$1", [f.candidate.competencyId])).rowCount).toBe(2);
      } finally { await db.query("ROLLBACK TO SAVEPOINT competency_fixture"); }
    });
  });  it("reviews a real two-sheet import only after literal and identity correction, retaining exact cell lineage", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const one = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic first identity", resource: syntheticResource("Same synthetic name") });
    const two = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic second identity", resource: syntheticResource("Same synthetic name") });
    const skill = await createSkill(actor, { requestKey: randomUUID(), rationale: "Synthetic skill", skill: syntheticSkill() });
    const workbook = new ExcelJS.Workbook(); workbook.properties.date1904 = true;
    for (const [index, name] of ["Roster", "Hidden duplicate"].entries()) {
      const sheet = workbook.addWorksheet(name); if (index) sheet.state = "hidden";
      sheet.addRow(["resource", "skill", "level", "assessment", "review", "evidence"]);
      sheet.addRow(["same name", "web", index ? 2 : { formula: "1+1", result: 2 },
        new Date("2026-09-29T00:00:00Z"), new Date("2026-12-28T00:00:00Z"), "PRIVATE_SYNTHETIC_OBSERVATION"]);
    }
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer()), digest = createHash("sha256").update(bytes).digest("hex");
    const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "synthetic.xlsx", format: "xlsx",
      byteSize: bytes.length, contentDigest: digest });
    async function* body() { yield bytes; }
    await uploadImportOriginal(actor, intent.importId!, body());
    const completed = await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: 1 });
    const claim = await claimWorkforceImport(); expect(claim?.sourceId).toBe(intent.sourceId); await runWorkforceImport(claim!);
    const extraction = await withTransaction(async db => (await db.query("SELECT id,content_digest,complete FROM workforce_extractions WHERE source_version_id=$1", [completed.sourceVersionId])).rows[0]);
    expect(extraction?.complete).toBe(true);
    const tables = [0, 1].map(sheetIndex => ({ sheetIndex, startRow: 1, headerRow: 1, endRow: 2, startColumn: 1, endColumn: 6,
      columns: { resource: 1, skill: 2, level: 3, assessmentDate: 4, nextReviewDate: 5, evidence: 6 } }));
    const mapping = { requestKey: randomUUID(), sourceVersionId: completed.sourceVersionId, sourceGeneration: 1,
      extractionRunId: extraction.id, extractionDigest: extraction.content_digest, csvDateConvention: "ISO", tables,
      resources: [{ value: "same name", resourceId: one.resourceId }], skills: [{ value: "web", skillId: skill.skillId }], corrections: [] };
    const unresolved = await createImportMapping(actor, intent.importId!, mapping);
    expect(unresolved.state).toBe("needs_correction"); expect(unresolved.warnings).toContain("formula_literal_required");
    const fixed = { ...mapping, requestKey: randomUUID(), corrections: [{ sheetIndex: 0, rowNumber: 2, level: 2 },
      { sheetIndex: 1, rowNumber: 2, resourceId: two.resourceId }] };
    const mapped = await createImportMapping(actor, intent.importId!, fixed); expect(mapped.state).toBe("mapped");
    const candidates = await withTransaction(async db => (await db.query(`SELECT c.id AS competency_id,c.aggregate_version,
      r.id AS revision_id,r.content_digest,r.source_generation,p.locators FROM workforce_competencies c
      JOIN workforce_competency_revisions r ON r.id=c.current_pending_revision_id
      JOIN workforce_competency_payloads p ON p.revision_id=r.id WHERE r.source_version_id=$1`, [completed.sourceVersionId])).rows);
    expect(candidates).toHaveLength(2);
    expect(candidates.every(c => c.locators.length === 6 && c.locators.every((l: {cellId?: string}) => Boolean(l.cellId)))).toBe(true);
    const rows = candidates.map(c => ({ competencyId: c.competency_id, candidateRevisionId: c.revision_id,
      candidateDigest: c.content_digest, sourceGeneration: 1, expectedAggregateVersion: Number(c.aggregate_version),
      action: "accept", rationale: "Verified original cells and explicit literals" }));
    const accepted = await decideCompetencies(actor, { requestKey: randomUUID(), rows }); expect(accepted.rows).toHaveLength(2);
    await retireImport(actor, intent.importId!, { requestKey: randomUUID(), sourceGeneration: 1, rationale: "Withdraw imported observations" }, "withdraw");
    await expect(decideCompetencies(actor, { requestKey: randomUUID(), rows })).rejects.toMatchObject({ status: 409 });
    await runWorkforceCleanupTick();
    expect((await withTransaction(db => db.query(`SELECT p.revision_id FROM workforce_competency_payloads p
      JOIN workforce_competency_revisions r ON r.id=p.revision_id WHERE r.source_version_id=$1`, [completed.sourceVersionId]))).rowCount).toBe(0);
    expect((await withTransaction(db => db.query("SELECT id FROM workforce_review_decisions WHERE revision_id=ANY($1::uuid[])", [candidates.map(c => c.revision_id)]))).rowCount).toBe(2);
  }, 120_000);

  it("expires pending manual prose after thirty days while retaining accepted evidence", async () => {
    requireOwnedStaffingClone();
    const sources = await withTransaction(async db => {
      const pending = await fixture(db), accepted = await fixture(db);
      await decideCompetencies(accepted.actor, { requestKey: randomUUID(), rows: [accepted.row] }, db);
      const records = (await db.query(`SELECT id,manual_evidence_id FROM workforce_competency_revisions WHERE id=ANY($1::uuid[])`,
        [[pending.candidate.revisionId, accepted.candidate.revisionId]])).rows;
      const pendingSource = records.find(r => r.id === pending.candidate.revisionId)!.manual_evidence_id;
      const acceptedSource = records.find(r => r.id === accepted.candidate.revisionId)!.manual_evidence_id;
      await db.query("UPDATE workforce_manual_evidence SET created_at=now()-interval '31 days' WHERE id=ANY($1::uuid[])", [[pendingSource, acceptedSource]]);
      await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=ANY($1::uuid[])", [[pending.actor.sessionId, accepted.actor.sessionId]]);
      return { pendingSource, acceptedSource, pendingRevision: pending.candidate.revisionId, acceptedRevision: accepted.candidate.revisionId };
    });
    await enqueueExpiredManualEvidence();
    await withTransaction(async db => {
      const headers = (await db.query("SELECT id,state,generation FROM workforce_manual_evidence WHERE id=ANY($1::uuid[])",
        [[sources.pendingSource, sources.acceptedSource]])).rows;
      expect(headers.find(h => h.id === sources.pendingSource)).toMatchObject({ state: "withdrawn", generation: "2" });
      expect(headers.find(h => h.id === sources.acceptedSource)).toMatchObject({ state: "active", generation: "1" });
    });
    await runWorkforceCleanupTick();
    await withTransaction(async db => {
      expect((await db.query("SELECT revision_id FROM workforce_competency_payloads WHERE revision_id=$1", [sources.pendingRevision])).rowCount).toBe(0);
      expect((await db.query("SELECT revision_id FROM workforce_competency_payloads WHERE revision_id=$1", [sources.acceptedRevision])).rowCount).toBe(1);
      expect((await db.query("SELECT id FROM workforce_competency_revisions WHERE id=$1", [sources.pendingRevision])).rowCount).toBe(1);
    });
  });

});
