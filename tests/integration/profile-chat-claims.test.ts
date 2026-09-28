import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../fixtures/identities";
import { submitProfileCommand } from "../../lib/server/profiles/service";

describe("owned chat claim lineage", () => {
  it("stores only a verified owner span with a Pending claim", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await createProfileTestSession(client, "panel");
          const partner = await createProfileTestSession(client, "partner");
          const conversationId = randomUUID();
          const messageId = randomUUID();
          const original = "Our synthetic site has a review queue; private staffing discussion stays private.";
          const span = "Our synthetic site has a review queue";
          const spanDigest = createHash("sha256").update(span).digest("hex");
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,
             binding_state,title) VALUES ($1,$2,$3,$4,$5,$6,'unbound','Synthetic conversation')`,
          [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, panel.workspaceId,
            DEMO_IDS.sharedCustomer, panel.principalId, randomUUID()]);
          await client.query(`INSERT INTO submitted_messages
            (id,conversation_id,request_key,body_digest,text) VALUES ($1,$2,$3,$4,$5)`,
          [messageId, conversationId, randomUUID(),
            createHash("sha256").update(original).digest("hex"), original]);
          const payload = { kind: "claim", text: "Edited synthetic claim for review",
            sourceType: "manual", sourceMessageId: messageId, sourceExcerpt: span,
            sourceSpanDigest: spanDigest };
          await expect(submitProfileCommand(partner, DEMO_IDS.sharedCustomer,
            { requestKey: randomUUID(), action: "propose_record", payload,
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client))
            .rejects.toMatchObject({ status: 404 });
          await expect(submitProfileCommand(panel, DEMO_IDS.sharedCustomer,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { ...payload, sourceExcerpt: "private context not in the message" },
              requestedAudience: "internal", dataCategory: "other_internal" }, client))
            .rejects.toMatchObject({ status: 422 });
          const inventedSpan = "invented account history";
          await expect(submitProfileCommand(panel, DEMO_IDS.sharedCustomer,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { ...payload, sourceExcerpt: inventedSpan,
                sourceSpanDigest: createHash("sha256").update(inventedSpan).digest("hex") },
              requestedAudience: "internal", dataCategory: "other_internal" }, client))
            .rejects.toMatchObject({ status: 404 });
          const proposal = await submitProfileCommand(panel, DEMO_IDS.sharedCustomer,
            { requestKey: randomUUID(), action: "propose_record", payload,
              requestedAudience: "internal", dataCategory: "other_internal" }, client) as {
            revisionId: string; reviewState: string };
          expect(proposal.reviewState).toBe("pending");
          const lineage = await client.query<{ span_digest: string; message_id: string }>(
            "SELECT span_digest,message_id FROM profile_private_lineage WHERE profile_revision_id=$1",
            [proposal.revisionId]);
          expect(lineage.rows[0]).toEqual({ span_digest: spanDigest, message_id: messageId });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
});
