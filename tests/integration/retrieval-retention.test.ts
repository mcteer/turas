import { describe,expect,it,vi } from "vitest";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { withTestDatabase } from "../fixtures/database";
import { runRetrievalCleanupTick } from "../../lib/server/retrieval/cleanup";

describe("bounded retrieval receipt retention",() => {
  it("removes at most 100 expired receipts per maintenance tick",async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const marker = await client.query<{ schema_version: number; environment_id: string }>(
          "SELECT schema_version,environment_id FROM turas_environment");
        expect(marker.rows[0]).toMatchObject({ schema_version: 28,
          environment_id: process.env.TURAS_TEST_ENVIRONMENT_ID });
        await client.query(`INSERT INTO retrieval_receipts
          (id,environment_id,actor_membership_id,scope,workspace_id,
           customer_id,mode,citation_ids,as_of,valid_until)
          SELECT gen_random_uuid(),$1,$2,'customer',$3,$4,'lexical_degraded',
            '[]'::jsonb,now()-interval '32 days',now()-interval '31 days'
          FROM generate_series(1,101)`,
        [marker.rows[0].environment_id,DEMO_IDS.mcteerMembership,
          DEMO_IDS.workspace,DEMO_IDS.sharedCustomer]);
        expect(Number((await client.query<{ removed: number }>(
          "SELECT turas_expire_retrieval_receipts() AS removed")).rows[0].removed)).toBe(100);
        expect(Number((await client.query<{ removed: number }>(
          "SELECT turas_expire_retrieval_receipts() AS removed")).rows[0].removed)).toBe(1);
      } finally { await client.query("ROLLBACK"); }
    });
  });
  it("removes terminal embedding receipts in bounded 30-day batches",async () => {
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID!,
      TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
          await client.query(`INSERT INTO retrieval_embedding_operations
            (id,environment_id,operation_kind,operation_key,state,
             embedding_contract,model_id,dimensions,input_characters,
             dispatched_at,completed_at,created_at)
            SELECT gen_random_uuid(),$1,'query','old-embedding-'||n,'succeeded',
              'embedding-v1','synthetic',1536,10,
              now()-interval '31 days',now()-interval '31 days',
              now()-interval '31 days' FROM generate_series(1,101) n`,[environment]);
          await client.query(`INSERT INTO retrieval_embedding_operations
            (id,environment_id,operation_kind,operation_key,state,
             embedding_contract,model_id,dimensions,input_characters,
             dispatched_at,created_at)
            VALUES(gen_random_uuid(),$1,'query','old-dispatched-embedding','dispatched',
              'embedding-v1','synthetic',1536,10,
              now()-interval '31 days',now()-interval '31 days')`,[environment]);
          await runRetrievalCleanupTick(client);
          const remaining = async () => Number((await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM retrieval_embedding_operations
            WHERE environment_id=$1 AND operation_key LIKE 'old-embedding-%'`,
          [environment])).rows[0].count);
          expect(await remaining()).toBe(1);
          await runRetrievalCleanupTick(client);
          expect(await remaining()).toBe(0);
          expect((await client.query(`SELECT 1 FROM retrieval_embedding_operations
            WHERE environment_id=$1 AND operation_key='old-dispatched-embedding'`,
          [environment])).rowCount).toBe(1);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
