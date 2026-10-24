import {runRetrievalWorkerTick} from '../../../scripts/retrieval-worker';
import {startMaintenanceScheduler} from '../operations/maintenance';
import {createMaintenanceBindings} from '../operations/maintenance-bindings';
import {operationalCodeVersion} from '../operations/code-version';
import { timingSafeEqual } from "node:crypto";
import type { AttachSessionFn } from "eve/channels";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import {runHostedReconciliation} from '../operations/hosted-reconciliation';

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

/** Cleanup classes retain independent durable leases; already-admitted indexing
 * stays outside cleanup authority. Preview keeps its original bounded lifetime. */
export async function runHostedWatchdog(attachSession:AttachSessionFn,options:{preview?:boolean;ready?:()=>void;unavailable?:(error:unknown)=>void}={}):Promise<void>{
 const scheduler=startMaintenanceScheduler(getServerConfig().TURAS_ENVIRONMENT_ID,operationalCodeVersion(),createMaintenanceBindings({attachSession}),(id,result)=>{
  if(id==='conversation'){if(result.state==='pass')options.ready?.();else if(result.state==='fail')options.unavailable?.(Error('Conversation worker unavailable'));}
 });
 let stopping=false;const pending=new Map<string,Promise<unknown>>(),timers:ReturnType<typeof setInterval>[]=[];
 const lane=(id:string,interval:number,run:()=>Promise<unknown>)=>{const tick=()=>{if(stopping||pending.has(id))return;const task=run().catch(()=>{console.warn(JSON.stringify({kind:'hosted_worker_lane_failed',lane:id}));}).finally(()=>pending.delete(id));pending.set(id,task);};timers.push(setInterval(tick,interval));tick();};
 lane('reconciliation',30000,()=>runHostedReconciliation({limit:20,signal:AbortSignal.timeout(30000)}));
 lane('retrieval-index',5000,()=>runRetrievalWorkerTick());
 try{await new Promise(resolve=>setTimeout(resolve,options.preview?180000:65000));}
 finally{stopping=true;for(const timer of timers)clearInterval(timer);await Promise.allSettled([scheduler.stop(),...pending.values()]);}
}

/** A Preview send is admitted only after an actual cancellation claim/heartbeat. */
export async function startPreviewChatWorker(attachSession:AttachSessionFn,waitUntil:(task:Promise<unknown>)=>void):Promise<void>{
 if(process.env.VERCEL_ENV!=='preview')return;
 let ready!:()=>void,failed!:(error:unknown)=>void;
 const admission=new Promise<void>((resolve,reject)=>{ready=resolve;failed=reject;});
 const running=runHostedWatchdog(attachSession,{preview:true,ready,unavailable:failed}).then(()=>{failed(Error('Preview worker ended before readiness'));}).catch(error=>{failed(error);console.warn(JSON.stringify({kind:'preview_chat_worker_failed'}));});
 waitUntil(running);await admission;
}
