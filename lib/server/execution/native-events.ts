import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { executionScopeForConversation } from "./context";
import { executionReportedTokens } from "./model-budget";
import { assertExecutionNativeRelease, type ExecutionNativeRelease } from "./native-release";
import { messageDigest } from "../conversations/dispatch";
import type { NativeEvent } from "../conversations/projection";
import { executionDigest } from "./commands";

export const executionVisibleEventTypes = new Set(["message.received", "message.appended", "message.completed",
  "step.completed", "step.failed", "turn.completed", "turn.failed", "turn.cancelled"]);
export function executionMetadataEvent(type: string) {
  return ["step.completed", "step.failed", "turn.completed", "turn.failed", "turn.cancelled"].includes(type);
}
export type ExecutionNativeProjection = { execution: true; usage?: { inputTokens: number | null; outputTokens: number | null } };

/** Native hooks/reconciliation supply actual event identities. Metadata-only
 * settlement deliberately does not retrieve personnel/customer/model content,
 * and remains possible after cancellation, source withdrawal or login expiry.
 * Message content always requires the full current authority/source fence. */
export async function projectExecutionNativeEventInTransaction(db: PoolClient, nativeSessionId: string,
  responseAttemptId: string, event: NativeEvent, streamIndex?: number, prepared?: ExecutionNativeRelease | null,
  metadataOnlyInput = false): Promise<false | ExecutionNativeProjection> {
  const association = (await db.query(`SELECT c.id FROM conversations c JOIN response_attempts r ON r.conversation_id=c.id
    WHERE r.id=$1 AND c.eve_session_id=$2 AND c.environment_id=$3 AND c.binding_state='bound'`,
    [responseAttemptId, nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!association) throw hiddenRecord();
  if (!await executionScopeForConversation(db, association.id)) return false;
  if (!executionVisibleEventTypes.has(event.type) || event.data?.kind === "execution.background_task") return { execution: true };
  if (!event.meta.id || !/^evt_[A-Za-z0-9_-]+$/.test(event.meta.id) || !event.meta.at || !Number.isFinite(Date.parse(event.meta.at)) ||
    streamIndex !== undefined && (!Number.isSafeInteger(streamIndex) || streamIndex < 0)) throw hiddenRecord();
  const data = event.data ?? {}, metadata = executionMetadataEvent(event.type) || metadataOnlyInput && event.type === "message.received";
  if (!metadata) {
    if (!prepared || prepared.nativeSessionId !== nativeSessionId || prepared.responseAttemptId !== responseAttemptId) {
      throw new HttpFailure(503, "execution_release_preflight_required", "Execution output requires current source preparation");
    }
    await assertExecutionNativeRelease(db, prepared);
  }
  // Match cancel/release order. No domain/content retrieval occurs after this
  // mutex prefix in the metadata settlement path.
  await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [association.id]);
  const response = (await db.query(`SELECT native_turn_id,input_event_id,input_digest,dispatch_state,response_state,deadline_at
    FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE`, [responseAttemptId, association.id])).rows[0];
  const advice = (await db.query(`SELECT id,environment_id,workspace_id,state,deadline_at FROM execution_advice_attempts
    WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 FOR UPDATE`,
    [responseAttemptId, association.id, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!advice || !response || !["dispatching", "admitted", "uncertain"].includes(response.dispatch_state)) throw hiddenRecord();
  if (typeof data.turnId !== "string" || !data.turnId || data.turnId.length > 200) throw hiddenRecord();
  if (event.type === "message.received") {
    if (typeof data.message !== "string" || messageDigest(data.message) !== response.input_digest ||
      response.input_event_id && response.input_event_id !== event.meta.id || response.native_turn_id && response.native_turn_id !== data.turnId) throw hiddenRecord();
  } else if (!response.input_event_id || response.native_turn_id !== data.turnId) throw hiddenRecord();

  let payload: Record<string, unknown> = {};
  if (!metadata && event.type === "message.received") payload = { message: data.message };
  if (!metadata && event.type === "message.appended") payload = { messageDelta: data.messageDelta };
  if (!metadata && event.type === "message.completed") payload = { message: data.message, finishReason: data.finishReason };
  if (metadata && ["step.failed", "turn.failed"].includes(event.type)) {
    // Failure codes are native metadata. Keep only a bounded machine code;
    // provider messages/details can contain prompt or personnel content.
    const details = typeof data.details === "object" && data.details !== null ? data.details as Record<string, unknown> : {};
    const inspectedCode = details.name === "HttpFailure" && typeof details.detail === "string" && details.detail.length <= 16384
      ? /\bcode: '([a-z][a-z0-9_]{0,79})'/.exec(details.detail)?.[1] : undefined;
    payload = { code: typeof data.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.code)
      ? data.code : "UNSPECIFIED",
      errorName: typeof details.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(details.name) ? details.name : null,
      domainCode: inspectedCode ?? null,
      semanticErrorId: typeof details.semanticErrorId === "string" && /^[a-z0-9-]{1,80}$/.test(details.semanticErrorId)
        ? details.semanticErrorId : null,
      statusCode: Number.isInteger(details.statusCode) && Number(details.statusCode) >= 100 && Number(details.statusCode) <= 599
        ? details.statusCode : null };
  }
  const step = ["step.completed", "step.failed"].includes(event.type);
  const inputTokens = executionReportedTokens(data.usage, "inputTokens"), outputTokens = executionReportedTokens(data.usage, "outputTokens");
  if (step) payload = { ...payload, usage: { inputTokens, outputTokens } };
  const inserted = await db.query(`INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,
    event_type,turn_id,step_index,visible_payload,emitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(native_event_id) DO NOTHING RETURNING native_event_id`,
    [event.meta.id, association.id, nativeSessionId, streamIndex ?? null, event.type, data.turnId,
      Number.isSafeInteger(data.stepIndex) ? data.stepIndex : null, JSON.stringify(payload), event.meta.at]);
  if (!inserted.rowCount) {
    const prior = (await db.query(`SELECT conversation_id,native_session_id,event_type,turn_id,step_index,visible_payload,emitted_at
      FROM event_projections WHERE native_event_id=$1`, [event.meta.id])).rows[0];
    // Reconciliation may observe an input originally stored with its message.
    // It never upgrades a metadata-only input into a content projection.
    const samePayload = Boolean(prior) && (metadataOnlyInput && event.type === "message.received" || executionDigest(prior.visible_payload) === executionDigest(payload));
    if (!prior || prior.conversation_id !== association.id || prior.native_session_id !== nativeSessionId || prior.event_type !== event.type ||
      prior.turn_id !== data.turnId || prior.step_index !== (Number.isSafeInteger(data.stepIndex) ? data.stepIndex : null) ||
      prior.emitted_at.getTime() !== Date.parse(event.meta.at) || !samePayload) throw hiddenRecord();
    if (streamIndex !== undefined) await db.query(`UPDATE event_projections SET stream_index=COALESCE(stream_index,$2)
      WHERE native_event_id=$1 AND conversation_id=$3`, [event.meta.id, streamIndex, association.id]);
    return { execution: true };
  }
  if (event.type === "message.received") {
    await db.query(`UPDATE response_attempts SET input_event_id=$2,native_turn_id=$3,dispatch_state='admitted',
      response_state=CASE WHEN response_state='pending' AND $4='running' THEN 'running' ELSE response_state END,
      updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1`, [responseAttemptId, event.meta.id, data.turnId, advice.state]);
    return { execution: true };
  }
  let reportedUsage: ExecutionNativeProjection["usage"];
  if (step) {
    if (!Number.isSafeInteger(data.stepIndex) || (data.stepIndex as number) < 0 || (data.stepIndex as number) > 5) throw hiddenRecord();
    const receipt = (await db.query(`SELECT id,ordinal FROM execution_advice_steps WHERE attempt_id=$1 AND step_token=$2`,
      [advice.id, `${data.turnId}/${data.stepIndex}`])).rows[0];
    if (!receipt && event.type === "step.completed") throw new HttpFailure(409, "execution_step_unadmitted", "Native usage has no admitted model call");
    if (receipt) {
      if (receipt.ordinal !== (data.stepIndex as number) + 1) throw hiddenRecord();
      // A distinct terminal step event cannot overwrite unknown or reported
      // usage. ON CONFLICT is intentionally absent: any conflict rolls back.
      await db.query(`INSERT INTO execution_advice_usage(id,attempt_id,step_id,native_event_id,event_type,input_tokens,output_tokens,emitted_at,outcome) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(), advice.id, receipt.id, event.meta.id, event.type, inputTokens, outputTokens, event.meta.at, inputTokens===null||outputTokens===null?"unknown":event.type==="step.failed"?"failed":"confirmed"]);
      reportedUsage = { inputTokens, outputTokens };
      if (outputTokens !== null) await db.query(`UPDATE response_attempts SET output_tokens=output_tokens+$2,
        updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1`, [responseAttemptId, outputTokens]);
    }
  }
  const terminal: Record<string, string> = { "turn.completed": "completed", "turn.failed": "failed", "turn.cancelled": "cancelled" };
  if (terminal[event.type]) {
    const late = advice.deadline_at && Date.parse(event.meta.at) > advice.deadline_at.getTime();
    const settled = advice.state === "cancelled" ? "cancelled" : late ? "expired" : terminal[event.type];
    await db.query(`UPDATE execution_advice_attempts SET state=$2,failure_code=$3,settled_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=$1 AND state IN ('running','unconfirmed')`, [advice.id, settled,
      settled === "completed" ? null : settled === "expired" ? "request_expired" : settled === "cancelled" ? "cancelled" : "native_failure"]);
    await db.query(`UPDATE response_attempts SET response_state=$2,dispatch_state='admitted',updated_at=clock_timestamp(),revision=revision+1
      WHERE id=$1 AND response_state IN ('pending','running','stopping')`,
      [responseAttemptId, settled === "expired" ? "failed" : settled]);
    await db.query(`UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,lease_expires_at=NULL,
      updated_at=clock_timestamp() WHERE attempt_id=$1`, [responseAttemptId]);
  }
  return { execution: true, ...(reportedUsage ? { usage: reportedUsage } : {}) };
}
