import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { readProfile } from "../../lib/server/profiles/read";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import type { PoolClient } from "pg";

const customerId = DEMO_IDS.sharedCustomer;

async function acceptedClaim(client: PoolClient, contributor: CurrentSession,
  reviewer: CurrentSession, text: string, audience: "delivery" | "internal",
  evidenceRevisionIds: string[] = [], partnerSafeAttestation?: string) {
  const candidate = await submitProfileCommand(contributor, customerId, {
    action: "propose_record", requestKey: randomUUID(),
    payload: { kind: "claim", text, sourceType: "manual", evidenceRevisionIds },
    requestedAudience: audience,
    dataCategory: audience === "delivery" ? "delivery_context" : "other_internal",
    evidenceRevisionIds,
  }, client) as { recordId: string; revisionId: string };
  const digest = await client.query<{ content_digest: string }>(
    "SELECT content_digest FROM profile_revisions WHERE id=$1", [candidate.revisionId]);
  await submitProfileCommand(reviewer, customerId, {
    action: "accept_revision", requestKey: randomUUID(), revisionId: candidate.revisionId,
    digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
    expectedAcceptedRevisionId: null, rationale: "Synthetic source reviewed",
    ...(partnerSafeAttestation ? { partnerSafeAttestation } : {}),
  }, client);
  return candidate;
}

