import { Client, ClientError, type MessageStreamEvent } from "eve/client";

export type StaffingLiveCapture = {
  events: MessageStreamEvent[]; bytes: number; nextIndex: number;
} & ({ outcome: "terminal"; terminal: "turn.completed" | "turn.failed" | "turn.cancelled" }
  | { outcome: "denied"; status: number }
  | { outcome: "unconfirmed"; reason: "deadline" | "connection_ended" });

/** Read only an already admitted owned turn. No create/send/retry/cancel method
 * is invoked here. The caller must perform durable cancellation separately if
 * capture expires; closing an HTTP reader does not terminate a paid turn. */
export async function captureStaffingLiveStream(input: {
  origin: string; cookie: string; nativeSessionId: string; turnId: string;
  deadlineAt: number; suiteDeadlineAt: number; startIndex?: number;
  onEvent?: (event: MessageStreamEvent) => Promise<void>;
}): Promise<StaffingLiveCapture> {
  const origin = new URL(input.origin);
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    !/^wrun_[A-Za-z0-9_-]{1,160}$/.test(input.nativeSessionId) || !input.turnId || input.turnId.length > 200 ||
    !input.cookie || !Number.isSafeInteger(input.deadlineAt) || !Number.isSafeInteger(input.suiteDeadlineAt)) {
    throw new Error("Live capture requires an owned local session identity");
  }
  const startIndex = input.startIndex ?? 0;
  if (!Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex > 10_000) throw new Error("Invalid native capture cursor");
  const remaining = Math.min(input.deadlineAt, input.suiteDeadlineAt) - Date.now();
  const events: MessageStreamEvent[] = [], ids = new Set<string>();
  let bytes = 0;
  const current = () => ({ events, bytes, nextIndex: startIndex + events.length });
  if (remaining <= 0) return { ...current(), outcome: "unconfirmed", reason: "deadline" };
  if (remaining > 120_000) throw new Error("Native capture cannot extend the original case deadline");
  const signal = AbortSignal.timeout(remaining);
  const session = new Client({ host: origin.origin, headers: { cookie: input.cookie }, redirect: "error" })
    .sessions.attach(input.nativeSessionId, { streamIndex: startIndex });
  try {
    // Reconnect only the read-only durable GET stream from its event cursor.
    // This never dispatches another model turn or changes the original deadline.
    for await (const event of session.stream({ startIndex, signal,
      streamReconnectPolicy: { retryableErrorStatuses: [425, 500, 502, 503, 504] } })) {
      if (Date.now() >= input.deadlineAt || Date.now() >= input.suiteDeadlineAt) return { ...current(), outcome: "unconfirmed", reason: "deadline" };
      if (!/^evt_[A-Za-z0-9_-]+$/.test(event.meta?.id ?? "") || ids.has(event.meta.id) ||
        typeof event.meta?.at !== "string" || !Number.isFinite(Date.parse(event.meta.at))) throw new Error("Native capture event identity changed");
      const data = "data" in event ? event.data as unknown as Record<string, unknown> : undefined;
      if (data?.turnId !== undefined && data.turnId !== input.turnId) throw new Error("Native capture turn identity changed");
      const size = Buffer.byteLength(JSON.stringify(event), "utf8");
      if (events.length >= 10_000 || bytes + size > 2_000_000) throw new Error("Native capture exceeds its private artifact limit");
      ids.add(event.meta.id); bytes += size; events.push(event);
      await input.onEvent?.(event);
      if (Date.now() >= input.deadlineAt || Date.now() >= input.suiteDeadlineAt) return { ...current(), outcome: "unconfirmed", reason: "deadline" };
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) {
        if (data?.turnId !== input.turnId) throw new Error("Native terminal lacks its original turn identity");
        return { ...current(), outcome: "terminal", terminal: event.type as "turn.completed" | "turn.failed" | "turn.cancelled" };
      }
    }
    return { ...current(), outcome: "unconfirmed", reason: signal.aborted ? "deadline" : "connection_ended" };
  } catch (error) {
    if (signal.aborted) return { ...current(), outcome: "unconfirmed", reason: "deadline" };
    if (error instanceof ClientError && [401, 403, 404, 409].includes(error.status)) return { ...current(), outcome: "denied", status: error.status };
    // Never serialize raw client errors: their bodies may contain private data.
    throw new Error("Native live capture failed");
  }
}
