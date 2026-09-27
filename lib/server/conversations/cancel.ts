import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { lockOwnedBinding } from "./binding";

export async function requestCancellation(
  session: CurrentSession, nativeSessionId: string, turnId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const conversation = await client.query<{ id: string }>(`
      SELECT id FROM conversations WHERE eve_session_id = $1
        AND owner_principal_id = $2 AND environment_id = $3 LIMIT 1`,
    [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID]);
    const id = conversation.rows[0]?.id;
    if (!id) throw hiddenRecord();
    await lockOwnedBinding(client, session, id);
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
  });
}
