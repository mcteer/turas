import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";

/** Feature-local readiness only. Runtime requests never initialize or migrate. */
export async function requireStaffingEnvironment(client: PoolClient, write: boolean): Promise<void> {
  const marker = await client.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 34) {
    throw new HttpFailure(503, "staffing_unavailable", "Staffing unavailable");
  }
  if (write && process.env.TURAS_007_DISABLED === "1") {
    throw new HttpFailure(503, "staffing_disabled", "Staffing changes are temporarily unavailable");
  }
}
