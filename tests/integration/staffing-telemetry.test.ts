import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { syntheticResource, syntheticSkill } from "../fixtures/staffing/seed";
import { createResource } from "../../lib/server/staffing/resources";
import { createSkill } from "../../lib/server/staffing/skills";
import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { createConfirmedAllocationLedgerFixture, resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { readDemand } from "../../lib/server/staffing/demands";
import { readResource } from "../../lib/server/staffing/read";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";
import { createFinanceInput, readFinanceInput } from "../../lib/server/staffing/economics";
const sentinel = "PRIVATE_SYNTHETIC_PERSONNEL_AND_RATIONALE_SENTINEL";
describe("staffing domain telemetry privacy", () => {
  it("excludes entered rates and finance provenance from committed, replayed and denied command logs", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const f = await withTransaction(async db => {
      const actor = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
      const resource = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic telemetry resource", resource: syntheticResource() }, db);
      return { actor, panel, resource };
    });
    const financeSentinel = "PRIVATE_SYNTHETIC_FINANCE_PROVENANCE_AND_RATIONALE", rate = "98765432";
    const request = { requestKey: randomUUID(), rationale: financeSentinel, provenance: financeSentinel,
      input: { kind: "rate", rateKind: "loaded_cost", resourceId: f.resource.resourceId, currency: "USD",
        fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: rate } };
    const events: Record<string, unknown>[] = [], logger = vi.spyOn(console, "info").mockImplementation(value => events.push(JSON.parse(String(value))));
    try {
      const entered = await createFinanceInput(f.actor, request);
      expect(await createFinanceInput(f.actor, request)).toEqual(entered);
      expect(await readFinanceInput(f.actor, entered.entityId)).toMatchObject({ input: { minorUnitsPerHour: rate }, provenance: financeSentinel, rationale: financeSentinel });
      await expect(createFinanceInput(f.panel, { ...request, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
      await expect(readFinanceInput(f.panel, entered.entityId)).rejects.toMatchObject({ status: 403 });
      expect(events.map(event => [event.operation, event.outcome])).toEqual([["finance", "committed"], ["finance", "reused_receipt"], ["finance", "denied"]]);
      const encoded = JSON.stringify(events);
      for (const forbidden of [financeSentinel, rate, request.requestKey, entered.entityId!, f.resource.resourceId!, f.actor.principalId]) expect(encoded).not.toContain(forbidden);
      for (const event of events) expect(Object.keys(event).sort()).toEqual(["durationMs", "kind", "operation", "outcome"]);
    } finally { logger.mockRestore(); }
  });
  it("records a source exclusion and a provisional governed read without private personnel data or identities", async () => {
    requireOwnedStaffingClone(); await resetStaffingFixtureRates();
    const records: string[] = [], logger = vi.spyOn(console, "info").mockImplementation(value => records.push(String(value)));
    try {
      await withTransaction(async db => {
        const f = await createConfirmedAllocationLedgerFixture(db), demand = await readDemand(f.actor, f.demand.demandId, db);
        const assessment = await createManualAssessment(f.actor, { requestKey: randomUUID(), rationale: sentinel,
          resourceId: f.resource.resourceId, skillId: demand.demand!.requiredSkills[0].skillId, level: 3,
          assessmentDate: new Date().toISOString().slice(0, 10), nextReviewDate: f.firstDate, evidence: sentinel }, db);
        await decideCompetencies(f.actor, { requestKey: randomUUID(), rows: [{ competencyId: assessment.competencyId,
          candidateRevisionId: assessment.revisionId, candidateDigest: assessment.contentDigest, expectedAggregateVersion: assessment.aggregateVersion,
          sourceGeneration: 1, action: "accept", rationale: sentinel }] }, db);
        const manualId = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [assessment.revisionId])).rows[0].manual_evidence_id;
        await withdrawManualEvidence(f.actor, manualId, { requestKey: randomUUID(), rationale: sentinel, sourceGeneration: 1 }, db);
        const projected = await readResource(f.actor, f.resource.resourceId, db);
        expect(projected.skills).toEqual([]);
        const events = records.map(record => JSON.parse(record));
        expect(events).toContainEqual(expect.objectContaining({ operation: "source_lifecycle", outcome: "excluded", count: 1 }));
        expect(events).toContainEqual(expect.objectContaining({ operation: "read", outcome: "validated" }));
        expect(records.join("\n")).not.toContain(sentinel);
        expect(records.join("\n")).not.toContain(f.resource.resourceId);
        expect(records.join("\n")).not.toContain(manualId);
      });
    } finally { logger.mockRestore(); }
  }, 120_000);
  it("records bounded outcomes without resource names, evidence or rationale and labels nested writes provisional", async () => {
    requireOwnedStaffingClone();
    const records: string[] = [], logger = vi.spyOn(console, "info").mockImplementation(value => { records.push(String(value)); });
    try {
      await withTransaction(async db => {
        const actor = await createProfileTestSession(db, "mcteer");
        const resource = await createResource(actor, { requestKey: randomUUID(), rationale: sentinel, resource: { ...syntheticResource(), displayName: sentinel } }, db);
        const skill = await createSkill(actor, { requestKey: randomUUID(), rationale: sentinel, skill: { ...syntheticSkill(), definition: sentinel } }, db);
        await createManualAssessment(actor, { requestKey: randomUUID(), rationale: sentinel, resourceId: resource.resourceId,
          skillId: skill.skillId, level: 2, assessmentDate: "2026-09-29", nextReviewDate: "2026-12-28", evidence: sentinel }, db);
      });
      expect(records).toHaveLength(3);
      expect(records.join("\n")).not.toContain(sentinel);
      const events = records.map(r => JSON.parse(r));
      expect(events.every(e => e.kind === "turas_staffing_operation" && e.outcome === "validated")).toBe(true);
      expect(events.map(e => e.operation)).toEqual(["registry", "registry", "competency_review"]);
      for (const event of events) expect(Object.keys(event).sort()).toEqual(["durationMs", "kind", "operation", "outcome"]);
    } finally { logger.mockRestore(); }
  });
  it("records denied and reused receipt outcomes without logging raw errors or request fields", async () => {
    requireOwnedStaffingClone();
    const events: Record<string, unknown>[] = [], logger = vi.spyOn(console, "info").mockImplementation(value => { events.push(JSON.parse(String(value))); });
    try {
      const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
      const panel = await withTransaction(db => createProfileTestSession(db, "panel"));
      const request = { requestKey: randomUUID(), rationale: sentinel, resource: { ...syntheticResource(), displayName: sentinel } };
      await createResource(actor, request); await createResource(actor, request);
      await expect(createResource(panel, { ...request, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
      expect(events.map(e => e.outcome)).toEqual(["committed", "reused_receipt", "denied"]);
      expect(JSON.stringify(events)).not.toContain(sentinel);
      expect(JSON.stringify(events)).not.toContain(request.requestKey);
    } finally { logger.mockRestore(); }
  });
});
