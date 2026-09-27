import { randomUUID } from "node:crypto";
import { closeRuntimePool } from "../lib/server/db/client";
import { getServerConfig } from "../lib/server/config";
import { claimDueJobs, finishDueJob, heartbeatWorker, signMaintenanceRequest } from "../lib/server/conversations/watchdog";

const rawOrigin = process.env.TURAS_EVE_INTERNAL_ORIGIN;
if (!rawOrigin) throw new Error("Local eve service origin required");
const origin = new URL(rawOrigin);
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.username || origin.password || origin.pathname !== "/") {
  throw new Error("Maintenance worker requires a loopback eve origin");
}

const path = "/internal/turas/maintenance";
const workerId = randomUUID();
let scanning = false;
let stopping = false;

function fatal(): void {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  void closeRuntimePool().finally(() => process.exit(1));
}

async function send(attemptId: string): Promise<"settled" | "cancel_requested" | "retry"> {
  const body = JSON.stringify({ action: "cancel_due", attemptId,
    environmentId: getServerConfig().TURAS_ENVIRONMENT_ID });
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = signMaintenanceRequest("POST", path, timestamp, nonce, body);
  const response = await fetch(new URL(path, origin), {
    method: "POST", headers: { "content-type": "application/json",
      "x-turas-timestamp": timestamp, "x-turas-nonce": nonce,
      "x-turas-signature": signature }, body, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Maintenance route status ${response.status}`);
  const parsed = await response.json() as { data?: { status?: string } };
  if (!["settled", "cancel_requested", "retry"].includes(parsed.data?.status ?? "")) {
    throw new Error("Maintenance route returned an invalid status");
  }
  return parsed.data!.status as "settled" | "cancel_requested" | "retry";
}

async function scan(): Promise<void> {
  if (scanning || stopping) return;
  scanning = true;
  try {
    await heartbeatWorker(workerId);
    const jobs = await claimDueJobs(workerId);
    for (const job of jobs) {
      try {
        const result = await send(job.attemptId);
        await finishDueJob(workerId, job.attemptId, result);
        const overrunMs = Date.now() - job.deadlineAt.getTime();
        if (overrunMs > 10_000) console.info(JSON.stringify({ kind: "turas_watchdog_overrun",
          attemptId: job.attemptId, overrunMs, status: result }));
      } catch {
        await finishDueJob(workerId, job.attemptId, "retry", "maintenance_call_failed");
        const overrunMs = Date.now() - job.deadlineAt.getTime();
        if (overrunMs > 10_000) console.info(JSON.stringify({ kind: "turas_watchdog_overrun",
          attemptId: job.attemptId, overrunMs, status: "retry" }));
      }
    }
  } finally {
    scanning = false;
  }
}

const timer = setInterval(() => {
  void scan().catch(fatal);
}, 5_000);
void scan().catch(fatal);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    clearInterval(timer);
    void closeRuntimePool().finally(() => process.exit());
  });
}
