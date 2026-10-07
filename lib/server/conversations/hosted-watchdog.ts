import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AttachSessionFn } from "eve/channels";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { heartbeatWorker, claimDueJobs, finishDueJob } from "./watchdog";
import { performMaintenance } from "./maintenance";

export function authorizeHostedWatchdog(request: Request, secret = process.env.CRON_SECRET): void {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  // Vercel's protected scheduler supplies platform cookies. These grant no
  // authority here: only the exact cron bearer authenticates this endpoint.
  const applicationCookie = (request.headers.get("cookie") ?? "").split(";").some(part =>
    ["turas_session", "__Host-turas_session"].includes(part.trim().split("=", 1)[0]));
  if (request.method !== "GET" || applicationCookie || !secret || secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    console.warn(JSON.stringify({ kind: "hosted_watchdog_denied", methodAllowed: request.method === "GET",
      applicationCookiePresent: applicationCookie, secretConfigured: !!secret && secret.length >= 32,
      bearerPresent: supplied.startsWith("Bearer "), lengthMatches: Buffer.byteLength(supplied) === Buffer.byteLength(expected),
      bearerMatches: !!expected && Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) }));
    throw new HttpFailure(403, "maintenance_denied", "Action not allowed");
  }
}

/** Minute cron invocations overlap by five seconds. Existing SKIP LOCKED job
 * leases fence duplicate cancellation; readiness expires if execution stops.
 * This performs no schema initialization and never dispatches model work. */
export async function runHostedWatchdog(attachSession: AttachSessionFn): Promise<void> {
  const workerId = randomUUID();
  const end = Date.now() + 65_000;
  while (Date.now() < end) {
    const started = Date.now();
    const jobs = await claimDueJobs(workerId, 1);
    await heartbeatWorker(workerId);
    for (const job of jobs) {
      try {
        const result = await performMaintenance({ action: "cancel_due", attemptId: job.attemptId,
          environmentId: getServerConfig().TURAS_ENVIRONMENT_ID }, attachSession);
        await finishDueJob(workerId, job.attemptId, result);
      } catch {
        await finishDueJob(workerId, job.attemptId, "retry", "maintenance_call_failed");
      }
    }
    const remaining = Math.min(end - Date.now(), Math.max(0, 5_000 - (Date.now() - started)));
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
}
