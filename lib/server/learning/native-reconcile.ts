import { learningTransaction } from "./repository";
import { getServerConfig } from "../config";
import { hiddenRecord } from "../../contracts/http";
import { messageDigest } from "../conversations/dispatch";
import type { IndexedNativeEvent, ReconcileResult } from "../conversations/reconcile";
import { projectLearningNativeEventInTransaction } from "./native-events";

/** Metadata-only recovery. Never redispatch or recover model prose from native
 * history; unknown dispatch requires an explicit reconciled new request. */
export async function reconcileLearningNativeEvents(nativeSessionId: string, attemptId: string,
  inputEvents: readonly IndexedNativeEvent[]): Promise<ReconcileResult> {
  if(inputEvents.length>500||Buffer.byteLength(JSON.stringify(inputEvents))>2097152)throw hiddenRecord();
  return learningTransaction(async db => {
    const conversation = (await db.query(`SELECT c.id,c.projection_next_index FROM conversations c JOIN response_attempts r ON r.conversation_id=c.id
      WHERE r.id=$1 AND c.eve_session_id=$2 AND c.environment_id=$3 AND c.binding_state='bound' FOR UPDATE OF c`,
    [attemptId, nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!conversation) throw hiddenRecord();
    const row = (await db.query("SELECT * FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE", [attemptId, conversation.id])).rows[0];
    const advice = (await db.query("SELECT id FROM learning_attempts WHERE response_attempt_id=$1 AND conversation_id=$2 FOR UPDATE", [attemptId, conversation.id])).rows[0];
    if (!row || !advice || row.dispatch_start_index === null) throw hiddenRecord();
    const unsettled = async (ambiguous: boolean): Promise<ReconcileResult> => {
      await db.query(`UPDATE response_attempts SET dispatch_state='uncertain',last_error_code=$2,updated_at=clock_timestamp(),revision=revision+1
        WHERE id=$1 AND dispatch_state IN ('dispatching','uncertain')`, [attemptId, ambiguous ? "reconcile_ambiguous" : "receipt_unavailable"]);
      await db.query("UPDATE learning_attempts SET state='unconfirmed',version=version+1 WHERE id=$1 AND state IN ('prepared','running')", [advice.id]);
      return { state: ambiguous ? "ambiguous" : "uncertain", nextIndex: Number(conversation.projection_next_index) };
    };
    const start = Number(row.dispatch_start_index);
    const events = inputEvents.filter(item => item.index >= start).sort((a, b) => a.index - b.index);
    if (!events.length) return unsettled(false);
    for (let index = 0; index < events.length; index++) if (!Number.isSafeInteger(events[index]!.index) || events[index]!.index !== start + index) return unsettled(true);
    const first = events.find(item => item.event.type === "message.received" && item.event.data?.kind !== "execution.background_task");
    if (!first) return unsettled(false);
    if (typeof first.event.data?.message !== "string" || typeof first.event.data.turnId !== "string" ||
      messageDigest(first.event.data.message) !== row.input_digest || row.native_turn_id && row.native_turn_id !== first.event.data.turnId ||
      row.input_event_id && row.input_event_id !== first.event.meta.id) return unsettled(true);
    let nextIndex = first.index, sawInput = false;
    for (const item of events.filter(item => item.index >= first.index)) {
      if (item.event.data?.kind === "execution.background_task") { nextIndex = item.index + 1; continue; }
      if (item.event.type === "message.received") { if (sawInput) break; sawInput = true; }
      if (typeof item.event.data?.turnId === "string" && item.event.data.turnId !== first.event.data.turnId) break;
      if (["message.received", "step.completed", "step.failed", "turn.completed", "turn.failed", "turn.cancelled"].includes(item.event.type))
        await projectLearningNativeEventInTransaction(db, nativeSessionId, attemptId, item.event, item.index);
      nextIndex = item.index + 1;
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(item.event.type)) break;
    }
    await db.query("UPDATE conversations SET projection_next_index=GREATEST(projection_next_index,$2),updated_at=clock_timestamp() WHERE id=$1", [conversation.id, nextIndex]);
    return { state: "reconciled", nextIndex };
  });
}
