import { assertDatabaseEnvironment } from "../../../../lib/server/db/readiness";
import { failure, success } from "../../../../lib/contracts/http";
import { query } from "../../../../lib/server/db/client";
import { getServerConfig } from "../../../../lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await assertDatabaseEnvironment(6);
    const worker = await query(`SELECT 1 FROM maintenance_workers
      WHERE environment_id = $1 AND last_seen_at >= now() - interval '15 seconds' LIMIT 1`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    if (!worker.rowCount) throw new Error("Maintenance unavailable");
    return success({ ready: true });
  } catch {
    return failure(new Error("unavailable"));
  }
}
