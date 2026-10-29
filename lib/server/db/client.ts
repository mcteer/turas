import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getServerConfig } from "../config";
import { HttpFailure } from "../../contracts/http";

function normalizeReplayFailure(error: unknown): unknown {
  if (error instanceof Error && "code" in error && error.code === "23514"
      && error.message === "Recovered permanent request cannot be repeated") {
    return new HttpFailure(409, "conflict", "That request was already recorded and cannot be repeated.");
  }
  return error;
}

let runtimePool: Pool | undefined;
let operationalFencePool: Pool | undefined;

function observeIdleConnectionFailures(pool: Pool): Pool {
  // pg discards an idle connection before emitting this event. Active queries
  // still reject normally; an expected database outage must not crash the host.
  pool.on("error", () => console.error("Database pool connection unavailable"));
  return pool;
}

/** One connection per process holds the collective private-IO capture fence.
 * It must not consume a runtime connection needed by the guarded work. */
export function getOperationalFencePool(): Pool {
  return operationalFencePool ??= observeIdleConnectionFailures(new Pool({
    connectionString: getServerConfig().DATABASE_URL, max: 1,
    connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
  }));
}

export function getRuntimePool(): Pool {
  if (!runtimePool) {
    const config = getServerConfig();
    runtimePool = observeIdleConnectionFailures(new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 5_000,
    }));
  }
  return runtimePool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  try { return await getRuntimePool().query<Row>(sql, [...values]); }
  catch (error) { throw normalizeReplayFailure(error); }
}

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getRuntimePool().connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw normalizeReplayFailure(error);
    }
  } finally {
    client.release();
  }
}

export async function closeRuntimePool(): Promise<void> {
  const pools = [operationalFencePool, runtimePool].filter((pool): pool is Pool => pool !== undefined);
  operationalFencePool = undefined;
  runtimePool = undefined;
  const results = await Promise.allSettled(pools.map(async pool => pool.end()));
  const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Database pool closure failed');
}
