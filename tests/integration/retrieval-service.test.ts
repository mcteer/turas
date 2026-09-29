import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { passageDigest } from "../../lib/server/retrieval/chunker";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import type { CurrentSession } from "../../lib/server/auth/sessions";

let testClient: PoolClient;
vi.mock("../../lib/server/db/client", () => ({
  withTransaction: async <T>(run: (client: PoolClient) => Promise<T>): Promise<T> => run(testClient),
}));
import { searchEvidence } from "../../lib/server/retrieval/search";

describe("retrieval domain service", () => {
  it("returns only current authorized passages and a no-store compatible receipt", async () => {
    const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: environment,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),AI_GATEWAY_API_KEY: "",
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        testClient = client;
        await client.query("BEGIN");
        try {
          const workspace = randomUUID();
          const customer = randomUUID();
          const hiddenCustomer = randomUUID();
          const principal = randomUUID();
          const member = randomUUID();
          const session = randomUUID();
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic search')",[workspace]);
          await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Search tester')",
            [principal,`search-${principal}`]);
          await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
            VALUES($1,$2,$3,'internal','admin')`,[member,principal,workspace]);
          await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
            VALUES($1,$2,$3,now()+interval '1 hour')`,[session,principal,"b".repeat(64)]);
          for (const id of [customer,hiddenCustomer]) {
            await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
              VALUES($1,$2,'Synthetic searchable customer',true)`,[id,workspace]);
          }
          async function source(customerId: string,text: string) {
            const id = randomUUID();
            const revision = randomUUID();
            await client.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,
              canonical_location,trusted_ingest_identity)
              VALUES($1,$2,$3,'independent_research',$4,'test-ingest')`,
            [id,workspace,customerId,`https://vercel.com/docs/${id}`]);
            await client.query(`INSERT INTO evidence_source_revisions
              (id,source_id,workspace_id,customer_id,version,location,title,passage,
               supported_claim,passage_digest,retrieval_at,rights,audience,quality_input)
              VALUES($1,$2,$3,$4,1,$5,'Synthetic search doc',$6,'Synthetic cache claim',
                $7,now(),'Public documentation','internal','{}'::jsonb)`,
            [revision,id,workspace,customerId,`https://vercel.com/docs/${id}`,
              text,passageDigest(text)]);
            await client.query(`INSERT INTO research_checks
              (source_revision_id,trusted_ingest_identity,check_version,identity_result,
               scope_result,integrity_result,content_result,rationale)
              VALUES($1,'test-ingest','test-v1',true,true,true,true,'Exact synthetic')`,
            [revision]);
            await materializeCurrentProjection(client,"verified_research",revision,
              "internal",environment);
            return revision;
          }
          const visible = await source(customer,"Cache configuration is documented publicly.");
          await source(hiddenCustomer,"Cache cache cache PRIVATE_SENTINEL");
          const actor = { sessionId: session,principalId: principal,membershipId: member,
            workspaceId: workspace,kind: "internal",role: "admin",token: "synthetic",
            loginName: "mcteer",displayName: "Search tester",
            expiresAt: new Date(Date.now()+3_600_000) } as CurrentSession;
          const response = await searchEvidence(actor,{ scope: "customer",customerId: customer,
            query: "cache",use: "discovery",limit: 5 });
          expect(response.mode).toBe("lexical_degraded");
          expect(response.results).toHaveLength(1);
          expect(response.results[0].sourceRevisionId).toBe(visible);
          expect(JSON.stringify(response)).not.toContain("PRIVATE_SENTINEL");
          const receipt = await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM retrieval_receipt_sources
            WHERE receipt_id=$1`,[response.receiptId]);
          expect(receipt.rows[0]?.count).toBe("1");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
