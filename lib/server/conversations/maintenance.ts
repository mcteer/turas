import type { AttachSessionFn } from "eve/channels";
import { query } from "../db/client";
import { getServerConfig } from "../config";
import { reconcileFromEvents, type IndexedNativeEvent } from "./reconcile";
import type { NativeEvent } from "./projection";
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
    JOIN customer_references customer ON customer.id = c.customer_id
      AND customer.workspace_id = c.workspace_id
    JOIN principals p ON p.id = c.owner_principal_id
    JOIN watchdog_jobs j ON j.attempt_id = a.id
    WHERE a.id = $1 AND c.environment_id = $2 AND c.binding_state = 'bound'
      AND a.dispatch_start_index IS NOT NULL AND a.deadline_at IS NOT NULL
    LIMIT 1
  `, [attemptId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  return result.rows[0] ?? null;
}

async function readThroughTail(
  attachSession: AttachSessionFn, nativeId: string, start: number,
): Promise<IndexedNativeEvent[]> {
  const attached = attachSession(nativeId);
  const tail = await attached.getStreamTailIndex();
  if (tail < start) return [];
  if (tail - start > 10_000) throw new Error("Native replay window too large");
  const stream = await attached.getEventStream({ startIndex: start });
  const reader = stream.getReader();
  const events: IndexedNativeEvent[] = [];
  try {
    for (let index = start; index <= tail; index++) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const item = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Native replay timed out")), 5_000);
        }),
      ]).finally(() => { if (timeout) clearTimeout(timeout); });
      if (item.done) throw new Error("Native replay ended before tail");
      events.push({ index, event: item.value as NativeEvent });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return events;
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
