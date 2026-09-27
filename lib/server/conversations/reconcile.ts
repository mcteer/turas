import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { messageDigest } from "./dispatch";
import { projectNativeEventInTransaction, type NativeEvent } from "./projection";

export type IndexedNativeEvent = { index: number; event: NativeEvent };
export type ReconcileResult = { state: "reconciled" | "uncertain" | "ambiguous"; nextIndex: number };

export async function reconcileFromEvents(
  nativeSessionId: string, attemptId: string, inputEvents: readonly IndexedNativeEvent[],
): Promise<ReconcileResult> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      conversation_id: string; dispatch_start_index: string | null; input_digest: string;
      native_turn_id: string | null; input_event_id: string | null; projection_next_index: string;
    }>(`
      SELECT a.conversation_id, a.dispatch_start_index, a.input_digest,
        a.native_turn_id, a.input_event_id, c.projection_next_index
      FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
      WHERE a.id = $1 AND c.eve_session_id = $2 AND c.environment_id = $3
      FOR UPDATE OF a, c
    `, [attemptId, nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID]);
    const row = result.rows[0];
    if (!row || row.dispatch_start_index === null) {
      throw new Error("Reserved native cursor unavailable");
    }
    const start = Number(row.dispatch_start_index);
    const events = inputEvents.filter(({ index }) => index >= start)
      .sort((a, b) => a.index - b.index);
    const uncertain = async (): Promise<ReconcileResult> => {
      await client.query(`UPDATE response_attempts SET dispatch_state = 'uncertain',
        updated_at = now(), revision = revision + 1
        WHERE id = $1 AND dispatch_state = 'dispatching'`, [attemptId]);
      return { state: "uncertain", nextIndex: Number(row.projection_next_index) };
    };
    const ambiguous = async (): Promise<ReconcileResult> => {
      await client.query(`UPDATE response_attempts SET dispatch_state = 'uncertain',
        last_error_code = 'reconcile_ambiguous', updated_at = now(), revision = revision + 1
        WHERE id = $1 AND dispatch_state IN ('dispatching','uncertain')`, [attemptId]);
      await client.query(`UPDATE watchdog_jobs SET state = 'needs_attention',
        last_error_code = 'reconcile_ambiguous', updated_at = now() WHERE attempt_id = $1`, [attemptId]);
      return { state: "ambiguous", nextIndex: Number(row.projection_next_index) };
    };
    if (!events.length) return uncertain();
    let expectedIndex = start;
    for (const item of events) {
      if (!Number.isSafeInteger(item.index) || item.index !== expectedIndex) return ambiguous();
      expectedIndex += 1;
    }
    const firstInput = events.find(({ event }) =>
      event.type === "message.received" && event.data?.kind !== "execution.background_task");
    if (!firstInput) return uncertain();
    if (typeof firstInput.event.data?.message !== "string" ||
        typeof firstInput.event.data.turnId !== "string" ||
        messageDigest(firstInput.event.data.message) !== row.input_digest ||
        (row.input_event_id && row.input_event_id !== firstInput.event.meta.id) ||
        (row.native_turn_id && row.native_turn_id !== firstInput.event.data.turnId)) {
      return ambiguous();
    }
    const turnId = firstInput.event.data.turnId;
    let nextIndex = start;
    let sawInput = false;
    for (const item of events) {
      const event = item.event;
      if (item.index < firstInput.index) {
        nextIndex = item.index + 1;
        continue;
      }
      if (event.type === "message.received" && event.data?.kind !== "execution.background_task") {
        if (sawInput) break;
        sawInput = true;
      }
      if (typeof event.data?.turnId === "string" && event.data.turnId !== turnId) break;
      await projectNativeEventInTransaction(client, nativeSessionId, attemptId, event, item.index);
      nextIndex = item.index + 1;
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) break;
    }
    await client.query(`UPDATE conversations SET projection_next_index =
      GREATEST(projection_next_index, $2), updated_at = now() WHERE id = $1`,
    [row.conversation_id, nextIndex]);
    return { state: "reconciled", nextIndex };
  });
}
