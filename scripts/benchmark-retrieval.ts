import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { rankPassages } from "../lib/server/retrieval/search";
import { embedRetrievalTexts } from "../lib/server/retrieval/embeddings";
import { closeRuntimePool } from "../lib/server/db/client";

const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
const testDatabaseUrl = requireTestDatabaseUrl();
const live = process.argv.slice(2).join(" ") === "--live";
if (process.argv.length > 2 && !live) throw new Error("Use --live for bounded gateway timing");
if (live && !process.env.AI_GATEWAY_API_KEY) throw new Error("Gateway embedding key unavailable");
if (live) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL_UNPOOLED = testDatabaseUrl;
  process.env.TURAS_ENVIRONMENT_ID = environmentId;
}
const pool = new Pool({ connectionString: testDatabaseUrl,max: 6 });
const sourceId = randomUUID();
const vector = [1,...Array<number>(1535).fill(0)];
const vectorSql = `[${vector.join(",")}]`;
const timings: number[] = [];
const embeddingTimings: number[] = [];
const endToEndTimings: number[] = [];
let errors = 0;
let degraded = 0;
let embeddingCalls = 0;

function p95(values: number[]) {
  const ordered = [...values].sort((a,b) => a-b);
  return ordered[Math.ceil(ordered.length*0.95)-1];
}

async function read(record: boolean,index: number) {
  const requestStarted = performance.now();
  let queryVector = vector;
  if (record && live) {
    try {
      if (++embeddingCalls > 100) throw new Error("Embedding call cap exceeded");
      const embeddingStarted = performance.now();
      queryVector = (await embedRetrievalTexts([
        `Synthetic deployment build cache passage ${index+1}`]))[0];
      embeddingTimings.push(performance.now()-embeddingStarted);
    } catch { degraded += 1; errors += 1; return; }
  }
  const client = await pool.connect();
  const started = performance.now();
  try {
    await client.query("BEGIN");
    const rows = await rankPassages(client,[{
      id: sourceId,source_kind: "accepted_profile",source_revision_id: sourceId,
      source_generation: "1",audience: "internal",content_digest: "a".repeat(64),
      projection_contract: "benchmark-v1",
    }],`synthetic deployment build cache passage ${index+1}`,queryVector);
    if (!rows.length || rows.length > 60) throw new Error("Invalid ranked result");
    await client.query("COMMIT");
    if (record) {
      timings.push(performance.now()-started);
      if (live) endToEndTimings.push(performance.now()-requestStarted);
    }
  } catch {
    errors += 1;
    await client.query("ROLLBACK").catch(() => undefined);
  } finally { client.release(); }
}

try {
  const marker = await pool.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment");
  if (marker.rows.length !== 1 || marker.rows[0].environment_id !== environmentId ||
      marker.rows[0].schema_version < 28) throw new Error("Disposable 005 database required");
  await pool.query(`INSERT INTO retrieval_sources
    (id,environment_id,workspace_id,customer_id,scope,source_kind,source_revision_id,
     audience,projection_contract,contract_digest,source_generation,content_digest)
    VALUES($1,$2,$3,$4,'customer','accepted_profile',$1,'internal',
      'benchmark-v1',$5,1,$6)`,
  [sourceId,environmentId,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,
    "b".repeat(64),"a".repeat(64)]);
  const seeded = await pool.query(`INSERT INTO retrieval_passages
    (id,source_id,ordinal,passage_digest,passage_text,locators,
     embedding,embedding_state,embedding_contract,embedded_at)
    SELECT gen_random_uuid(),$1,i,
      encode(sha256(convert_to('benchmark-'||i::text,'UTF8')),'hex'),
      'Synthetic deployment build cache passage '||i::text,
      '[{"kind":"profile_field","path":"benchmark"}]'::jsonb,
      $2::public.vector,'ready','embedding-v1',now()
    FROM generate_series(1,5000) i`,[sourceId,vectorSql]);
  if (seeded.rowCount !== 5_000) throw new Error("Benchmark corpus incomplete");
  const benchmarkStarted = Date.now();
  for (let group=0;group<22;group += 1) {
    if (Date.now()-benchmarkStarted > 10*60_000) throw new Error("Benchmark deadline exceeded");
    await Promise.all(Array.from({ length: 5 },(_,reader) =>
      read(group >= 2,group*5+reader)));
  }
  const result = { corpusPassages: seeded.rowCount,readers: 5,warmup: 10,
    measured: timings.length,postEmbeddingP95Ms: Math.round(p95(timings)),errors,
    degraded,vector: live ? "gateway_live" : "deterministic_fake",
    embeddingCalls,embeddingP95Ms: live ? Math.round(p95(embeddingTimings)) : null,
    endToEndP95Ms: live ? Math.round(p95(endToEndTimings)) : null };
  console.log(JSON.stringify(result));
  if (errors || timings.length !== 100 || result.postEmbeddingP95Ms > 2_000) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Retrieval benchmark failed");
  process.exitCode = 1;
} finally {
  await pool.query("DELETE FROM retrieval_passages WHERE source_id=$1",[sourceId]).catch(() => undefined);
  await pool.query("DELETE FROM retrieval_sources WHERE id=$1",[sourceId]).catch(() => undefined);
  await pool.end();
  if (live) await closeRuntimePool();
}
