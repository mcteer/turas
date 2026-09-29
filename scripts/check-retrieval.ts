import { closeRuntimePool, getRuntimePool, withTransaction } from "../lib/server/db/client";
import { getServerConfig } from "../lib/server/config";
import { assertRetrievalReady,retrievalIntakeEnabled } from "../lib/server/retrieval/policy";
import { retryFailedRetrievalJob } from "../lib/server/retrieval/jobs";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length && !retrievalIntakeEnabled()) {
    console.log(JSON.stringify({ kind: "turas_retrieval_status",intakeEnabled: false }));
    return;
  }
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--retry-job" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[1])) {
      throw new Error("Expected --retry-job <job UUID>");
    }
    try {
      const retried = await withTransaction((client) => retryFailedRetrievalJob(client,args[1]));
      console.log(JSON.stringify({ kind: "turas_retrieval_retry",retried }));
      return;
    } finally { await closeRuntimePool(); }
  }
  const client = await getRuntimePool().connect();
  try {
    await assertRetrievalReady(client);
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    const jobs = await client.query<{ state: string; count: string; oldest_seconds: string | null }>(`
      SELECT state,count(*)::text AS count,
        floor(extract(epoch FROM now()-min(created_at)))::text AS oldest_seconds
      FROM retrieval_jobs WHERE environment_id=$1 GROUP BY state ORDER BY state`,
    [environmentId]);
    const operations = await client.query<{ state: string; count: string }>(`
      SELECT state,count(*)::text AS count FROM retrieval_embedding_operations
      WHERE environment_id=$1 GROUP BY state ORDER BY state`, [environmentId]);
    console.log(JSON.stringify({ kind: "turas_retrieval_status",
      intakeEnabled: true,
      jobs: jobs.rows.map((row) => ({ state: row.state,count: Number(row.count),
        oldestSeconds: Number(row.oldest_seconds ?? 0) })),
      embeddingOperations: operations.rows.map((row) => ({ state: row.state,
        count: Number(row.count) })) }));
  } finally { client.release(); await closeRuntimePool(); }
}

main().catch(() => {
  console.error("Retrieval unavailable or status check failed");
  process.exitCode = 1;
});
