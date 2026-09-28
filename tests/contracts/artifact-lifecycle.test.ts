import { describe, expect, it } from "vitest";
import { artifactLifecycleActionSchema } from "../../lib/contracts/artifacts";
import { nextArtifactGeneration, retireArtifactVersion, retryArtifactVersion } from "../../lib/server/artifacts/lifecycle";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";

describe("artifact lifecycle command contract", () => {
  const valid = { action: "delete", expectedGeneration: 2,
    reason: "Remove synthetic test source", idempotencyKey: "retire-1" };

  it("requires a bounded reason, exact generation, and a distinct action", () => {
    expect(artifactLifecycleActionSchema.parse(valid)).toEqual(valid);
    for (const command of [
      { ...valid, reason: " " },
      { ...valid, reason: "x".repeat(2_001) },
      { ...valid, expectedGeneration: 0 },
      { ...valid, expectedGeneration: 1.5 },
      { ...valid, action: "replace" },
      { ...valid, idempotencyKey: "" },
      { ...valid, filename: "private.txt" },
    ]) expect(artifactLifecycleActionSchema.safeParse(command).success).toBe(false);
  });

  it("rejects a stale or invalid generation before a tombstone", () => {
    expect(nextArtifactGeneration(2, 2)).toBe(3);
    for (const [current, expected] of [[2, 1], [0, 0], [2.5, 2.5],
      [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]]) {
      expect(() => nextArtifactGeneration(current, expected)).toThrow();
    }
  });

  it("switches from owner draft authority to current steward authority after submission", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const owner = await createProfileTestSession(client,"panel");
          const steward = await createProfileTestSession(client,"mcteer");
          const draft = await createArtifactDatabaseFixture(client,owner,DEMO_IDS.sharedCustomer);
          const command = { action: "cancel" as const,expectedGeneration: 1,
            reason: "Synthetic draft cancellation",idempotencyKey: "draft-cancel" };
          await expect(retireArtifactVersion(steward,draft.versionId,command,client))
            .rejects.toMatchObject({ status: 404 });
          const cancelled = await retireArtifactVersion(owner,draft.versionId,command,client);
          expect(cancelled.state).toBe("cancelled");
          expect(await retireArtifactVersion(owner,draft.versionId,command,client)).toEqual(cancelled);
          const submitted = await createArtifactDatabaseFixture(client,owner,DEMO_IDS.sharedCustomer);
          await client.query("UPDATE artifact_versions SET submitted_at=now() WHERE id=$1",
            [submitted.versionId]);
          const withdraw = { action: "withdraw" as const,expectedGeneration: 1,
            reason: "Synthetic submitted source retirement",idempotencyKey: "submitted-withdraw" };
          await expect(retireArtifactVersion(owner,submitted.versionId,withdraw,client))
            .rejects.toMatchObject({ status: 403 });
          const receipt = await retireArtifactVersion(steward,submitted.versionId,withdraw,client);
          expect(receipt).toMatchObject({ state: "withdrawn",lifecycleGeneration: 2 });
          expect(await retireArtifactVersion(steward,submitted.versionId,withdraw,client)).toEqual(receipt);
          await expect(retireArtifactVersion(steward,submitted.versionId,
            { ...withdraw,idempotencyKey: "stale-key" },client)).rejects.toMatchObject({ status: 409 });
          await expect(retryArtifactVersion(steward,submitted.versionId,
            { action: "retry",expectedGeneration: 2,reason: "Synthetic retry denied",
              idempotencyKey: "retired-retry" },client)).rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
