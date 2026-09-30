import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { readOwnedBinding } from "./binding";
import type { PoolClient } from "pg";

export async function requestCancellation(
  session: CurrentSession, nativeSessionId: string, turnId: string,
  existingClient?: PoolClient,
): Promise<void> {
  const run = async (client: PoolClient) => {
    const conversation = await client.query<{ id: string }>(`
      SELECT id FROM conversations WHERE eve_session_id = $1
        AND owner_principal_id = $2 AND environment_id = $3 LIMIT 1`,
    [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID]);
    const id = conversation.rows[0]?.id;
    if (!id) throw hiddenRecord();
    await readOwnedBinding(client, session, id);
    await client.query("SET LOCAL lock_timeout = '10000ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const attempt = await client.query<{ id: string; response_state: string }>(`
      SELECT id, response_state FROM response_attempts
      WHERE conversation_id = $1 AND native_turn_id = $2
        AND response_state IN ('pending','running','stopping')
      FOR UPDATE`, [id, turnId]);
    if (!attempt.rows[0]) throw new HttpFailure(409, "stale_turn", "Turn is no longer active");
    if (attempt.rows[0].response_state !== "stopping") {
      await client.query(`UPDATE response_attempts SET response_state = 'stopping',
        updated_at = now(), revision = revision + 1 WHERE id = $1`, [attempt.rows[0].id]);
    }
    // This is the first durable acknowledgement of native cancellation. Close
    // the draft in the same transaction so a late save cannot win the gap
    // before the separate drafting-status request or turn.cancelled projection.
    const marker = await client.query<{schema_version:number}>(
      "SELECT schema_version FROM turas_environment LIMIT 1");
    if ((marker.rows[0]?.schema_version ?? 0) >= 31) {
      await client.query(`UPDATE plan_drafting_attempts SET state='cancelled',
        safe_error_code='cancelled', updated_at=now()
        WHERE response_attempt_id=$1 AND state IN ('prepared','running')`,
      [attempt.rows[0].id]);
    }
  };
  if (existingClient) return run(existingClient);
  await withTransaction(run);
}
