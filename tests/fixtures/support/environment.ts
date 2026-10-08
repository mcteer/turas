import { Pool, type PoolClient } from "pg";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";

/** Only the owning runner may select the disposable connection. */
export async function withSupportDatabase<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireOwnedSupportClone(), max: 5 });
  try {
    const db = await pool.connect();
    try { return await run(db); } finally { db.release(); }
  } finally { await pool.end(); }
}
