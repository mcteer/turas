import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { enqueueRetrievalJob, claimRetrievalJobs, finishRetrievalJob,
  renewRetrievalLease, reserveEmbeddingOperation, markEmbeddingDispatched,
  finishEmbeddingOperation, retryFailedRetrievalJob } from "../../lib/server/retrieval/jobs";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

describe("retrieval lease compare-and-swap", () => {
  it("reserves one paid operation and refuses conflicting replay or redispatch", async () => {
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
          const input = { jobId: null,operationKey: randomUUID(),
            inputCharacters: 12,modelId: "openai/text-embedding-3-small" };
          const first = await reserveEmbeddingOperation(client,input);
          expect(first.state).toBe("reserved");
          expect(await reserveEmbeddingOperation(client,input)).toEqual(first);
          await expect(reserveEmbeddingOperation(client,{ ...input,inputCharacters: 13 }))
            .rejects.toThrow("different input");
          expect(await markEmbeddingDispatched(client,first.id)).toBe(true);
          expect(await markEmbeddingDispatched(client,first.id)).toBe(false);
          expect(await finishEmbeddingOperation(client,first.id,"succeeded")).toBe(true);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });

  it("claims only current exact generation and refuses a stale commit", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
        const workspaceId = randomUUID();
        const customerId = randomUUID();
        const sourceId = randomUUID();
        const revisionId = randomUUID();
        const contractDigest = "a".repeat(64);
        // Other disposable fixtures may leave real queued work behind. Hide it
        // only for this rolled-back transaction so this claim is deterministic.
        await client.query(`UPDATE retrieval_jobs SET state='failed'
          WHERE environment_id=$1 AND (state='queued' OR
            (state='leased' AND lease_until<=now()))`,[environmentId]);
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic retrieval jobs')",[workspaceId]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic retrieval customer',true)`, [customerId,workspaceId]);
        await client.query(`INSERT INTO retrieval_sources
          (id,environment_id,workspace_id,customer_id,scope,source_kind,source_revision_id,
           audience,projection_contract,contract_digest,source_generation,content_digest)
          VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal','test-v1',$6,1,$7)`,
        [sourceId,environmentId,workspaceId,customerId,revisionId,contractDigest,"b".repeat(64)]);
        expect(await enqueueRetrievalJob(client,sourceId,"index",environmentId)).toBeTruthy();
        const [claim] = await claimRetrievalJobs(1,client,environmentId);
        expect(claim).toMatchObject({ sourceId,generation: 1,attempt: 1,kind: "index" });
        expect(await renewRetrievalLease(client,claim)).toBe(true);
        await client.query(`UPDATE retrieval_sources SET source_generation=2 WHERE id=$1`,[sourceId]);
        expect(await finishRetrievalJob(client,claim,"completed")).toBe(false);
        await client.query(`UPDATE retrieval_sources SET source_generation=1 WHERE id=$1`,[sourceId]);
        await client.query(`INSERT INTO retrieval_embedding_operations
          (id,environment_id,job_id,operation_kind,operation_key,state,
           embedding_contract,model_id,dimensions,input_characters,dispatched_at)
          VALUES($1,$2,$3,'index','synthetic-ambiguous','dispatched',
            'embedding-v1','openai/text-embedding-3-small',1536,10,now())`,
        [randomUUID(),environmentId,claim.id]);
        await client.query(`UPDATE retrieval_jobs SET lease_started_at=now()-interval '60 seconds',
          lease_until=now()-interval '30 seconds' WHERE id=$1`,[claim.id]);
        expect(await claimRetrievalJobs(1,client,environmentId)).toEqual([]);
        const state = await client.query<{ state: string }>(
          "SELECT state FROM retrieval_jobs WHERE id=$1",[claim.id]);
        expect(state.rows[0]?.state).toBe("unconfirmed");
      } finally { await client.query("ROLLBACK"); }
    });
  });

  it("retries only a current original with budget and no ambiguous paid operation",async () => {
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
          const record = randomUUID();
          const revision = randomUUID();
          const source = randomUUID();
          const job = randomUUID();
          await client.query(`INSERT INTO profile_records
            (id,workspace_id,customer_id,kind,created_by)
            VALUES($1,$2,$3,'claim',$4)`,
          [record,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,DEMO_IDS.mcteerMembership]);
          await client.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual',
              'internal','internal_operations',$7)`,
          [revision,record,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,
            JSON.stringify({ kind: "claim",text: "Synthetic retry source",sourceType: "manual" }),
            DEMO_IDS.mcteerMembership,"a".repeat(64)]);
          await client.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic review',$3)`,
          [revision,DEMO_IDS.mcteerMembership,randomUUID()]);
          await client.query(`UPDATE profile_records SET current_accepted_revision_id=$2
            WHERE id=$1`,[record,revision]);
          await client.query(`INSERT INTO retrieval_sources
            (id,environment_id,workspace_id,customer_id,scope,source_kind,
             source_revision_id,audience,projection_contract,contract_digest,
             source_generation,content_digest)
            VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal',
              'test-v1',$6,1,$7)`,
          [source,process.env.TURAS_TEST_ENVIRONMENT_ID,DEMO_IDS.workspace,
            DEMO_IDS.sharedCustomer,revision,"b".repeat(64),"c".repeat(64)]);
          await client.query(`INSERT INTO retrieval_jobs
            (id,environment_id,source_id,source_generation,contract_digest,
             kind,state,attempts,last_error_code)
            VALUES($1,$2,$3,1,$4,'index','failed',1,'temporary_failure')`,
          [job,process.env.TURAS_TEST_ENVIRONMENT_ID,source,"b".repeat(64)]);
          expect(await retryFailedRetrievalJob(client,job)).toBe(true);
          expect((await client.query<{ state: string }>(`
            SELECT state FROM retrieval_jobs WHERE id=$1`,[job])).rows[0].state).toBe("queued");
          await client.query(`UPDATE retrieval_jobs SET state='failed' WHERE id=$1`,[job]);
          await client.query(`UPDATE profile_records SET current_accepted_revision_id=NULL
            WHERE id=$1`,[record]);
          expect(await retryFailedRetrievalJob(client,job)).toBe(false);
          await client.query(`UPDATE profile_records SET current_accepted_revision_id=$2
            WHERE id=$1`,[record,revision]);
          await client.query(`UPDATE retrieval_jobs SET attempts=3 WHERE id=$1`,[job]);
          expect(await retryFailedRetrievalJob(client,job)).toBe(false);
          await client.query(`UPDATE retrieval_jobs SET attempts=1 WHERE id=$1`,[job]);
          await client.query(`INSERT INTO retrieval_embedding_operations
            (id,environment_id,job_id,operation_kind,operation_key,state,
             embedding_contract,model_id,dimensions,input_characters,dispatched_at)
            VALUES($1,$2,$3,'index',$4,'unconfirmed','embedding-v1',
              'synthetic',1536,10,now())`,
          [randomUUID(),process.env.TURAS_TEST_ENVIRONMENT_ID,job,randomUUID()]);
          expect(await retryFailedRetrievalJob(client,job)).toBe(false);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
