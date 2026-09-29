import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { buildCurrentProjection, materializeCurrentProjection } from
  "../../lib/server/retrieval/projections";
import { passageDigest } from "../../lib/server/retrieval/chunker";
import { resolveRetrievalCitation } from "../../lib/server/retrieval/citations";
import type { CurrentSession } from "../../lib/server/auth/sessions";

describe("retrieval source projection", () => {
  it("excludes an internal accepted field from the delivery audience", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
        const workspaceId = randomUUID();
        const customerId = randomUUID();
        const principalId = randomUUID();
        const membershipId = randomUUID();
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic profile projection')",[workspaceId]);
        await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic reviewer')",
          [principalId,`projection-${principalId}`]);
        await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
          VALUES($1,$2,$3,'internal','admin')`,[membershipId,principalId,workspaceId]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic profile customer',true)`,[customerId,workspaceId]);
        async function accepted(text: string,audience: "internal" | "delivery") {
          const recordId = randomUUID();
          const revisionId = randomUUID();
          await client.query(`INSERT INTO profile_records
            (id,workspace_id,customer_id,kind,created_by)
            VALUES($1,$2,$3,'claim',$4)`,[recordId,workspaceId,customerId,membershipId]);
          await client.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual',$7,$8,$9)`,
          [revisionId,recordId,workspaceId,customerId,JSON.stringify({ kind: "claim",
            text,sourceType: "manual" }),membershipId,audience,
          audience === "delivery" ? "delivery_context" : "internal_operations",passageDigest(text)]);
          await client.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic exact review',$3)`,
          [revisionId,membershipId,randomUUID()]);
          await client.query(`UPDATE profile_records SET current_accepted_revision_id=$2
            WHERE id=$1`,[recordId,revisionId]);
          return revisionId;
        }
        const delivery = await accepted("Visible synthetic delivery fact","delivery");
        const hidden = await accepted("PRIVATE_INTERNAL_SENTINEL","internal");
        expect(await buildCurrentProjection(client,"accepted_profile",hidden,"delivery",environmentId))
          .toBeNull();
        expect(await materializeCurrentProjection(client,"accepted_profile",hidden,"delivery",environmentId))
          .toBeNull();
        expect(await materializeCurrentProjection(client,"accepted_profile",delivery,"delivery",environmentId))
          .toBeTruthy();
        const texts = await client.query<{ passage_text: string }>(`
          SELECT p.passage_text FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id
          WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3
            AND s.audience='delivery'`,[environmentId,workspaceId,customerId]);
        expect(texts.rows.map((row) => row.passage_text)).toEqual(["Visible synthetic delivery fact"]);
        const projection = await client.query<{ id: string; passage_id: string;
          passage_digest: string; locators: unknown; projection_contract: string }>(`
          SELECT s.id,p.id AS passage_id,p.passage_digest,p.locators,s.projection_contract
          FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
          WHERE s.source_revision_id=$1 AND s.audience='delivery'`,[delivery]);
        const row = projection.rows[0];
        const sessionId = randomUUID();
        const receiptId = randomUUID();
        const citationId = randomUUID();
        await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
          VALUES($1,$2,$3,now()+interval '1 hour')`,[sessionId,principalId,"a".repeat(64)]);
        await client.query(`INSERT INTO retrieval_receipts
          (id,environment_id,actor_membership_id,scope,workspace_id,customer_id,
           mode,citation_ids,as_of,valid_until)
          VALUES($1,$2,$3,'customer',$4,$5,'lexical_degraded',$6,now(),now()+interval '1 hour')`,
        [receiptId,environmentId,membershipId,workspaceId,customerId,JSON.stringify([citationId])]);
        await client.query(`INSERT INTO retrieval_receipt_sources
          (id,receipt_id,ordinal,source_id,passage_id,source_kind,source_revision_id,
           source_generation,passage_digest,projection_contract,locators,valid_until)
          VALUES($1,$2,1,$3,$4,'accepted_profile',$5,1,$6,$7,$8,now()+interval '1 hour')`,
        [citationId,receiptId,row.id,row.passage_id,delivery,row.passage_digest,
          row.projection_contract,JSON.stringify(row.locators)]);
        for (const [key,value] of Object.entries({
          DATABASE_URL: "postgres://localhost/turas_unused",
          DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
          TURAS_ENVIRONMENT_ID: environmentId,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
          TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
          PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
          PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
          TURAS_MAINTENANCE_SECRET: "s".repeat(32),
        })) vi.stubEnv(key,value);
        const actor = { sessionId,principalId,membershipId,workspaceId,kind: "internal",
          role: "admin",token: "synthetic",loginName: "mcteer",displayName: "Reviewer",
          expiresAt: new Date(Date.now()+3_600_000) } as CurrentSession;
        expect((await resolveRetrievalCitation(client,actor,citationId)).text)
          .toBe("Visible synthetic delivery fact");
        await client.query("UPDATE retrieval_sources SET lifecycle_state='retired' WHERE id=$1",[row.id]);
        await expect(resolveRetrievalCitation(client,actor,citationId))
          .rejects.toMatchObject({ status: 404 });
      } finally { await client.query("ROLLBACK"); vi.unstubAllEnvs(); }
    });
  });

  it("indexes only a checked research revision in separate audience copies", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
        const workspaceId = randomUUID();
        const customerId = randomUUID();
        const sourceId = randomUUID();
        const revisionId = randomUUID();
        const passage = "Synthetic public product documentation explains a cache setting.";
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic projection')",[workspaceId]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic projection customer',true)`,[customerId,workspaceId]);
        await client.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,
          canonical_location,trusted_ingest_identity)
          VALUES($1,$2,$3,'independent_research','https://vercel.com/docs/synthetic','test-ingest')`,
        [sourceId,workspaceId,customerId]);
        await client.query(`INSERT INTO evidence_source_revisions
          (id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,
           passage_digest,retrieval_at,rights,audience,quality_input)
          VALUES($1,$2,$3,$4,1,'https://vercel.com/docs/synthetic','Synthetic docs',
            $5,'Synthetic cache setting',$6,now(),'Public documentation','delivery','{}'::jsonb)`,
        [revisionId,sourceId,workspaceId,customerId,passage,passageDigest(passage)]);
        expect(await buildCurrentProjection(client,"verified_research",revisionId,"delivery",environmentId))
          .toBeNull();
        await client.query(`INSERT INTO research_checks
          (source_revision_id,trusted_ingest_identity,check_version,identity_result,
           scope_result,integrity_result,content_result,rationale)
          VALUES($1,'test-ingest','test-v1',true,true,true,true,'Exact synthetic receipt')`,
        [revisionId]);
        const delivery = await materializeCurrentProjection(client,"verified_research",
          revisionId,"delivery",environmentId);
        const internal = await materializeCurrentProjection(client,"verified_research",
          revisionId,"internal",environmentId);
        expect(delivery).toBeTruthy();
        expect(internal).toBeTruthy();
        expect(delivery).not.toBe(internal);
        const rows = await client.query<{ audience: string; passage_text: string }>(`
          SELECT s.audience,p.passage_text FROM retrieval_sources s
          JOIN retrieval_passages p ON p.source_id=s.id
          WHERE s.source_revision_id=$1 ORDER BY s.audience`,[revisionId]);
        expect(rows.rows).toEqual([
          { audience: "delivery",passage_text: passage },
          { audience: "internal",passage_text: passage },
        ]);
      } finally { await client.query("ROLLBACK"); }
    });
  });
});
