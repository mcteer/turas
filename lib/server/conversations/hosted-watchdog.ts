import {processOrdinaryNativeRetirement} from './native-retirement-recovery';
import {runRetrievalWorkerTick} from '../../../scripts/retrieval-worker';
import {runRetrievalCleanupTick} from '../retrieval/cleanup';
import {markDueResearch} from '../research/refresh';
import {runMcpMaintenanceTick} from '../mcp/retention';
import {runLearningMaintenanceTick} from '../learning/maintenance';
import {learningOperationalMetric} from '../learning/observability';
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AttachSessionFn } from "eve/channels";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { heartbeatWorker, claimDueJobs, finishDueJob } from "./watchdog";
import { performMaintenance } from "./maintenance";
import {cleanupNativeUploads} from './native-uploads';

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
 * This performs no schema initialization or new research/model generation.
 * The existing retrieval lane processes bounded queued embeddings and cleanup. */
export async function runHostedWatchdog(attachSession: AttachSessionFn, options: { preview?: boolean; ready?: () => void } = {}): Promise<void> {
  const workerId = randomUUID();
  const end = Date.now() + (options.preview ? 180_000 : 65_000);let nextLearningAt=0,stopping=false,mcpTick:Promise<unknown>|null=null,researchTick:Promise<unknown>|null=null;
  const maintainMcp=()=>{if(stopping||mcpTick)return;mcpTick=runMcpMaintenanceTick().catch(()=>{console.warn(JSON.stringify({kind:'mcp_maintenance_failed'}));}).finally(()=>{mcpTick=null;});};
  const mcpTimer=setInterval(maintainMcp,30000);maintainMcp();
  const maintainResearch=()=>{
    if(stopping||Date.now()>=end||researchTick)return;
    let phase='index';
    researchTick=(async()=>{await runRetrievalWorkerTick();phase='cleanup';await runRetrievalCleanupTick();await processOrdinaryNativeRetirement();await cleanupNativeUploads();phase='review-dates';await markDueResearch();})()
      .catch(error=>{console.warn(JSON.stringify({kind:'research_maintenance_failed',phase,
        code:typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:null}));}).finally(()=>{researchTick=null;});
  };
  const researchTimer=setInterval(maintainResearch,5000);maintainResearch();
  try{while (Date.now() < end) {
    const started = Date.now();
    const jobs = await claimDueJobs(workerId, 1);
    await heartbeatWorker(workerId);
    options.ready?.();
    for (const job of jobs) {
      try {
        const result = await performMaintenance({ action: "cancel_due", attemptId: job.attemptId,
          environmentId: getServerConfig().TURAS_ENVIRONMENT_ID }, attachSession);
        await finishDueJob(workerId, job.attemptId, result);
      } catch {
        await finishDueJob(workerId, job.attemptId, "retry", "maintenance_call_failed");
      }
    }
    if(Date.now()>=nextLearningAt){try{const result=await runLearningMaintenanceTick({attachSession});learningOperationalMetric('maintenance_duration_ms',Math.min(1000000,result.durationMs));learningOperationalMetric('maintenance_records',result.processed);}catch{learningOperationalMetric('maintenance_failed',1);}nextLearningAt=Date.now()+30000;}
    const remaining = Math.min(end - Date.now(), Math.max(0, 5_000 - (Date.now() - started)));
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }}finally{stopping=true;clearInterval(mcpTimer);clearInterval(researchTimer);await Promise.all([mcpTick,researchTick]);}
}

/** Preview has no platform cron. Start a real bounded worker before admitting
 * an authenticated send, and retain it past the 120-second response deadline.
 * The caller must already have checked ownership, CSRF and request shape. */
export async function startPreviewChatWorker(
  attachSession: AttachSessionFn, waitUntil: (task: Promise<unknown>) => void,
): Promise<void> {
  if (process.env.VERCEL_ENV !== "preview") return;
  let ready!: () => void;
  let failed!: (error: unknown) => void;
  const admission = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  const running = runHostedWatchdog(attachSession, { preview: true, ready }).catch(error => {
    failed(error);
    console.warn(JSON.stringify({ kind: "preview_chat_worker_failed" }));
  });
  waitUntil(running);
  await admission;
}
