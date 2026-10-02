import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { requireStaffingEnvironment } from "./repository";
import { recordStaffingTelemetry } from "./telemetry";

/** Environment-scoped maintenance authority. The request deadline closes reads
 * independently; this bounded settlement records uncertainty without another
 * paid call, source retrieval, or changes to staffing commitments. */
export async function settleDueStaffingAdvisories() {
  const started = Date.now();
  try {
    const count = await withTransaction(async db => {
      await requireStaffingEnvironment(db, false);
      const env = getServerConfig().TURAS_ENVIRONMENT_ID;
      const due = (await db.query(`SELECT id,dispatch_at,response_attempt_id FROM staffing_advisory_attempts
        WHERE environment_id=$1 AND state IN ('prepared','running') AND
          (deadline_at<=clock_timestamp() OR (deadline_at IS NULL AND created_at<=clock_timestamp()-interval '5 minutes'))
        ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`, [env])).rows;
      for (const row of due) {
        const uncertain = row.dispatch_at !== null || row.response_attempt_id !== null;
        await db.query(`UPDATE staffing_advisory_attempts SET state=$2,failure_code=$3,
          settled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
          [row.id, uncertain ? "unconfirmed" : "expired", uncertain ? "native_completion_unconfirmed" : "request_expired"]);
      }
      return due.length;
    });
    recordStaffingTelemetry({ operation: "advisory", outcome: "committed", count, durationMs: Math.min(86_400_000, Date.now() - started) });
    return count;
  } catch (error) {
    recordStaffingTelemetry({ operation: "advisory", outcome: "failed", durationMs: Math.min(86_400_000, Date.now() - started) });
    throw error;
  }
}
