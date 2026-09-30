import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { messageDigest } from "./dispatch";
import { artifactContextSchemaReady, assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { reconcilePlanModelEvent } from "../plans/model-budget";
import { planningScopeForConversation } from "../plans/context";
import { assertPlanConversationFence } from "../plans/fences";
import { boundToolActor } from "../profiles/tool-actor";

export type NativeEvent = {
  type: string;
  data?: Record<string, unknown>;
  meta: { id?: string; at?: string };
};

const visibleTypes = new Set([
  "message.received", "message.appended", "message.completed", "step.completed",
  "step.failed", "turn.completed", "turn.failed", "turn.cancelled",
]);

function visiblePayload(event: NativeEvent): Record<string, unknown> {
  const data = event.data ?? {};
  switch (event.type) {
    case "message.received": return { message: data.message };
    case "message.appended": return { messageDelta: data.messageDelta };
    case "message.completed": return { message: data.message, finishReason: data.finishReason };
    case "step.completed": return { usage: data.usage ?? null };
    case "step.failed":
    case "turn.failed": {
      const details=typeof data.details==="object" && data.details!==null ?
        data.details as Record<string,unknown>:null;
      const semanticErrorId=details && typeof details.semanticErrorId==="string" &&
        /^[a-z0-9-]{1,80}$/.test(details.semanticErrorId) ? details.semanticErrorId:null;
      return { code: data.code ?? "native_failure",semanticErrorId };
    }
    default: return {};
  }
}

export async function projectNativeEvent(
  nativeSessionId: string, attemptId: string, event: NativeEvent, streamIndex?: number,
): Promise<void> {
  return withTransaction((client) =>
    projectNativeEventInTransaction(client, nativeSessionId, attemptId, event, streamIndex));
}

export async function projectNativeEventInTransaction(
  client: PoolClient, nativeSessionId: string, attemptId: string,
  event: NativeEvent, streamIndex?: number,
): Promise<void> {
  if (!visibleTypes.has(event.type)) return;
  if (!event.meta.id?.startsWith("evt_") || !event.meta.at ||
      !Number.isFinite(Date.parse(event.meta.at))) {
    throw new Error("Native event identity unavailable");
  }
  const data = event.data ?? {};
  if (data.kind === "execution.background_task") return;
  {
    if (["message.appended","message.completed"].includes(event.type)) {
      const scope=await client.query<{conversation_id:string;owner_principal_id:string}>(`
        SELECT response.conversation_id,conversation.owner_principal_id
        FROM response_attempts response JOIN conversations conversation
          ON conversation.id=response.conversation_id
        WHERE response.id=$1 AND conversation.eve_session_id=$2
          AND conversation.binding_state='bound'`,[attemptId,nativeSessionId]);
      const owner=scope.rows[0];
      if (!owner) throw new Error("Planning conversation owner unavailable");
      if (await planningScopeForConversation(client,owner.conversation_id)) {
        const bound=await boundToolActor(client,{principalId:owner.owner_principal_id,
          attributes:{turasAttemptId:attemptId}});
        await assertPlanConversationFence(client,bound.actor,owner.conversation_id);
      }
    }
    const attempt = await client.query<{
      conversation_id: string; native_turn_id: string | null; input_event_id: string | null;
      input_digest: string; dispatch_state: string; response_state: string;
    }>(`
      SELECT a.conversation_id, a.native_turn_id, a.input_event_id,
        a.input_digest, a.dispatch_state, a.response_state
      FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
      WHERE a.id = $1 AND c.eve_session_id = $2 AND c.binding_state = 'bound'
      FOR UPDATE OF a
    `, [attemptId, nativeSessionId]);
    const row = attempt.rows[0];
    if (!row || !["dispatching", "admitted", "uncertain"].includes(row.dispatch_state)) {
      throw new Error("Native attempt association unavailable");
    }
    if (event.type !== "message.received") {
      await assertArtifactDependenciesCurrent(client,row.conversation_id);
      await assertRetrievalDependenciesCurrent(client,row.conversation_id);
    }
    const artifact = await artifactContextSchemaReady(client)
      ? await client.query<{ native_text_digest: string }>(
        "SELECT native_text_digest FROM artifact_context_receipts WHERE attempt_id=$1", [attemptId])
      : null;
    const nativeInputDigest = artifact?.rows[0]?.native_text_digest ?? row.input_digest;
    const inserted = await client.query(`INSERT INTO event_projections
      (native_event_id, conversation_id, native_session_id, stream_index,
       event_type, turn_id, step_index, visible_payload, emitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (native_event_id) DO NOTHING RETURNING native_event_id`,
    [event.meta.id, row.conversation_id, nativeSessionId, streamIndex ?? null,
      event.type, typeof data.turnId === "string" ? data.turnId : null,
      Number.isInteger(data.stepIndex) ? data.stepIndex : null,
      JSON.stringify(visiblePayload(event)), event.meta.at]);
    if (!inserted.rowCount) {
      if (streamIndex !== undefined) {
        await client.query(`UPDATE event_projections SET stream_index = COALESCE(stream_index, $2)
          WHERE native_event_id = $1 AND conversation_id = $3`,
        [event.meta.id, streamIndex, row.conversation_id]);
      }
      return;
    }
    if (event.type === "message.received") {
      if (typeof data.message !== "string" || typeof data.turnId !== "string" ||
          messageDigest(data.message) !== nativeInputDigest ||
          (row.input_event_id && row.input_event_id !== event.meta.id) ||
          (row.native_turn_id && row.native_turn_id !== data.turnId)) {
        throw new Error("Native input does not match the reserved attempt");
      }
      await client.query(`UPDATE response_attempts SET input_event_id = $2,
        native_turn_id = $3, dispatch_state = 'admitted', response_state = 'running',
        updated_at = now(), revision = revision + 1 WHERE id = $1`,
      [attemptId, event.meta.id, data.turnId]);
      return;
    }
    if (!row.native_turn_id || row.native_turn_id !== data.turnId) {
      throw new Error("Native turn does not match the reserved attempt");
    }
    const planStepRecorded=await reconcilePlanModelEvent(client,attemptId,event.type,data);
    if (event.type === "step.completed" && planStepRecorded!==false) {
      const usage = data.usage;
      const outputTokens = typeof usage === "object" && usage !== null &&
        "outputTokens" in usage && Number.isSafeInteger(usage.outputTokens) &&
        (usage.outputTokens as number) >= 0 ? usage.outputTokens as number : 0;
      await client.query(`UPDATE response_attempts SET output_tokens = output_tokens + $2,
        updated_at = now(), revision = revision + 1 WHERE id = $1`, [attemptId, outputTokens]);
    }
    const terminal: Record<string, string> = {
      "turn.completed": "completed", "turn.cancelled": "cancelled", "turn.failed": "failed",
    };
    if (terminal[event.type]) {
      await client.query(`UPDATE response_attempts SET response_state = $2,
        updated_at = now(), revision = revision + 1 WHERE id = $1
        AND response_state IN ('pending','running','stopping')`, [attemptId, terminal[event.type]]);
      await client.query(`UPDATE watchdog_jobs SET state = 'settled', lease_owner = NULL,
        lease_expires_at = NULL, updated_at = now() WHERE attempt_id = $1`, [attemptId]);
    }
  }
}
