import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { passageDigest } from "../../lib/server/retrieval/chunker";
import { rankPassages } from "../../lib/server/retrieval/search";
import { authorizeRetrievalScope } from "../../lib/server/retrieval/policy";
import type { CurrentSession } from "../../lib/server/auth/sessions";

describe("retrieval ranking prefilter", () => {
  it("authorizes shared reading separately from customer partner grants", async () => {
    const config = {
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID!,
      TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    };
    for (const [key,value] of Object.entries(config)) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const workspaceId = randomUUID();
          const customerId = randomUUID();
          const principalId = randomUUID();
          const membershipId = randomUUID();
          const organizationId = randomUUID();
          const sessionId = randomUUID();
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic scope')",[workspaceId]);
          await client.query(`INSERT INTO partner_organizations(id,workspace_id,name)
            VALUES($1,$2,'Synthetic partner')`,[organizationId,workspaceId]);
          await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Scope tester')",
            [principalId,`scope-${principalId}`]);
          await client.query(`INSERT INTO memberships
            (id,principal_id,workspace_id,kind,partner_org_id,role)
            VALUES($1,$2,$3,'partner',$4,'member')`,
          [membershipId,principalId,workspaceId,organizationId]);
          await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
            VALUES($1,$2,$3,now()+interval '1 hour')`,
          [sessionId,principalId,"a".repeat(64)]);
          await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
            VALUES($1,$2,'Synthetic scoped customer',true)`,[customerId,workspaceId]);
          const actor = { sessionId,principalId,membershipId,workspaceId,kind: "partner",
            role: "member",token: "synthetic",loginName: "partner",displayName: "Partner",
            expiresAt: new Date(Date.now()+3_600_000) } as CurrentSession;
          await expect(authorizeRetrievalScope(client,actor,"shared"))
            .resolves.toMatchObject({ customerId: null,includeShared: true });
          await expect(authorizeRetrievalScope(client,actor,"customer",customerId))
            .rejects.toMatchObject({ status: 404 });
          await client.query(`INSERT INTO customer_grants
            (id,membership_id,workspace_id,customer_id,state,revision,granted_by)
            VALUES($1,$2,$3,$4,'active',1,$5)`,
          [randomUUID(),membershipId,workspaceId,customerId,principalId]);
          await expect(authorizeRetrievalScope(client,actor,"customer",customerId))
            .resolves.toMatchObject({ customerId,audience: "delivery" });
          await client.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",[sessionId]);
          await expect(authorizeRetrievalScope(client,actor,"shared"))
            .rejects.toMatchObject({ status: 401 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });

  it("does not allow a hidden higher-scoring sentinel into either ranked branch", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
        const workspace = randomUUID();
        const customer = randomUUID();
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic ranking')",[workspace]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic ranking customer',true)`,[customer,workspace]);
        const sources = [];
        for (const [text,visible] of [
          ["Synthetic cache guidance",true],
          ["cache cache cache PRIVATE_SENTINEL",false],
          ["Synthetic cache guidance",true],
        ] as const) {
          const sourceId = randomUUID();
          const revisionId = randomUUID();
          const digest = passageDigest(text);
          await client.query(`INSERT INTO retrieval_sources
            (id,environment_id,workspace_id,customer_id,scope,source_kind,
             source_revision_id,audience,projection_contract,contract_digest,
             source_generation,content_digest)
            VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal',
              'test-v1',$6,1,$7)`,
          [sourceId,environment,workspace,customer,revisionId,"a".repeat(64),digest]);
          await client.query(`INSERT INTO retrieval_passages
            (id,source_id,ordinal,passage_digest,passage_text,locators)
            VALUES($1,$2,1,$3,$4,$5)`,
          [randomUUID(),sourceId,digest,text,JSON.stringify([{ kind: "profile_field",
            fieldPath: "text" }])]);
          if (visible) sources.push({ id: sourceId,source_kind: "accepted_profile",
            source_revision_id: revisionId,source_generation: "1",audience: "internal",
            content_digest: digest,projection_contract: "test-v1" });
        }
        const results = await rankPassages(client,sources,"cache",null);
        expect(results).toHaveLength(2);
        expect(results.map((row) => row.passage_text))
          .toEqual(["Synthetic cache guidance","Synthetic cache guidance"]);
      } finally { await client.query("ROLLBACK"); }
    });
  });
});