describe("confirmed evidence conflict", () => {
  it("cannot race conflict confirmation into settled accepted guidance", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      let admin: CurrentSession | undefined;
      const marker = randomUUID();
      const prepared = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          admin = await createProfileTestSession(client, "mcteer");
          const first = await acceptedClaim(client, panel, admin,
            `Synthetic disputed support ${marker}`, "delivery");
          const second = await acceptedClaim(client, panel, admin,
            `Synthetic contrary support ${marker}`, "delivery");
          const conflict = await submitProfileCommand(panel, customerId, {
            action: "flag_conflict", requestKey: randomUUID(),
            firstRevisionId: first.revisionId, secondRevisionId: second.revisionId,
            reason: "Synthetic contradiction",
          }, client) as { conflictId: string; version: number };
          const dependent = await submitProfileCommand(panel, customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: `Synthetic disputed guidance ${marker}`,
              sourceType: "manual", evidenceRevisionIds: [first.revisionId] },
            evidenceRevisionIds: [first.revisionId],
          }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [dependent.revisionId]);
          await client.query("COMMIT");
          return { firstId: first.revisionId, secondId: second.revisionId,
            conflictId: conflict.conflictId, conflictVersion: conflict.version,
            dependentId: dependent.revisionId, digest: digest.rows[0].content_digest };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      if (!admin) throw new Error("Synthetic reviewer unavailable");
      const run = (command: Record<string, unknown>) => withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await submitProfileCommand(admin!, customerId, command, client);
          await client.query("COMMIT"); return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      const [accepted, confirmed] = await Promise.allSettled([
        run({ action: "accept_revision", requestKey: randomUUID(),
          revisionId: prepared.dependentId, digest: prepared.digest,
          expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
          rationale: "Synthetic dependent review" }),
        run({ action: "confirm_conflict", requestKey: randomUUID(),
          conflictId: prepared.conflictId, expectedVersion: prepared.conflictVersion,
          rationale: "Synthetic contradiction confirmed" }),
      ]);
      expect(confirmed.status).toBe("fulfilled");
      if (accepted.status === "rejected") expect(accepted.reason).toMatchObject({ status: 404 });
      const observation = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          const profile = await readProfile(panel, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          const context = await readEligibleContext(panel, customerId,
            { query: marker }, client) as { entries: { citationId: string }[] };
          return { profile, context };
        } finally { await client.query("ROLLBACK"); }
      });
      expect(observation.context.entries.map((entry) => entry.citationId))
        .not.toContain(prepared.dependentId);
      const dependent = observation.profile.acceptedFacts.find((fact) => fact.id === prepared.dependentId);
      if (dependent) {
        expect(dependent.supportStatus).toBe("unsupported");
        await run({ action: "retract_revision", requestKey: randomUUID(),
          revisionId: prepared.dependentId, expectedRecordVersion: 1,
          rationale: "Synthetic conflict race cleanup" });
      }
      for (const revisionId of [prepared.firstId, prepared.secondId]) {
        await run({ action: "retract_revision", requestKey: randomUUID(),
          revisionId, expectedRecordVersion: 1,
          rationale: "Synthetic conflicting support cleanup" });
      }
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });
  it("cannot race source withdrawal into settled accepted guidance", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      let panel: CurrentSession | undefined, admin: CurrentSession | undefined;
      const marker = randomUUID();
      const prepared = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          panel = await createProfileTestSession(client, "panel");
          admin = await createProfileTestSession(client, "mcteer");
          const source = await ingestVerifiedResearch({
            workspaceId: DEMO_IDS.workspace, customerId,
            trustedIdentity: "synthetic-fixture-v1",
            location: `https://example.com/withdraw-race-${marker}`,
            title: "Synthetic withdrawal race", passage: `Synthetic passage ${marker}`,
            supportedClaim: "Synthetic capability", publicationAt: "2026-09-01T00:00:00Z",
            retrievalAt: "2026-09-27T00:00:00Z", rights: "Synthetic fixture",
            audience: "delivery", qualityInput: { rubricVersion: "evidence-quality-v1",
              R: 2, D: 4, C: 1, reliabilityRationale: "Synthetic source",
              directnessRationale: "Exact passage", corroborationRationale: "One source",
              informationType: "product_capability", dateBasis: "publication" },
            checks: { identity: true, scope: true, integrity: true, content: true,
              rationale: "Verified synthetic fixture", checkVersion: "research-check-v1" },
          }, client);
          const candidate = await submitProfileCommand(panel!, customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: `Synthetic race guidance ${marker}`,
              sourceType: "manual", evidenceRevisionIds: [source.sourceRevisionId] },
            evidenceRevisionIds: [source.sourceRevisionId],
          }, client) as { revisionId: string; recordId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [candidate.revisionId]);
          await client.query("COMMIT");
          return { sourceRevisionId: source.sourceRevisionId, ...candidate,
            digest: digest.rows[0].content_digest };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      if (!admin || !panel) throw new Error("Synthetic sessions unavailable");
      const run = (command: Record<string, unknown>) => withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await submitProfileCommand(admin!, customerId, command, client);
          await client.query("COMMIT");
          return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      const [accepted, withdrawn] = await Promise.allSettled([
        run({ action: "accept_revision", requestKey: randomUUID(),
          revisionId: prepared.revisionId, digest: prepared.digest,
          expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
          rationale: "Synthetic race review" }),
        run({ action: "withdraw_source", requestKey: randomUUID(),
          sourceRevisionId: prepared.sourceRevisionId, expectedLifecycleVersion: 0,
          rationale: "Synthetic race withdrawal" }),
      ]);
      expect(withdrawn.status).toBe("fulfilled");
      if (accepted.status === "rejected") {
        expect(accepted.reason).toMatchObject({ status: 404 });
      }
      const observation = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const profile = await readProfile(admin!, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          const partner = await createProfileTestSession(client, "partner");
          const context = await readEligibleContext(partner, customerId,
            { query: marker }, client) as { entries: { citationId: string }[] };
          return { profile, context };
        } finally { await client.query("ROLLBACK"); }
      });
      expect(observation.context.entries.map((entry) => entry.citationId))
        .not.toContain(prepared.revisionId);
      const current = observation.profile.acceptedFacts.find((fact) => fact.id === prepared.revisionId);
      if (current) {
        expect(current.supportStatus).toBe("unsupported");
        await run({ action: "retract_revision", requestKey: randomUUID(),
          revisionId: prepared.revisionId, expectedRecordVersion: 1,
          rationale: "Synthetic race cleanup" });
      }
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });
  it("withdraws conflicted support from dependent guidance without exposing the hidden counterpart", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          const admin = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          const marker = randomUUID().slice(0, 8);
          const first = await acceptedClaim(client, panel, admin, `Delivery support ${marker}`, "delivery");
          const hidden = await acceptedClaim(client, panel, admin, `Internal counterpart ${marker}`, "internal");
          const restricted = await acceptedClaim(client, panel, admin,
            `Restricted-support conclusion ${marker}`, "delivery", [hidden.revisionId],
            "Internal team checked restricted support");
          const partnerBefore = await readProfile(partner, customerId, client) as {
            acceptedFacts: { id: string; payload: { evidenceRevisionIds?: string[] };
              sourceStatus?: string; sourceAttestation?: string }[] };
          const restrictedView = partnerBefore.acceptedFacts.find((fact) => fact.id === restricted.revisionId);
          expect(restrictedView).toMatchObject({ sourceStatus: "restricted",
            sourceAttestation: "Internal team checked restricted support",
            payload: { evidenceRevisionIds: [] } });
          expect(JSON.stringify(restrictedView)).not.toContain(hidden.revisionId);
          const dependent = await acceptedClaim(client, panel, admin,
            `Dependent guidance ${marker}`, "delivery", [first.revisionId]);
          const downstream = await acceptedClaim(client, panel, admin,
            `Downstream guidance ${marker}`, "delivery", [dependent.revisionId]);
          const before = await readEligibleContext(partner, customerId, { query: marker }, client) as {
            entries: { citationId: string }[] };
          expect(before.entries.map((entry) => entry.citationId)).toContain(dependent.revisionId);
          expect(before.entries.map((entry) => entry.citationId)).toContain(downstream.revisionId);
          const flagged = await submitProfileCommand(panel, customerId, {
            action: "flag_conflict", requestKey: randomUUID(), firstRevisionId: first.revisionId,
            secondRevisionId: hidden.revisionId, reason: "Synthetic discrepancy to verify",
          }, client) as { conflictId: string; version: number };
          await expect(submitProfileCommand(partner, customerId, {
            action: "flag_conflict", requestKey: randomUUID(), firstRevisionId: first.revisionId,
            secondRevisionId: hidden.revisionId, reason: "Attempted hidden conflict access",
          }, client)).rejects.toMatchObject({ status: 403 });
          await expect(submitProfileCommand(partner, customerId, {
            action: "confirm_conflict", requestKey: randomUUID(), conflictId: flagged.conflictId,
            expectedVersion: flagged.version, rationale: "Attempted hidden confirmation",
          }, client)).rejects.toMatchObject({ status: 403 });
          const afterFlag = await readEligibleContext(partner, customerId, { query: marker }, client) as {
            entries: { citationId: string }[] };
          expect(afterFlag.entries.map((entry) => entry.citationId)).toContain(dependent.revisionId);
          const confirmed = await submitProfileCommand(admin, customerId, {
            action: "confirm_conflict", requestKey: randomUUID(), conflictId: flagged.conflictId,
            expectedVersion: flagged.version, rationale: "Material contradiction confirmed",
          }, client) as { version: number };
          const internalProfile = await readProfile(admin, customerId, client) as {
            openConflicts: { id: string; state: string; version: number;
              firstRevisionId: string; secondRevisionId: string }[] };
          expect(internalProfile.openConflicts).toContainEqual(expect.objectContaining({
            id: flagged.conflictId, state: "confirmed", version: confirmed.version,
            firstRevisionId: first.revisionId, secondRevisionId: hidden.revisionId,
          }));
          const profile = await readProfile(partner, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          expect(profile).not.toHaveProperty("openConflicts");
          expect(profile.acceptedFacts.find((fact) => fact.id === first.revisionId)?.supportStatus)
            .toBe("conflicted");
          expect(profile.acceptedFacts.find((fact) => fact.id === dependent.revisionId)?.supportStatus)
            .toBe("unsupported");
          expect(profile.acceptedFacts.find((fact) => fact.id === downstream.revisionId)?.supportStatus)
            .toBe("unsupported");
          expect(JSON.stringify(profile)).not.toContain(hidden.revisionId);
          expect(JSON.stringify(profile)).not.toContain(`Internal counterpart ${marker}`);
          const context = await readEligibleContext(partner, customerId, { query: marker }, client) as {
            entries: { citationId: string }[] };
          expect(context.entries.map((entry) => entry.citationId))
            .not.toContain(first.revisionId);
          expect(context.entries.map((entry) => entry.citationId))
            .not.toContain(dependent.revisionId);
          expect(context.entries.map((entry) => entry.citationId))
            .not.toContain(downstream.revisionId);
          await expect(submitProfileCommand(panel, customerId, {
            action: "propose_record", requestKey: randomUUID(),
            payload: { kind: "claim", text: `Later dependency ${marker}`, sourceType: "manual" },
            requestedAudience: "delivery", dataCategory: "delivery_context",
            evidenceRevisionIds: [first.revisionId],
          }, client)).rejects.toMatchObject({ status: 404 });
          await submitProfileCommand(admin, customerId, {
            action: "retract_revision", requestKey: randomUUID(), revisionId: hidden.revisionId,
            expectedRecordVersion: 1, rationale: "Conflicting internal observation withdrawn",
          }, client);
          await submitProfileCommand(admin, customerId, {
            action: "resolve_conflict", requestKey: randomUUID(), conflictId: flagged.conflictId,
            expectedVersion: confirmed.version, rationale: "Remaining evidence reviewed",
            resolutionRevisionIds: [first.revisionId],
          }, client);
          const afterResolution = await readProfile(admin, customerId, client) as {
            openConflicts: { id: string }[] };
          expect(afterResolution.openConflicts.map((item) => item.id)).not.toContain(flagged.conflictId);
          const resolved = await readEligibleContext(partner, customerId, { query: marker }, client) as {
            entries: { citationId: string }[] };
          expect(resolved.entries.map((entry) => entry.citationId)).toContain(dependent.revisionId);
          expect(resolved.entries.map((entry) => entry.citationId)).toContain(downstream.revisionId);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });

  it("withdraws source-backed guidance through a second-level dependency", async () => {
    const priorMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          const admin = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          const marker = randomUUID().slice(0, 8);
          const source = await ingestVerifiedResearch({
            workspaceId: DEMO_IDS.workspace, customerId,
            trustedIdentity: "synthetic-fixture-v1",
            location: `https://example.com/support-${marker}`,
            title: `Synthetic source ${marker}`, passage: `Public passage ${marker}`,
            supportedClaim: `Public capability ${marker}`, publicationAt: "2026-09-01T00:00:00Z",
            retrievalAt: "2026-09-27T00:00:00Z", rights: "Public synthetic fixture",
            audience: "delivery",
            qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
              reliabilityRationale: "Named public source", directnessRationale: "Exact passage",
              corroborationRationale: "Single public source", informationType: "product_capability",
              dateBasis: "publication" },
            checks: { identity: true, scope: true, integrity: true, content: true,
              rationale: "Synthetic checks passed", checkVersion: "research-check-v1" },
          }, client);
          const supported = await acceptedClaim(client, panel, admin,
            `Source-backed claim ${marker}`, "delivery", [source.sourceRevisionId]);
          const downstream = await acceptedClaim(client, panel, admin,
            `Second-level claim ${marker}`, "delivery", [supported.revisionId]);
          await submitProfileCommand(admin, customerId, { action: "withdraw_source",
            requestKey: randomUUID(), sourceRevisionId: source.sourceRevisionId,
            expectedLifecycleVersion: 0, rationale: "Synthetic source withdrawal" }, client);
          const profile = await readProfile(partner, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string }[] };
          expect(profile.acceptedFacts.find((fact) => fact.id === supported.revisionId)?.supportStatus)
            .toBe("unsupported");
          expect(profile.acceptedFacts.find((fact) => fact.id === downstream.revisionId)?.supportStatus)
            .toBe("unsupported");
          const context = await readEligibleContext(partner, customerId, { query: marker }, client) as {
            entries: { citationId: string }[] };
          expect(context.entries.map((entry) => entry.citationId)).not.toContain(supported.revisionId);
          expect(context.entries.map((entry) => entry.citationId)).not.toContain(downstream.revisionId);
          await expect(submitProfileCommand(panel, customerId, { action: "propose_record",
            requestKey: randomUUID(), requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: `Unsupported citation ${marker}`, sourceType: "manual" },
            evidenceRevisionIds: [downstream.revisionId] }, client)).rejects.toMatchObject({ status: 404 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorMarker; }
  });
});
