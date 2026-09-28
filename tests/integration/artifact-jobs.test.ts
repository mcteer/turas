import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { claimArtifactRun, heartbeatArtifactRun, publishArtifactRun } from "../../lib/server/artifacts/jobs";

describe("artifact leases and publication", () => {
  it("publishes one digest-bound run and fences stale tokens and generations", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "mcteer");
          const fixture = await createArtifactDatabaseFixture(client, actor, DEMO_IDS.sharedCustomer);
          const claim = await claimArtifactRun(client);
          expect(claim).toMatchObject({ runId: fixture.runId, versionId: fixture.versionId,
            lifecycleGeneration: 1, originalDigest: fixture.originalDigest });
          if (!claim) throw new Error("Expected claim");
          expect(await heartbeatArtifactRun(claim, client)).toBe(true);
          const scan = { contract: "artifact-intake-v1" as const, originalDigest: fixture.originalDigest,
            engineVersion: "1.5.4", signatureVersion: "28137", scanPolicyVersion: "004-v1",
            scannedAt: new Date().toISOString(), result: "clean" as const };
          const manifest = { contract: "artifact-intake-v1", originalDigest: fixture.originalDigest,
            parserVersion: "004-v1", imageDigest: fixture.imageDigest,
            scanReceiptDigest: createHash("sha256").update(JSON.stringify(scan)).digest("hex"),
            format: "txt", status: "ready", coverage: { total: 1, visited: 1, omitted: [] },
            units: [{ id: randomUUID(), ordinal: 1, text: "Synthetic artifact",
              locator: { kind: "txt", lineStart: 1, lineEnd: 1 }, origin: "native", ocrConfidence: null }],
            warnings: [] };
          expect((await publishArtifactRun(claim, manifest, scan, client)).units).toHaveLength(1);
          const state = await client.query<{ state: string }>("SELECT state FROM artifact_versions WHERE id=$1", [fixture.versionId]);
          expect(state.rows[0].state).toBe("ready");
          const unit = await client.query<{ id: string }>(
            "SELECT id FROM artifact_extraction_units WHERE run_id=$1", [claim.runId]);
          const insertSelection = `INSERT INTO artifact_evidence_selections
            (id,version_id,run_id,environment_id,workspace_id,customer_id,owner_principal_id,
             author_membership_id,lifecycle_generation,original_digest,ranges,excerpt_digest,
             excerpt_char_count,audience,data_category)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,18,'internal','other_internal')`;
          const selectionValues = [randomUUID(), fixture.versionId, claim.runId,
            process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId, DEMO_IDS.sharedCustomer,
            actor.principalId, actor.membershipId, fixture.originalDigest,
            JSON.stringify([{ unitId: unit.rows[0].id, start: 0, end: 19 }]),
            createHash("sha256").update("Synthetic artifact").digest("hex")];
          await client.query("SAVEPOINT invalid_range");
          await expect(client.query(insertSelection, selectionValues)).rejects.toMatchObject({ code: "23514" });
          await client.query("ROLLBACK TO SAVEPOINT invalid_range");
          selectionValues[9] = JSON.stringify([{ unitId: unit.rows[0].id, start: 0, end: 18 }]);
          await client.query(insertSelection, selectionValues);
          await expect(publishArtifactRun(claim, manifest, scan, client)).rejects.toThrow("artifact_publication_fenced");
          expect(await claimArtifactRun(client)).toBeNull();
          const second = await createArtifactDatabaseFixture(client, actor, DEMO_IDS.sharedCustomer);
          const late = await claimArtifactRun(client);
          expect(late?.runId).toBe(second.runId);
          await client.query("UPDATE artifact_versions SET state='withdrawn',lifecycle_generation=2 WHERE id=$1", [second.versionId]);
          await expect(publishArtifactRun(late!, { ...manifest, originalDigest: second.originalDigest,
            imageDigest: second.imageDigest, scanReceiptDigest: createHash("sha256").update(JSON.stringify({ ...scan,
              originalDigest: second.originalDigest })).digest("hex") },
          { ...scan, originalDigest: second.originalDigest }, client)).rejects.toThrow("artifact_publication_fenced");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
