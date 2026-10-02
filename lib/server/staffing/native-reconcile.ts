import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { hiddenRecord } from "../../contracts/http";
import { messageDigest } from "../conversations/dispatch";
import type { IndexedNativeEvent, ReconcileResult } from "../conversations/reconcile";
import { projectStaffingNativeEventInTransaction, staffingMetadataEvent } from "./native-events";
import { recordStaffingTelemetry } from "./telemetry";

/** Recovery settles only exact native association/usage/terminal metadata.
 * It never copies stored model text around the current content fence and never
 * dispatches a native request. Missing/ambiguous input remains uncertain. */
export async function reconcileStaffingNativeEvents(nativeSessionId: string, attemptId: string,
  inputEvents: readonly IndexedNativeEvent[]): Promise<ReconcileResult> {
  const started = performance.now(), usage: { inputTokens: number | null; outputTokens: number | null }[] = [];
  const result = await withTransaction(async db => {
    const conversation = (await db.query(`SELECT c.id,c.projection_next_index FROM conversations c JOIN response_attempts r ON r.conversation_id=c.id
      WHERE r.id=$1 AND c.eve_session_id=$2 AND c.environment_id=$3 AND c.binding_state='bound' FOR UPDATE OF c`,
      [attemptId, nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!conversation) throw hiddenRecord();
    const row = (await db.query(`SELECT dispatch_start_index,input_digest,native_turn_id,input_event_id,dispatch_state
      FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE`, [attemptId, conversation.id])).rows[0];
    const advice = (await db.query(`SELECT id FROM staffing_advisory_attempts WHERE response_attempt_id=$1
      AND conversation_id=$2 AND environment_id=$3 FOR UPDATE`, [attemptId, conversation.id, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!advice || !row || row.dispatch_start_index === null) throw hiddenRecord();
    const unsettled = async (ambiguous: boolean): Promise<ReconcileResult> => {
      await db.query(`UPDATE response_attempts SET dispatch_state='uncertain',last_error_code=$2,updated_at=clock_timestamp(),revision=revision+1
        WHERE id=$1 AND dispatch_state IN ('dispatching','uncertain')`, [attemptId, ambiguous ? "reconcile_ambiguous" : "receipt_unavailable"]);
      if (ambiguous) await db.query(`UPDATE watchdog_jobs SET state='needs_attention',last_error_code='reconcile_ambiguous',updated_at=clock_timestamp()
        WHERE attempt_id=$1`, [attemptId]);
      return { state: ambiguous ? "ambiguous" : "uncertain", nextIndex: Number(conversation.projection_next_index) };
    };
    const start = Number(row.dispatch_start_index);
    if (!Number.isSafeInteger(start) || start < 0) throw hiddenRecord();
    const events = inputEvents.filter(item => item.index >= start).sort((a, b) => a.index - b.index);
    if (!events.length) return unsettled(false);
    for (let i = 0; i < events.length; i++) if (!Number.isSafeInteger(events[i].index) || events[i].index !== start + i) return unsettled(true);
    const first = events.find(item => item.event.type === "message.received" && item.event.data?.kind !== "execution.background_task");
    if (!first) return unsettled(false);
    if (typeof first.event.data?.message !== "string" || typeof first.event.data.turnId !== "string" ||
      messageDigest(first.event.data.message) !== row.input_digest || row.native_turn_id && row.native_turn_id !== first.event.data.turnId ||
      row.input_event_id && row.input_event_id !== first.event.meta.id) return unsettled(true);
    const turnId = first.event.data.turnId;
    let nextIndex = first.index, sawInput = false;
    for (const item of events.filter(item => item.index >= first.index)) {
      const event = item.event;
      if (event.data?.kind === "execution.background_task") { nextIndex = item.index + 1; continue; }
      if (event.type === "message.received") {
        if (sawInput) break;
        sawInput = true;
      }
      if (typeof event.data?.turnId === "string" && event.data.turnId !== turnId) break;
      if (event.type === "message.received" || staffingMetadataEvent(event.type)) {
        const recorded = await projectStaffingNativeEventInTransaction(db, nativeSessionId, attemptId, event, item.index, null, true);
        if (recorded && recorded.usage) usage.push(recorded.usage);
      }
      nextIndex = item.index + 1;
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) break;
    }
    await db.query("UPDATE conversations SET projection_next_index=GREATEST(projection_next_index,$2),updated_at=clock_timestamp() WHERE id=$1",
      [conversation.id, nextIndex]);
    return { state: "reconciled" as const, nextIndex };
  });
  for (const counts of usage) recordStaffingTelemetry({ operation: "model", outcome: "committed", ...counts,
    durationMs: Math.min(86_400_000, Math.max(0, performance.now() - started)) });
  return result;
}
