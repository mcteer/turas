import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { nextArtifactGeneration, retireArtifactVersion, retryArtifactVersion } from "../../lib/server/artifacts/lifecycle";

describe("artifact lifecycle tombstones", () => {
  it("requires exact generation, keeps idempotent receipts and excludes source text from audit", async () => {
    expect(nextArtifactGeneration(1, 1)).toBe(2);
    expect(() => nextArtifactGeneration(2, 1)).toThrow("Source version changed");
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "mcteer");
          const first = await createArtifactDatabaseFixture(client, actor, DEMO_IDS.sharedCustomer);
          const reason = "Synthetic source contains confidential details";
          const command = { action: "cancel" as const, expectedGeneration: 1,
            reason, idempotencyKey: "cancel-fixture" };
          const receipt = await retireArtifactVersion(actor, first.versionId, command, client);
          expect(receipt).toMatchObject({ state: "cancelled", lifecycleGeneration: 2 });
          expect(await retireArtifactVersion(actor, first.versionId, command, client)).toEqual(receipt);
          await expect(retireArtifactVersion(actor, first.versionId,
            { ...command, idempotencyKey: "other-key" }, client)).rejects.toMatchObject({ status: 409 });
          const audit = await client.query<{ event: object }>(`
            SELECT row_to_json(e.*) AS event FROM artifact_lifecycle_events e WHERE id=$1`, [receipt.eventId]);
          expect(JSON.stringify(audit.rows[0].event)).not.toContain(reason);
          expect(JSON.stringify(audit.rows[0].event)).not.toContain("synthetic.txt");
          const jobs = await client.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM artifact_cleanup_jobs WHERE version_id=$1", [first.versionId]);
          expect(Number(jobs.rows[0].count)).toBe(5);
          const second = await createArtifactDatabaseFixture(client, actor, DEMO_IDS.sharedCustomer);
          const withdrawn = await retireArtifactVersion(actor, second.versionId,
            { action: "withdraw", expectedGeneration: 1, reason: "Synthetic source withdrawn", idempotencyKey: "withdraw-fixture" }, client);
          expect(withdrawn.lifecycleGeneration).toBe(2);
          const deleted = await retireArtifactVersion(actor, second.versionId,
            { action: "delete", expectedGeneration: 2, reason: "Synthetic source deleted", idempotencyKey: "delete-fixture" }, client);
          expect(deleted).toMatchObject({ state: "deleting", lifecycleGeneration: 3 });
          await client.query("SAVEPOINT no_resurrection");
          await expect(client.query("UPDATE artifact_versions SET state='ready' WHERE id=$1", [second.versionId]))
            .rejects.toMatchObject({ code: "23514" });
          await client.query("ROLLBACK TO SAVEPOINT no_resurrection");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
  it("queues one retry for a failed unpublished source", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "mcteer");
          const fixture = await createArtifactDatabaseFixture(client, actor, DEMO_IDS.sharedCustomer);
          await client.query("UPDATE artifact_extraction_runs SET state='failed' WHERE id=$1", [fixture.runId]);
          await client.query("UPDATE artifact_versions SET state='failed' WHERE id=$1", [fixture.versionId]);
          const command = { action: "retry" as const, expectedGeneration: 1,
            reason: "Synthetic parser recovery", idempotencyKey: "retry-fixture" };
          const first = await retryArtifactVersion(actor, fixture.versionId, command, client);
          expect(first.lifecycleGeneration).toBe(1);
          expect(await retryArtifactVersion(actor, fixture.versionId, command, client)).toEqual(first);
          const runs = await client.query<{ state: string; attempt_number: number }>(`
            SELECT state,attempt_number FROM artifact_extraction_runs WHERE version_id=$1
            ORDER BY attempt_number`, [fixture.versionId]);
          expect(runs.rows.map((row) => [row.state,row.attempt_number])).toEqual([
            ["failed",1],["queued",2],
          ]);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
