import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";

export async function requireExecutionEnvironment(db: PoolClient, write = false): Promise<void> {
  const marker = await db.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
    marker.rows[0].schema_version < 37) throw new HttpFailure(503, "schema_unavailable", "Execution unavailable");
  if (write && process.env.TURAS_008_DISABLED === "1")
    throw new HttpFailure(503, "feature_disabled", "New execution work is temporarily unavailable");
}
