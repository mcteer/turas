import { Pool, type PoolClient } from "pg";
import { requireOwnedExpansionClone } from "../../../scripts/expansion-eval-environment";

/** Only the owning runner may select the disposable connection. */
export async function withExpansionDatabase<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireOwnedExpansionClone(), max: 5 });
  try {
    const db = await pool.connect();
    try { return await run(db); } finally { db.release(); }
  } finally { await pool.end(); }
}
