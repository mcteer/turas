import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { canonicalArtifactSendDigest, captureArtifactDraft,
  readCurrentArtifactDraft } from "../../lib/server/artifacts/context";
import { messageDigest } from "../../lib/server/conversations/dispatch";

describe("selected artifact draft context", () => {
  it("keeps source text out of native messages and fences it on withdrawal", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client,"panel");
          const source = await createArtifactDatabaseFixture(client,actor,DEMO_IDS.sharedCustomer);
          const excerpt = "Synthetic source passage";
          const unitId = randomUUID();
          await client.query(`UPDATE artifact_extraction_runs SET state='published',
            scan_receipt='{}',coverage='{"total":1,"visited":1,"omitted":[]}',
            manifest_digest=$2,published_at=now() WHERE id=$1`, [source.runId,source.originalDigest]);
          await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1", [source.versionId]);
          await client.query("UPDATE artifact_versions SET state='ready' WHERE id=$1", [source.versionId]);
          await client.query(`INSERT INTO artifact_extraction_units
            (id,run_id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,
             ordinal,locator,text,origin)
            VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,'native')`,
          [unitId,source.runId,source.versionId,process.env.TURAS_TEST_ENVIRONMENT_ID,
            actor.workspaceId,DEMO_IDS.sharedCustomer,actor.principalId,
            JSON.stringify({ kind: "txt",lineStart: 1,lineEnd: 1 }),excerpt]);
          await client.query(`INSERT INTO conversation_artifact_refs
            (id,conversation_id,version_id,environment_id,workspace_id,customer_id,owner_principal_id)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(),source.conversationId,source.versionId,process.env.TURAS_TEST_ENVIRONMENT_ID,
            actor.workspaceId,DEMO_IDS.sharedCustomer,actor.principalId]);
          const text = "Please discuss the selected passage.";
          const selection = { versionId: source.versionId,runId: source.runId,lifecycleGeneration: 1,
            ranges: [{ unitId,start: 0,end: Array.from(excerpt).length }] };
          const nativeDigest = messageDigest(text);
          const requestDigest = canonicalArtifactSendDigest(text,[selection]);
          expect(requestDigest).not.toBe(nativeDigest);
          expect(canonicalArtifactSendDigest(text,[{ ...selection,
            ranges: [{ ...selection.ranges[0],end: 9 }] }])).not.toBe(requestDigest);
          const messageId = randomUUID();
          const attemptId = randomUUID();
          await client.query(`INSERT INTO submitted_messages
            (id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)`,
          [messageId,source.conversationId,randomUUID(),requestDigest,text]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'prepared','pending')`,
          [attemptId,source.conversationId,messageId,requestDigest]);
          await captureArtifactDraft(client,actor,source.conversationId,DEMO_IDS.sharedCustomer,
            attemptId,nativeDigest,requestDigest,[selection]);
          const draft = await readCurrentArtifactDraft(client,attemptId,actor.principalId);
          expect(draft?.envelope).toContain(excerpt);
          expect(JSON.parse(draft!.envelope).sources[0].ranges).toEqual(selection.ranges);
          expect(draft?.digest).toBe(createHash("sha256").update(draft!.envelope).digest("hex"));
          const native = await client.query<{ text: string }>(
            "SELECT text FROM submitted_messages WHERE id=$1", [messageId]);
          expect(native.rows[0].text).toBe(text);
          expect(native.rows[0].text).not.toContain(excerpt);
          await client.query(`UPDATE artifact_versions SET state='withdrawn',
            lifecycle_generation=2 WHERE id=$1`, [source.versionId]);
          await expect(readCurrentArtifactDraft(client,attemptId,actor.principalId))
            .rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
