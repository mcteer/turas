import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { assertArtifactDependenciesCurrent } from "../../lib/server/artifacts/context-fence";
import { projectNativeEventInTransaction } from "../../lib/server/conversations/projection";

// The monotonic dependency applies to every subsequent turn and output boundary.
describe("artifact conversation fence", () => {
  it("invalidates a consumed source after withdrawal, even without a new selection", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client,"panel");
          const source = await createArtifactDatabaseFixture(client,actor,DEMO_IDS.sharedCustomer);
          await client.query(`UPDATE artifact_extraction_runs SET state='published',
            scan_receipt='{}',coverage='{"total":1,"visited":1,"omitted":[]}',
            manifest_digest=$2,published_at=now() WHERE id=$1`,
          [source.runId,source.originalDigest]);
          await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1", [source.versionId]);
          await client.query("UPDATE artifact_versions SET state='ready' WHERE id=$1", [source.versionId]);
          await client.query(`INSERT INTO conversation_artifact_dependencies
            (conversation_id,version_id,run_id,environment_id,workspace_id,customer_id,
             owner_principal_id,lifecycle_generation)
            VALUES($1,$2,$3,$4,$5,$6,$7,1)`,
          [source.conversationId,source.versionId,source.runId,process.env.TURAS_TEST_ENVIRONMENT_ID,
            actor.workspaceId,DEMO_IDS.sharedCustomer,actor.principalId]);
          await expect(assertArtifactDependenciesCurrent(client,source.conversationId)).resolves.toBeUndefined();
          const later = await createArtifactDatabaseFixture(client,actor,DEMO_IDS.sharedCustomer);
          await client.query(`UPDATE artifact_extraction_runs SET state='published',
            scan_receipt='{}',coverage='{"total":1,"visited":1,"omitted":[]}',
            manifest_digest=$2,published_at=now() WHERE id=$1`,
          [later.runId,later.originalDigest]);
          await client.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[later.versionId]);
          await client.query("UPDATE artifact_versions SET state='ready' WHERE id=$1",[later.versionId]);
          await client.query(`INSERT INTO conversation_artifact_dependencies
            (conversation_id,version_id,run_id,environment_id,workspace_id,customer_id,
             owner_principal_id,lifecycle_generation) VALUES($1,$2,$3,$4,$5,$6,$7,1)`,
          [source.conversationId,later.versionId,later.runId,
            process.env.TURAS_TEST_ENVIRONMENT_ID,actor.workspaceId,
            DEMO_IDS.sharedCustomer,actor.principalId]);
          await expect(assertArtifactDependenciesCurrent(client,source.conversationId)).resolves.toBeUndefined();
          await client.query(`UPDATE artifact_versions SET state='withdrawn',
            lifecycle_generation=2 WHERE id=$1`, [source.versionId]);
          await expect(assertArtifactDependenciesCurrent(client,source.conversationId))
            .rejects.toMatchObject({ status: 409, code: "artifact_context_changed" });
          const nativeId = `wrun_${randomUUID().replaceAll("-","")}`;
          const messageId = randomUUID();
          const attemptId = randomUUID();
          await client.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",
            [source.conversationId,nativeId]);
          await client.query(`INSERT INTO submitted_messages
            (id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)`,
          [messageId,source.conversationId,randomUUID(),"a".repeat(64),"Owner question"]);
          await client.query(`INSERT INTO response_attempts
            (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
            VALUES($1,$2,$3,$4,'dispatching','running')`,
          [attemptId,source.conversationId,messageId,"a".repeat(64)]);
          await expect(projectNativeEventInTransaction(client,nativeId,attemptId,{
            type: "message.completed",data: { turnId: "turn_late",message: "Stale output" },
            meta: { id: `evt_${randomUUID()}`,at: new Date().toISOString() },
          })).rejects.toMatchObject({ status: 409,code: "artifact_context_changed" });
          const unrelated = randomUUID();
          await expect(assertArtifactDependenciesCurrent(client,unrelated)).resolves.toBeUndefined();
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
