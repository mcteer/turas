import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { publishArtifactRun } from "../../lib/server/artifacts/jobs";
import { createArtifactSelection } from "../../lib/server/artifacts/selections";
import { submitArtifactProposal } from "../../lib/server/artifacts/proposals";
import { requireArtifactSourceReader } from "../../lib/server/artifacts/policy";

describe("exact artifact evidence selection", () => {
  it("persists only exact ordered ranges and denies another private-chat owner", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const owner = await createProfileTestSession(client, "mcteer");
          const other = await createProfileTestSession(client, "panel");
          const fixture = await createArtifactDatabaseFixture(client, owner, DEMO_IDS.sharedCustomer);
          const token = randomUUID();
          await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1", [fixture.versionId]);
          const leased = await client.query<{ deadline_at: Date }>(`
            UPDATE artifact_extraction_runs SET state='leased',attempt_token=$2,
              heartbeat_at=now(),lease_expires_at=now()+interval '30 seconds',
              started_at=now(),deadline_at=now()+interval '120 seconds'
            WHERE id=$1 RETURNING deadline_at`, [fixture.runId, token]);
          const claim = { runId: fixture.runId, versionId: fixture.versionId, attemptToken: token,
            lifecycleGeneration: 1, originalDigest: fixture.originalDigest,
            parserImageDigest: fixture.imageDigest, scanPolicyVersion: "004-v1",
            parserPolicyVersion: "004-v1", deadlineAt: leased.rows[0].deadline_at.toISOString() };
          const scan = { contract: "artifact-intake-v1" as const, originalDigest: fixture.originalDigest,
            engineVersion: "synthetic", signatureVersion: "synthetic", scanPolicyVersion: "004-v1",
            scannedAt: new Date().toISOString(), result: "clean" as const };
          const unitId = randomUUID();
          await publishArtifactRun(claim, { contract: "artifact-intake-v1", originalDigest: fixture.originalDigest,
            parserVersion: "004-v1", imageDigest: fixture.imageDigest,
            scanReceiptDigest: createHash("sha256").update(JSON.stringify(scan)).digest("hex"),
            format: "txt", status: "ready", coverage: { total: 1, visited: 1, omitted: [] },
            units: [{ id: unitId, ordinal: 1, text: "Synthetic artifact",
              locator: { kind: "txt", lineStart: 1, lineEnd: 1 }, origin: "native", ocrConfidence: null }],
            warnings: [] }, scan, client);
          const storedUnit = await client.query<{ id: string }>(
            "SELECT id FROM artifact_extraction_units WHERE run_id=$1", [claim.runId]);
          const input = { versionId: fixture.versionId, runId: claim.runId, lifecycleGeneration: 1,
            ranges: [{ unitId: storedUnit.rows[0].id, start: 0, end: 9 }], excerpt: "Synthetic",
            excerptDigest: createHash("sha256").update("Synthetic").digest("hex"),
            audience: "delivery" as const, dataCategory: "delivery_context" as const };
          const created = await createArtifactSelection(owner, input, client);
          expect(created).toMatchObject({ excerpt: "Synthetic", excerptDigest: input.excerptDigest });
          await expect(createArtifactSelection(other, input, client)).rejects.toMatchObject({ status: 404 });
          await expect(createArtifactSelection(owner, { ...input, excerpt: "Invented" }, client))
            .rejects.toMatchObject({ status: 409 });
          const correction = await createArtifactSelection(owner, { ...input,
            ranges: [{ unitId: storedUnit.rows[0].id, start: 10, end: 18 }],
            excerpt: "artifact", excerptDigest: createHash("sha256").update("artifact").digest("hex") }, client);
          expect(correction.selectionId).not.toBe(created.selectionId);
          await expect(requireArtifactSourceReader(client, other, {
            environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!, workspaceId: owner.workspaceId,
            customerId: DEMO_IDS.sharedCustomer, ownerPrincipalId: owner.principalId,
            submittedAt: null,
          })).rejects.toMatchObject({ status: 404 });
          const proposal = await submitArtifactProposal(owner, {
            selection: input,
            command: { action: "propose_record", requestKey: randomUUID(),
              requestedAudience: "delivery", dataCategory: "delivery_context",
              payload: { kind: "claim", text: "Synthetic source supports the panel claim", sourceType: "manual" } },
          }, client);
          expect(proposal).toMatchObject({ reviewState: "pending" });
          const support = await client.query<{ artifact_selection_id: string }>(
            "SELECT artifact_selection_id FROM profile_evidence_links WHERE profile_revision_id=$1",
            [proposal.revisionId]);
          expect(support.rows).toHaveLength(1);
          expect(support.rows[0].artifact_selection_id).toBe(proposal.selectionId);
          const submitted = await client.query<{ submitted_at: Date | null }>(
            "SELECT submitted_at FROM artifact_versions WHERE id=$1", [fixture.versionId]);
          expect(submitted.rows[0].submitted_at).not.toBeNull();
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
