import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { createArtifactDatabaseFixture } from "../fixtures/artifact-database";
import { DEMO_IDS } from "../fixtures/identities";
import { createArtifactSelection } from "../../lib/server/artifacts/selections";
import { retireArtifactVersion } from "../../lib/server/artifacts/lifecycle";
import { claimArtifactCleanup, runArtifactCleanup } from "../../lib/server/artifacts/cleanup";
import { closeRuntimePool, query } from "../../lib/server/db/client";
import { authorizeNativeRetirement, processNativeRetirement,
  signNativeRetirement } from "../../lib/server/artifacts/native-retirement";

describe("artifact physical cleanup", () => {
  it("purges the original and app-owned payloads, then converges to deleted", async () => {
    const prior = { database: process.env.DATABASE_URL, environment: process.env.TURAS_ENVIRONMENT_ID,
      root: process.env.TURAS_ARTIFACT_STORE_ROOT };
    const root = await mkdtemp(join(tmpdir(),"turas-004-cleanup-"));
    await chmod(root,0o700);
    await writeFile(join(root,".turas-artifact-store.json"),JSON.stringify({
      environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID }),{ mode: 0o600 });
    await mkdir(join(root,"objects"),{ mode: 0o700 });
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    process.env.TURAS_ARTIFACT_STORE_ROOT = root;
    let fixture: Awaited<ReturnType<typeof createArtifactDatabaseFixture>> | null = null;
    let sessionId: string | null = null;
    let objectKey: string | null = null;
    const nativeSessionId = `wrun_${randomUUID().replaceAll("-","")}`;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client,"panel");
          sessionId = actor.sessionId;
          fixture = await createArtifactDatabaseFixture(client,actor,DEMO_IDS.sharedCustomer);
          const source = fixture;
          const unitId = randomUUID();
          const excerpt = "Synthetic purge passage";
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
          await createArtifactSelection(actor,{ versionId: source.versionId,runId: source.runId,
            lifecycleGeneration: 1,ranges: [{ unitId,start: 0,end: Array.from(excerpt).length }],
            excerpt,excerptDigest: createHash("sha256").update(excerpt).digest("hex"),
            audience: "internal",dataCategory: "other_internal" },client);
          await client.query(`UPDATE conversations SET binding_state='bound',eve_session_id=$2
            WHERE id=$1`,[source.conversationId,nativeSessionId]);
          for (const [eventType,message] of [["message.received","Owner text retained"],
            ["message.completed","Generated source text purged"]] as const) {
            await client.query(`INSERT INTO event_projections
              (native_event_id,conversation_id,native_session_id,event_type,visible_payload,emitted_at)
              VALUES($1,$2,$3,$4,$5,now())`,
            [randomUUID(),source.conversationId,nativeSessionId,eventType,JSON.stringify({ message })]);
          }
          await client.query(`INSERT INTO conversation_artifact_dependencies
            (conversation_id,version_id,run_id,environment_id,workspace_id,customer_id,
             owner_principal_id,lifecycle_generation) VALUES($1,$2,$3,$4,$5,$6,$7,1)`,
          [source.conversationId,source.versionId,source.runId,
            process.env.TURAS_TEST_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,
            actor.principalId]);
          const row = await client.query<{ object_key: string }>(
            "SELECT object_key FROM artifact_versions WHERE id=$1", [source.versionId]);
          objectKey = row.rows[0].object_key;
          const receipt = await retireArtifactVersion(actor,source.versionId,{ action: "delete",
            expectedGeneration: 1,reason: "Synthetic cleanup verification",
            idempotencyKey: "cleanup-fixture" },client);
          expect(receipt.state).toBe("deleting");
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      await writeFile(join(root,"objects",objectKey!),"Synthetic artifact",{ mode: 0o600 });
      process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
      const signed = signNativeRetirement(nativeSessionId,fixture!.versionId,2);
      const retirementRequest = new Request(`http://127.0.0.1/eve/v1/session/${nativeSessionId}/reset`,
        { method: "POST",headers: signed });
      expect(await authorizeNativeRetirement(retirementRequest,nativeSessionId)).toBeTruthy();
      expect(await authorizeNativeRetirement(retirementRequest,`${nativeSessionId}wrong`)).toBeNull();
      const priorOrigin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
      delete process.env.TURAS_EVE_INTERNAL_ORIGIN;
      try { expect(await processNativeRetirement()).toBe(true); }
      finally { process.env.TURAS_EVE_INTERNAL_ORIGIN = priorOrigin; }
      let failedOriginalOnce = false;
      let replayedJob: Awaited<ReturnType<typeof claimArtifactCleanup>> = null;
      for (let count=0; count<10; count += 1) {
        const job = await claimArtifactCleanup();
        if (!job) break;
        if (job.target_kind === "original" && !failedOriginalOnce) {
          process.env.TURAS_ARTIFACT_STORE_ROOT = join(root,"missing-store");
          await runArtifactCleanup(job);
          process.env.TURAS_ARTIFACT_STORE_ROOT = root;
          const retry = await query<{ state: string }>(
            "SELECT state FROM artifact_cleanup_jobs WHERE id=$1",[job.id]);
          expect(retry.rows[0].state).toBe("retry");
          await query("UPDATE artifact_cleanup_jobs SET next_attempt_at=now() WHERE id=$1",
            [job.id]);
          failedOriginalOnce = true;
          continue;
        }
        await runArtifactCleanup(job);
        replayedJob = job;
      }
      expect(failedOriginalOnce).toBe(true);
      if (replayedJob) await runArtifactCleanup(replayedJob);
      await closeRuntimePool();
      process.env.DATABASE_URL = prior.database;
      await withTestDatabase(async (client) => {
        const version = await client.query<{ state: string }>(
          "SELECT state FROM artifact_versions WHERE id=$1", [fixture!.versionId]);
        expect(version.rows[0].state).toBe("deleted");
        const unit = await client.query<{ text: string | null }>(
          "SELECT text FROM artifact_extraction_units WHERE version_id=$1", [fixture!.versionId]);
        expect(unit.rows[0].text).toBeNull();
        const payload = await client.query("SELECT 1 FROM artifact_evidence_payloads p JOIN artifact_evidence_selections s ON s.id=p.selection_id WHERE s.version_id=$1", [fixture!.versionId]);
        expect(payload.rowCount).toBe(0);
        const events = await client.query<{ event_type: string; visible_payload: { message: string } }>(
          "SELECT event_type,visible_payload FROM event_projections WHERE conversation_id=$1",
          [fixture!.conversationId]);
        expect(events.rows).toContainEqual({ event_type: "message.received",
          visible_payload: { message: "Owner text retained" } });
        expect(JSON.stringify(events.rows)).not.toContain("Generated source text purged");
        const title = await client.query<{ title: string }>(
          "SELECT title FROM conversations WHERE id=$1",[fixture!.conversationId]);
        expect(title.rows[0].title).toBe("Previous conversation");
      });
      await expect(stat(join(root,"objects",objectKey!))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await closeRuntimePool();
      process.env.DATABASE_URL = prior.database;
      if (fixture) await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const source = fixture!;
          await client.query("DELETE FROM artifact_native_retirement_receipts WHERE version_id=$1",[source.versionId]);
          await client.query("ALTER TABLE conversation_artifact_dependencies DISABLE TRIGGER artifact_dependency_append_only");
          await client.query("DELETE FROM conversation_artifact_dependencies WHERE version_id=$1",[source.versionId]);
          await client.query("ALTER TABLE conversation_artifact_dependencies ENABLE TRIGGER artifact_dependency_append_only");
          await client.query("DELETE FROM artifact_cleanup_jobs WHERE version_id=$1", [source.versionId]);
          await client.query("DELETE FROM artifact_lifecycle_events WHERE version_id=$1", [source.versionId]);
          await client.query("DELETE FROM artifact_evidence_payloads WHERE selection_id IN (SELECT id FROM artifact_evidence_selections WHERE version_id=$1)", [source.versionId]);
          await client.query("DELETE FROM artifact_evidence_selections WHERE version_id=$1", [source.versionId]);
          await client.query("DELETE FROM artifact_extraction_units WHERE version_id=$1", [source.versionId]);
          await client.query("DELETE FROM artifact_extraction_runs WHERE version_id=$1", [source.versionId]);
          const intent = await client.query<{ id: string; batch_id: string; expected_size_bytes: string }>(
            "SELECT id,batch_id,expected_size_bytes FROM artifact_upload_intents WHERE version_id=$1", [source.versionId]);
          if (intent.rows[0]) {
            await client.query(`UPDATE artifact_workspace_quotas SET committed_bytes=committed_bytes-$3
              WHERE environment_id=$1 AND workspace_id=$2`,
            [process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace,Number(intent.rows[0].expected_size_bytes)]);
            await client.query("DELETE FROM artifact_upload_intents WHERE id=$1", [intent.rows[0].id]);
            await client.query("DELETE FROM artifact_upload_batches WHERE id=$1", [intent.rows[0].batch_id]);
          }
          const parent = await client.query<{ artifact_id: string }>(
            "SELECT artifact_id FROM artifact_versions WHERE id=$1", [source.versionId]);
          await client.query("DELETE FROM artifact_versions WHERE id=$1", [source.versionId]);
          if (parent.rows[0]) await client.query("DELETE FROM artifacts WHERE id=$1", [parent.rows[0].artifact_id]);
          await client.query("DELETE FROM event_projections WHERE conversation_id=$1",[source.conversationId]);
          await client.query("DELETE FROM conversations WHERE id=$1", [source.conversationId]);
          if (sessionId) await client.query("DELETE FROM login_sessions WHERE id=$1", [sessionId]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      process.env.DATABASE_URL = prior.database;
      process.env.TURAS_ENVIRONMENT_ID = prior.environment;
      process.env.TURAS_ARTIFACT_STORE_ROOT = prior.root;
      await rm(root,{ recursive: true,force: true });
    }
  });
});
