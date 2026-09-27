import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getServerConfig } from "../config";

let runtimePool: Pool | undefined;

export function getRuntimePool(): Pool {
  if (!runtimePool) {
    const config = getServerConfig();
    runtimePool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 5_000,
    });
  }
  return runtimePool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getRuntimePool().query<Row>(sql, [...values]);
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
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function closeRuntimePool(): Promise<void> {
  if (runtimePool) {
    const pool = runtimePool;
    runtimePool = undefined;
    await pool.end();
  }
}
