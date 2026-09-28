import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../fixtures/identities";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { readProfile, readProfileSource } from "../../lib/server/profiles/read";

const customerId = DEMO_IDS.sharedCustomer;

describe("accepted context eligibility", () => {
  it("withholds confirmed contradictions until a conflicting head is withdrawn and reviewed", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const marker = randomUUID().slice(0, 8);
          const makeFact = async (text: string) => {
            const proposed = await submitProfileCommand(admin, customerId,
              { requestKey: randomUUID(), action: "propose_record",
                payload: { kind: "claim", text, sourceType: "manual" },
                requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { recordId: string; revisionId: string };
            const digest = await client.query<{ content_digest: string }>(
              "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
            await submitProfileCommand(admin, customerId,
              { requestKey: randomUUID(), action: "accept_revision", revisionId: proposed.revisionId,
                digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
                expectedAcceptedRevisionId: null, rationale: "Synthetic source reviewed" }, client);
            return proposed;
          };
          const first = await makeFact(`Synthetic capability is enabled ${marker}`);
          const second = await makeFact(`Synthetic capability is disabled ${marker}`);
          const before = await readEligibleContext(admin, customerId, { query: marker }, client) as { entries: { citationId: string }[] };
          expect(before.entries.map((entry) => entry.citationId)).toContain(first.revisionId);
          const flagged = await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "flag_conflict",
              firstRevisionId: first.revisionId, secondRevisionId: second.revisionId,
              reason: "Contradictory synthetic claims" }, client) as { conflictId: string };
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "confirm_conflict", conflictId: flagged.conflictId,
              expectedVersion: 1, rationale: "Material contradiction confirmed" }, client);
          const blocked = await readEligibleContext(admin, customerId, { query: marker }, client) as { entries: { citationId: string }[] };
          expect(blocked.entries.map((entry) => entry.citationId)).not.toContain(first.revisionId);
          expect(blocked.entries.map((entry) => entry.citationId)).not.toContain(second.revisionId);
          await expect(submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "resolve_conflict", conflictId: flagged.conflictId,
              expectedVersion: 2, rationale: "Premature resolution",
              resolutionRevisionIds: [second.revisionId] }, client)).rejects.toMatchObject({ status: 409 });
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "retract_revision", revisionId: first.revisionId,
              expectedRecordVersion: 1, rationale: "Contradicted by current evidence" }, client);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "resolve_conflict", conflictId: flagged.conflictId,
              expectedVersion: 2, rationale: "Conflicting head withdrawn",
              resolutionRevisionIds: [second.revisionId] }, client);
          const after = await readEligibleContext(admin, customerId, { query: marker }, client) as { entries: { citationId: string }[] };
          expect(after.entries.map((entry) => entry.citationId)).toContain(second.revisionId);
          expect(after.entries.map((entry) => entry.citationId)).not.toContain(first.revisionId);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("withdraws dependent settled guidance and attributed research atomically", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const marker = randomUUID().slice(0, 8);
          const source = await ingestVerifiedResearch({
            workspaceId: DEMO_IDS.workspace, customerId, trustedIdentity: "synthetic-fixture-v1",
            location: "https://example.com/withdrawal-fixture", title: "Synthetic source",
            passage: "A public synthetic capability is documented.",
            supportedClaim: `A synthetic capability exists ${marker}.`,
            publicationAt: "2026-09-01T00:00:00Z", retrievalAt: "2026-09-27T00:00:00Z",
            rights: "Public synthetic fixture", audience: "delivery",
            qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
              reliabilityRationale: "Named public source", directnessRationale: "Direct passage",
              corroborationRationale: "Single source", informationType: "product_capability",
              dateBasis: "publication" },
            checks: { identity: true, scope: true, integrity: true, content: true,
              rationale: "Synthetic checks passed", checkVersion: "research-check-v1" },
          }, client);
          const proposed = await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: `The synthetic capability exists ${marker}`, sourceType: "manual",
                evidenceRevisionIds: [source.sourceRevisionId] },
              qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
                reliabilityRationale: "Named synthetic source",
                directnessRationale: "Exact retained passage",
                corroborationRationale: "Single independent source",
                informationType: "product_capability", dateBasis: "publication",
                dateSourceRevisionId: source.sourceRevisionId },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "accept_revision", revisionId: proposed.revisionId,
              digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
              expectedAcceptedRevisionId: null, rationale: "Synthetic source verified" }, client);
          const quality = await client.query<{ input: { evidenceAt: string }; freshness: number }>(
            "SELECT input,freshness FROM evidence_quality_snapshots WHERE profile_revision_id=$1",
            [proposed.revisionId]);
          expect(quality.rows[0]).toMatchObject({ input: { evidenceAt: "2026-09-01T00:00:00.000Z" }, freshness: 4 });
          const projected = await readProfile(admin, customerId, client) as {
            acceptedFacts: { id: string; quality: { F: number } }[] };
          expect(projected.acceptedFacts.find((item) => item.id === proposed.revisionId)?.quality.F).toBe(4);
          const before = await readEligibleContext(admin, customerId,
            { query: marker }, client) as { entries: { citationId: string }[] };
          expect(before.entries.map((entry) => entry.citationId)).toContain(proposed.revisionId);
          expect(before.entries.map((entry) => entry.citationId)).toContain(source.sourceRevisionId);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "withdraw_source",
              sourceRevisionId: source.sourceRevisionId, expectedLifecycleVersion: 0,
              rationale: "Synthetic source withdrawn" }, client);
          const after = await readEligibleContext(admin, customerId,
            { query: marker }, client) as { entries: { citationId: string }[] };
          expect(after.entries.map((entry) => entry.citationId)).not.toContain(proposed.revisionId);
          expect(after.entries.map((entry) => entry.citationId)).not.toContain(source.sourceRevisionId);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("requires a safe attestation for delivery facts backed by a hidden source", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          const source = await ingestVerifiedResearch({
            workspaceId: DEMO_IDS.workspace, customerId, trustedIdentity: "synthetic-fixture-v1",
            location: "https://example.com/restricted-support-fixture", title: "Restricted synthetic source",
            passage: "A synthetic reviewed observation has restricted detail.",
            supportedClaim: "A synthetic delivery capability exists.",
            publicationAt: "2026-09-01T00:00:00Z", retrievalAt: "2026-09-27T00:00:00Z",
            rights: "Public synthetic fixture", audience: "internal",
            qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
              reliabilityRationale: "Named source", directnessRationale: "Direct passage",
              corroborationRationale: "Single source", informationType: "product_capability",
              dateBasis: "publication" },
            checks: { identity: true, scope: true, integrity: true, content: true,
              rationale: "Synthetic checks passed", checkVersion: "research-check-v1" },
          }, client);
          const proposed = await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "Synthetic capability reviewed for delivery",
                sourceType: "manual", evidenceRevisionIds: [source.sourceRevisionId] },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
          const decision = { action: "accept_revision", revisionId: proposed.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic private support reviewed" };
          await expect(submitProfileCommand(admin, customerId,
            { ...decision, requestKey: randomUUID() }, client)).rejects.toMatchObject({ status: 422 });
          await submitProfileCommand(admin, customerId,
            { ...decision, requestKey: randomUUID(),
              partnerSafeAttestation: "An assigned reviewer verified the delivery fact." }, client);
          const profile = await readProfile(partner, customerId, client) as {
            acceptedFacts: { id: string; supportStatus: string; quality: { Q: number } }[];
          };
          expect(profile.acceptedFacts.find((fact) => fact.id === proposed.revisionId))
            .toMatchObject({ supportStatus: "restricted_source", quality: { Q: 0 } });
          expect(JSON.stringify(profile)).not.toContain("restricted-support-fixture");
          await expect(readProfileSource(partner, customerId, source.sourceRevisionId, client))
            .rejects.toMatchObject({ status: 404 });
          const context = await readEligibleContext(partner, customerId, {}, client) as {
            entries: { citationId: string; sourceAttestation?: string }[];
          };
          expect(context.entries.find((entry) => entry.citationId === proposed.revisionId))
            .toMatchObject({ sourceAttestation: "An assigned reviewer verified the delivery fact." });
          expect(JSON.stringify(context)).not.toContain("restricted-support-fixture");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
});
