import {readEveHistory} from "./eve-reader";
import type { AttachSessionFn } from "eve/channels";
import { query } from "../db/client";
import { getServerConfig } from "../config";
import { reconcileFromEvents, type IndexedNativeEvent } from "./reconcile";
import type { MaintenancePayload } from "./watchdog";

type MaintenanceAttempt = {
  native_session_id: string;
  dispatch_start_index: string;
  native_turn_id: string | null;
  response_state: string;
  deadline_at: Date;
  job_state: string;
};

async function loadAttempt(attemptId: string): Promise<MaintenanceAttempt | null> {
  const result = await query<MaintenanceAttempt>(`
    SELECT c.eve_session_id AS native_session_id, a.dispatch_start_index,
      a.native_turn_id, a.response_state, a.deadline_at, j.state AS job_state
    FROM response_attempts a
    JOIN conversations c ON c.id = a.conversation_id
    LEFT JOIN customer_references customer ON customer.id = c.customer_id
      AND customer.workspace_id = c.workspace_id
    JOIN principals p ON p.id = c.owner_principal_id
    JOIN watchdog_jobs j ON j.attempt_id = a.id
    WHERE a.id = $1 AND c.environment_id = $2 AND c.binding_state = 'bound'
      AND COALESCE(to_jsonb(c)->>'native_protocol','27')='27'
      AND a.dispatch_start_index IS NOT NULL AND a.deadline_at IS NOT NULL
    LIMIT 1
  `, [attemptId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  return result.rows[0] ?? null;
}

async function readThroughTail(
  attachSession: AttachSessionFn, nativeId: string, start: number,
): Promise<IndexedNativeEvent[]> {
  return readEveHistory(attachSession,nativeId,start);
}

export async function performMaintenance(
  payload: MaintenancePayload, attachSession: AttachSessionFn,
): Promise<"settled" | "cancel_requested" | "retry"> {
  const before = await loadAttempt(payload.attemptId);
  if (!before) return "settled";
  if (payload.action === "cancel_due" &&
      ["completed", "cancelled", "failed"].includes(before.response_state)) return "settled";
  if (payload.action === "cancel_due" &&
      (before.deadline_at.getTime() > Date.now() ||
       !["leased", "cancel_requested"].includes(before.job_state))) {
    return "retry";
  }
  const events = await readThroughTail(attachSession, before.native_session_id,
    Number(before.dispatch_start_index));
  const result = await reconcileFromEvents(before.native_session_id, payload.attemptId, events);
  if (result.state === "ambiguous") return "retry";
  const after = await loadAttempt(payload.attemptId);
  if (!after || ["completed", "cancelled", "failed"].includes(after.response_state)) return "settled";
  if (payload.action === "reconcile") return "retry";
  if (!after.native_turn_id) return "retry";
  await attachSession(after.native_session_id).cancel({ turnId: after.native_turn_id });
  return "cancel_requested";
}
