import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { passageDigest } from "../../lib/server/retrieval/chunker";
import { assertRetrievalDependenciesCurrent,
  recordRetrievalConsumption } from "../../lib/server/retrieval/fences";
import { resolveRetrievalCitation } from "../../lib/server/retrieval/citations";
import { guardNativeStream } from "../../lib/server/conversations/stream";
import { prepareAttempt } from "../../lib/server/conversations/dispatch";
import type { CurrentSession } from "../../lib/server/auth/sessions";

describe("monotonic retrieval context fence", () => {
  it("denies a prior consumed source after its accepted head is removed", async () => {
    const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: environment,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const workspace = randomUUID();
          const customer = randomUUID();
          const principal = randomUUID();
          const membership = randomUUID();
          const conversation = randomUUID();
          const record = randomUUID();
          const revision = randomUUID();
          const receipt = randomUUID();
          const citation = randomUUID();
          const projection = randomUUID();
          const passageId = randomUUID();
          const loginSession = randomUUID();
          const session = `synthetic-${randomUUID()}`;
          const digest = passageDigest("Synthetic accepted context");
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic fence')",[workspace]);
          await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Fence tester')",
            [principal,`fence-${principal}`]);
          await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
            VALUES($1,$2,$3,'internal','admin')`,[membership,principal,workspace]);
          await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
            VALUES($1,$2,'Synthetic fence customer',true)`,[customer,workspace]);
          await client.query(`INSERT INTO profile_records(id,workspace_id,customer_id,kind,created_by)
            VALUES($1,$2,$3,'claim',$4)`,[record,workspace,customer,membership]);
          await client.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual',
              'internal','internal_operations',$7)`,
          [revision,record,workspace,customer,JSON.stringify({ kind: "claim",
            text: "Synthetic accepted context",sourceType: "manual" }),membership,digest]);
          await client.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic review',$3)`,[revision,membership,randomUUID()]);
          await client.query("UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1",
            [record,revision]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             eve_session_id,creation_operation_id,binding_state,title)
            VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic fence conversation')`,
          [conversation,environment,workspace,customer,principal,session,randomUUID()]);
          await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
            VALUES($1,$2,$3,now()+interval '1 hour')`,
          [loginSession,principal,"a".repeat(64)]);
          await client.query(`UPDATE conversations SET context_snapshot_schema='customer-context-v1',
            context_login_session_id=$2,context_membership_id=$3,
            context_audience='internal',context_generation=(SELECT internal_generation
              FROM customer_profile_state WHERE customer_id=$4)
            WHERE id=$1`,[conversation,loginSession,membership,customer]);
          await client.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
            VALUES($1,'synthetic-retrieval-fence',now())`,[environment]);
          await client.query(`INSERT INTO retrieval_sources
            (id,environment_id,workspace_id,customer_id,scope,source_kind,
             source_revision_id,audience,projection_contract,contract_digest,
             source_generation,content_digest)
            VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal',
              'test-v1',$6,1,$7)`,
          [projection,environment,workspace,customer,revision,"b".repeat(64),"c".repeat(64)]);
          const locators = [{ kind: "profile_field",fieldPath: "text" }];
          await client.query(`INSERT INTO retrieval_passages
            (id,source_id,ordinal,passage_digest,passage_text,locators)
            VALUES($1,$2,1,$3,'Synthetic accepted context',$4)`,
          [passageId,projection,digest,JSON.stringify(locators)]);
          await client.query(`INSERT INTO retrieval_receipts
            (id,environment_id,actor_membership_id,scope,workspace_id,customer_id,
             mode,citation_ids,as_of,valid_until)
            VALUES($1,$2,$3,'customer',$4,$5,'lexical_degraded',$6,
              now(),now()+interval '1 hour')`,
          [receipt,environment,membership,workspace,customer,JSON.stringify([citation])]);
          await client.query(`INSERT INTO retrieval_receipt_sources
            (id,receipt_id,ordinal,source_id,passage_id,source_kind,source_revision_id,
             source_generation,passage_digest,projection_contract,locators,valid_until)
            VALUES($1,$2,1,$3,$4,'accepted_profile',$5,1,$6,'test-v1',$7,
              now()+interval '1 hour')`,
          [citation,receipt,projection,passageId,revision,digest,JSON.stringify(locators)]);
          const actor = { sessionId: loginSession,principalId: principal,
            membershipId: membership,workspaceId: workspace,kind: "internal",role: "admin",
            token: "synthetic",loginName: "mcteer",displayName: "Fence tester",
            expiresAt: new Date(Date.now()+3_600_000) } as CurrentSession;
          await recordRetrievalConsumption(client,actor,receipt,conversation);
          await recordRetrievalConsumption(client,actor,receipt,conversation);
          const dependencies = await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM session_evidence_dependencies
            WHERE conversation_id=$1`,[conversation]);
          expect(dependencies.rows[0]?.count).toBe("1");
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .resolves.toBeUndefined();
          await expect(resolveRetrievalCitation(client,actor,citation)).resolves
            .toMatchObject({ text: "Synthetic accepted context" });
          await client.query("SAVEPOINT confirmed_after_receipt");
          await client.query(`INSERT INTO evidence_conflict_targets
            (id,environment_id,scope,workspace_id,customer_id,first_kind,
             first_revision_id,second_kind,second_revision_id,period_start,period_end,
             state,rationale,updated_at)
            VALUES($1,$2,'customer',$3,$4,'accepted_profile',$5,
              'verified_research',$6,'2026-01-01','2026-12-31',
              'confirmed','Synthetic material conflict',now()+interval '1 second')`,
          [randomUUID(),environment,workspace,customer,revision,randomUUID()]);
          await expect(recordRetrievalConsumption(client,actor,receipt,conversation))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
          await expect(resolveRetrievalCitation(client,actor,citation))
            .rejects.toMatchObject({ status: 404 });
          await client.query("ROLLBACK TO SAVEPOINT confirmed_after_receipt");
          await client.query("RELEASE SAVEPOINT confirmed_after_receipt");
          await client.query("UPDATE retrieval_sources SET lifecycle_state='retired' WHERE id=$1",
            [projection]);
          await expect(recordRetrievalConsumption(client,actor,receipt,conversation))
            .rejects.toMatchObject({ status: 409 });
          await client.query("UPDATE retrieval_sources SET lifecycle_state='current' WHERE id=$1",
            [projection]);
          let native: ReadableStreamDefaultController<Uint8Array> | undefined;
          const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
            start(controller) { native = controller; },
          })),async () => {
            await assertRetrievalDependenciesCurrent(client,conversation);
            return true;
          },10_000,5_000,async (_chunk,enqueue) => {
            await assertRetrievalDependenciesCurrent(client,conversation);
            enqueue();
          });
          const reader = guarded.body!.getReader();
          native!.enqueue(new TextEncoder().encode("current claim"));
          expect(new TextDecoder().decode((await reader.read()).value)).toBe("current claim");
          await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",
            [record]);
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .rejects.toMatchObject({ status: 409 });
          native!.enqueue(new TextEncoder().encode("stale prior-turn claim"));
          expect((await reader.read()).done).toBe(true);
          await expect(prepareAttempt(actor,conversation,session,randomUUID(),
            "Follow-up about the consumed claim",[],client))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
