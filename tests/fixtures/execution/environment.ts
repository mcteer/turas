import { Pool, type PoolClient } from "pg";
import { requireOwnedExecutionClone } from "../../../scripts/execution-eval-environment";

/** Never falls back to a configured app connection. The owning runner sets scope. */
export async function withExecutionDatabase<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireOwnedExecutionClone(), max: 5 });
  try { const db = await pool.connect(); try { return await run(db); } finally { db.release(); } }
  finally { await pool.end(); }
}
