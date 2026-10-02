import { staffingNavigation } from "../../lib/server/staffing/navigation";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { syntheticResource, syntheticSkill } from "../fixtures/staffing/seed";
import { createResource, reviseResource, revisePartnerEligibility } from "../../lib/server/staffing/resources";
import { createSkill, reviseSkill } from "../../lib/server/staffing/skills";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";

import { createManualAssessment, decideCompetencies } from "../../lib/server/staffing/competencies";
import { readResource, listResources, readCompetencyHistory, readManagerCompetencies, readResourceSkills } from "../../lib/server/staffing/read";
import { withdrawManualEvidence } from "../../lib/server/staffing/lifecycle";

describe("canonical workforce registry", () => {
  it("keeps inactive membership identities unique and forbids reassignment", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT registry_fixture");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        const resource = { ...syntheticResource(), membershipId: DEMO_IDS.panelMembership, state: "inactive" as const };
        const result = await createResource(actor, { requestKey: randomUUID(), rationale: "Synthetic registry", resource }, db);
        await expect(createResource(actor, { requestKey: randomUUID(), rationale: "Duplicate identity",
          resource: { ...resource, externalKey: `new_${randomUUID()}` } }, db)).rejects.toMatchObject({ status: 409 });
        const exact = { requestKey: randomUUID(), rationale: "Synthetic correction", revisionId: result.revisionId,
          contentDigest: result.contentDigest, expectedAggregateVersion: result.aggregateVersion };
        await expect(reviseResource(actor, result.resourceId, { ...exact,
          resource: { ...resource, membershipId: null } }, db)).rejects.toMatchObject({ status: 422 });
        const changed = await reviseResource(actor, result.resourceId, { ...exact,
          resource: { ...resource, state: "active", displayName: "Corrected synthetic name" } }, db);
        expect(changed.aggregateVersion).toBe(2);
        await expect(reviseResource(actor, result.resourceId, { ...exact, requestKey: randomUUID(), resource }, db))
          .rejects.toMatchObject({ status: 409 });
        expect((await db.query("SELECT id FROM workforce_resource_revisions WHERE resource_id=$1", [result.resourceId])).rowCount).toBe(2);
      } finally { await db.query("ROLLBACK TO SAVEPOINT registry_fixture"); }
    });
  });
  it("requires manager authority and current explicit partner identity and dated eligibility", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT registry_fixture");
      try {
        const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
        await expect(createResource(panel, { requestKey: randomUUID(), rationale: "Denied", resource: syntheticResource() }, db))
          .rejects.toMatchObject({ status: 403 });
        const resource = { ...syntheticResource(), kind: "partner" as const,
          membershipId: DEMO_IDS.partnerMembership, partnerOrganizationId: DEMO_IDS.partnerOrganization };
        const result = await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic partner", resource }, db);
        const eligibility = await revisePartnerEligibility(manager, result.resourceId, { requestKey: randomUUID(),
          rationale: "Synthetic dated authorization", revisionId: result.revisionId, contentDigest: result.contentDigest,
          expectedAggregateVersion: result.aggregateVersion, customerId: DEMO_IDS.sharedCustomer,
          fromDate: "2026-10-01", toDate: "2026-10-31", state: "active" }, db);
        expect(eligibility.aggregateVersion).toBe(2);
        expect((await db.query("SELECT resource_id,customer_id FROM workforce_partner_eligibility WHERE id=$1",
          [eligibility.revisionId])).rows[0]).toEqual({ resource_id: result.resourceId, customer_id: DEMO_IDS.sharedCustomer });
      } finally { await db.query("ROLLBACK TO SAVEPOINT registry_fixture"); }
    });
  });
  it("versions taxonomy definitions without renaming a canonical key", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT registry_fixture");
      try {
        const actor = await createProfileTestSession(db, "mcteer"), skill = syntheticSkill();
        const first = await createSkill(actor, { requestKey: randomUUID(), rationale: "Synthetic taxonomy", skill }, db);
        const exact = { requestKey: randomUUID(), rationale: "Synthetic retirement", revisionId: first.revisionId,
          contentDigest: first.contentDigest, expectedAggregateVersion: first.aggregateVersion };
        await expect(reviseSkill(actor, first.skillId, { ...exact, skill: { ...skill, key: "different" } }, db))
          .rejects.toMatchObject({ status: 422 });
        const next = await reviseSkill(actor, first.skillId, { ...exact, skill: { ...skill, state: "retired" } }, db);
        expect(next.aggregateVersion).toBe(2);
        expect((await db.query("SELECT active FROM workforce_skills WHERE id=$1", [first.skillId])).rows[0].active).toBe(false);
      } finally { await db.query("ROLLBACK TO SAVEPOINT registry_fixture"); }
    });
  });  it("returns only approved summaries and withholds withdrawn evidence before cleanup", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT projection_fixture");
      try {
        const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
        const resource = await createResource(manager, { requestKey: randomUUID(), rationale: "PRIVATE_PROFILE_RATIONALE", resource: syntheticResource() }, db);
        const skill = await createSkill(manager, { requestKey: randomUUID(), rationale: "Synthetic taxonomy", skill: syntheticSkill() }, db);
        const candidate = await createManualAssessment(manager, { requestKey: randomUUID(), rationale: "Synthetic observation",
          resourceId: resource.resourceId, skillId: skill.skillId, level: 2, assessmentDate: "2026-09-29",
          nextReviewDate: "2026-12-28", evidence: "PRIVATE_PERSONNEL_EVIDENCE" }, db);
        expect((await readResource(panel, resource.resourceId, db)).skills).toEqual([]);
        const pending = await readManagerCompetencies(manager, resource.resourceId, {}, db);
        expect(pending.items[0]).toMatchObject({ state: "pending", evidence: "PRIVATE_PERSONNEL_EVIDENCE", withheld: false });
        expect(JSON.stringify(await readCompetencyHistory(panel, candidate.competencyId, {}, db))).not.toContain("PRIVATE_");
        await decideCompetencies(manager, { requestKey: randomUUID(), rows: [{ competencyId: candidate.competencyId,
          candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest, sourceGeneration: 1,
          expectedAggregateVersion: candidate.aggregateVersion, action: "accept", rationale: "PRIVATE_DECISION_RATIONALE" }] }, db);
        const approved = await readResource(panel, resource.resourceId, db);
        expect(approved.skills).toEqual([{ skillId: skill.skillId, revisionId: candidate.revisionId, level: 2, freshness: "recent" }]);
        const operationalHistory = await readCompetencyHistory(panel, candidate.competencyId, {}, db);
        expect(operationalHistory.items[0]).toMatchObject({ state: "accepted", level: 2, withheld: false });
        expect(JSON.stringify(operationalHistory)).not.toContain("PRIVATE_");
        const serialized = JSON.stringify(approved);
        for (const field of ["PRIVATE_", "evidence", "rationale", "filename", "cost", "rate", "manualEvidenceId", "sourceVersionId"]) expect(serialized).not.toContain(field);
        const source = (await db.query("SELECT manual_evidence_id FROM workforce_competency_revisions WHERE id=$1", [candidate.revisionId])).rows[0];
        await withdrawManualEvidence(manager, source.manual_evidence_id, { requestKey: randomUUID(), sourceGeneration: 1,
          rationale: "Withdraw synthetic observation" }, db);
        expect((await readResource(panel, resource.resourceId, db)).skills).toEqual([]);
        const hiddenHistory = await readCompetencyHistory(manager, candidate.competencyId, {}, db);
        expect(hiddenHistory.items[0]).toMatchObject({ withheld: true, warning: "source_withheld" });
        expect(JSON.stringify(hiddenHistory)).not.toContain("PRIVATE_");
        expect(hiddenHistory.items[0]).not.toHaveProperty("level");
        expect((await readManagerCompetencies(manager, resource.resourceId, {}, db)).items[0]).toMatchObject({ withheld: true });
        expect((await db.query("SELECT revision_id FROM workforce_competency_payloads WHERE revision_id=$1", [candidate.revisionId])).rowCount).toBe(1);
      } finally { await db.query("ROLLBACK TO SAVEPOINT projection_fixture"); }
    });
  });
  it("binds roster cursors to the current actor and denies foreign resource IDs", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT projection_fixture");
      try {
        const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
        for (let i = 0; i < 2; i++) await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic pagination", resource: syntheticResource() }, db);
        const first = await listResources(panel, { pageSize: 1 }, db);
        expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
        await expect(listResources(manager, { pageSize: 1, cursor: first.nextCursor }, db)).rejects.toMatchObject({ status: 422 });
        await expect(readResource(panel, randomUUID(), db)).rejects.toMatchObject({ status: 404 });
        const partner = await createProfileTestSession(db, "partner");
        await expect(listResources(partner, {}, db)).rejects.toMatchObject({ status: 403 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT projection_fixture"); }
    });
  });

  it("pages approved skills without implying a truncated page is complete", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT skills_page_fixture");
      try {
        const manager = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
        const resource = await createResource(manager, { requestKey: randomUUID(), rationale: "Synthetic pagination", resource: syntheticResource() }, db);
        const expected = [];
        for (let i = 0; i < 2; i++) {
          const skill = await createSkill(manager, { requestKey: randomUUID(), rationale: "Synthetic taxonomy", skill: syntheticSkill() }, db);
          const candidate = await createManualAssessment(manager, { requestKey: randomUUID(), rationale: "Synthetic observation",
            resourceId: resource.resourceId, skillId: skill.skillId, level: i + 1, assessmentDate: "2026-09-29",
            nextReviewDate: "2026-12-28", evidence: "PRIVATE_PAGED_EVIDENCE" }, db);
          await decideCompetencies(manager, { requestKey: randomUUID(), rows: [{ competencyId: candidate.competencyId,
            candidateRevisionId: candidate.revisionId, candidateDigest: candidate.contentDigest, sourceGeneration: 1,
            expectedAggregateVersion: candidate.aggregateVersion, action: "accept", rationale: "Synthetic review" }] }, db);
          expected.push(skill.skillId);
        }
        const first = await readResourceSkills(panel, resource.resourceId, { pageSize: 1 }, db);
        expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
        const second = await readResourceSkills(panel, resource.resourceId, { pageSize: 1, cursor: first.nextCursor! }, db);
        expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
        expect([...first.items, ...second.items].map(s => s.skillId).sort()).toEqual(expected.sort());
        expect(JSON.stringify(first)).not.toContain("PRIVATE_");
        await expect(readResourceSkills(manager, resource.resourceId, { cursor: first.nextCursor! }, db)).rejects.toMatchObject({ status: 422 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT skills_page_fixture"); }
    });
  });
  it("projects current staffing navigation from canonical authority and readiness", async () => {
    requireOwnedStaffingClone();
    const manager = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const panel = await withTransaction(db => createProfileTestSession(db, "panel"));
    const partner = await withTransaction(db => createProfileTestSession(db, "partner"));
    expect(await staffingNavigation(manager)).toEqual({ resources: true, imports: true, finance: true });
    expect(await staffingNavigation(panel)).toEqual({ resources: true, imports: false, finance: false });
    expect(await staffingNavigation(partner)).toEqual({ resources: false, imports: false, finance: false });
    await withTransaction(db => db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [manager.sessionId]));
    expect(await staffingNavigation(manager)).toEqual({ resources: false, imports: false, finance: false });
  });

});
