import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";

/** Service authority only changes lifecycle metadata. It does not retrieve
 * customer content, assume provider completion, or authorize another call.
 * Native terminal events can still settle usage after this deadline fence. */
export async function settleDueExecutionAdvisories(): Promise<number> {
  return withTransaction(async db => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    const marker = (await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [env])).rows[0];
    if (!marker || Number(marker.schema_version) < 38) return 0;
    const due = (await db.query(`SELECT id,conversation_id,response_attempt_id FROM execution_advice_attempts
      WHERE environment_id=$1 AND state IN ('prepared','running') AND
        (deadline_at<=clock_timestamp() OR (deadline_at IS NULL AND created_at<=clock_timestamp()-interval '5 minutes'))
      ORDER BY created_at,id LIMIT 100`, [env])).rows;
    let settled = 0;
    for (const candidate of due) {
      // Same mutex order as native release, cancellation and settlement.
      if (!(await db.query("SELECT id FROM conversations WHERE id=$1 AND environment_id=$2 FOR UPDATE SKIP LOCKED", [candidate.conversation_id, env])).rowCount) continue;
      if (candidate.response_attempt_id) await db.query("SELECT id FROM response_attempts WHERE id=$1 FOR UPDATE", [candidate.response_attempt_id]);
      const row = (await db.query(`SELECT state,dispatch_at,deadline_at,created_at,response_attempt_id,clock_timestamp() AS now
        FROM execution_advice_attempts WHERE id=$1 AND environment_id=$2 FOR UPDATE`, [candidate.id, env])).rows[0];
      if (!row || !["prepared", "running"].includes(row.state) ||
        (row.deadline_at ? row.deadline_at.getTime() > row.now.getTime() : row.created_at.getTime() + 300000 > row.now.getTime())) continue;
      const uncertain = row.dispatch_at !== null;
      await db.query(`UPDATE execution_advice_attempts SET state=$2,failure_code=$3,settled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
        [candidate.id, uncertain ? "unconfirmed" : "expired", uncertain ? "native_completion_unconfirmed" : "request_expired"]);
      // An undispatched reservation has no provider work to reconcile. A
      // dispatched response keeps its native/watchdog state until actual proof.
      if (!uncertain && row.response_attempt_id) await db.query(`UPDATE response_attempts SET response_state='failed',dispatch_state='rejected',
        last_error_code='request_expired',updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND dispatch_state='prepared'`, [row.response_attempt_id]);
      settled++;
    }
    return settled;
  });
}
