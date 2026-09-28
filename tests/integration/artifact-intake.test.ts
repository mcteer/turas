import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../fixtures/identities";
import { createArtifactUploadBatch, releaseArtifactIntentReservation } from "../../lib/server/artifacts/intake";

const file = {
  name: "synthetic.txt", expectedSizeBytes: 100, declaredType: "text/plain" as const,
  sourcePublishedOn: null, sourceObservedOn: null, rightsNote: "Synthetic fixture",
  audience: "delivery" as const, dataCategory: "delivery_context" as const,
};

describe("artifact quota reservation", () => {
  it("replays a stable versionless intent and releases quota exactly once", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "mcteer");
          const conversation = randomUUID();
          const generation = await client.query<{ internal_generation: string }>(
            "SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1", [DEMO_IDS.sharedCustomer]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             creation_operation_id,binding_state,title,context_audience,context_generation,
             context_snapshot_schema,context_login_session_id,context_membership_id)
            VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic artifact chat','internal',$7,
              'customer-context-v1',$8,$9)`,
          [conversation, process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId,
            DEMO_IDS.sharedCustomer, actor.principalId, randomUUID(),
            generation.rows[0].internal_generation, actor.sessionId, actor.membershipId]);
          const input = { conversationId: conversation, customerId: DEMO_IDS.sharedCustomer,
            files: [file], idempotencyKey: "fixture-intent-1" };
          const first = await createArtifactUploadBatch(actor, input, client);
          expect(first.intents).toMatchObject([{ state: "uploading", versionId: null, receivedBytes: 0 }]);
          expect(await createArtifactUploadBatch(actor, input, client)).toEqual(first);
          await expect(createArtifactUploadBatch(actor, { ...input, files: [{ ...file, expectedSizeBytes: 101 }] }, client))
            .rejects.toMatchObject({ status: 409 });
          const second = await createArtifactUploadBatch(actor, { ...input, idempotencyKey: "fixture-intent-2" }, client);
          await expect(createArtifactUploadBatch(actor, { ...input, idempotencyKey: "fixture-intent-3" }, client))
            .rejects.toMatchObject({ status: 429, code: "too_many_open_batches" });
          const quota = await client.query<{ reserved_bytes: string }>(`
            SELECT reserved_bytes FROM artifact_workspace_quotas WHERE environment_id=$1 AND workspace_id=$2`,
          [process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId]);
          expect(Number(quota.rows[0].reserved_bytes)).toBe(200);
          expect(await releaseArtifactIntentReservation(client, {
            intentId: first.intents[0].id, environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!,
            workspaceId: actor.workspaceId, terminalState: "cancelled",
          })).toBe(true);
          expect(await releaseArtifactIntentReservation(client, {
            intentId: first.intents[0].id, environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!,
            workspaceId: actor.workspaceId, terminalState: "cancelled",
          })).toBe(false);
          const after = await client.query<{ reserved_bytes: string }>(`
            SELECT reserved_bytes FROM artifact_workspace_quotas WHERE environment_id=$1 AND workspace_id=$2`,
          [process.env.TURAS_TEST_ENVIRONMENT_ID, actor.workspaceId]);
          expect(Number(after.rows[0].reserved_bytes)).toBe(100);
          expect(await releaseArtifactIntentReservation(client, {
            intentId: second.intents[0].id, environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!,
            workspaceId: actor.workspaceId, terminalState: "cancelled",
          })).toBe(true);
          const third = await createArtifactUploadBatch(actor, { ...input, idempotencyKey: "fixture-intent-3" }, client);
          expect(third.intents[0].versionId).toBeNull();
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
