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

/** Protected minute invocations overlap by five seconds. Durable per-class leases
 * fence duplicate work, and each cleanup class runs independently of heavy jobs. */
export async function runHostedWatchdog(attachSession:AttachSessionFn):Promise<void>{
 const scheduler=startMaintenanceScheduler(getServerConfig().TURAS_ENVIRONMENT_ID,operationalCodeVersion(),createMaintenanceBindings({attachSession}));
 let stopping=false,pending:Promise<unknown>|null=null;
 const reconcile=()=>{if(stopping||pending)return;pending=runHostedReconciliation({limit:20,signal:AbortSignal.timeout(30000)}).catch(()=>{console.warn(JSON.stringify({kind:'hosted_reconciliation_failed'}));}).finally(()=>{pending=null;});};
 const timer=setInterval(reconcile,30000);reconcile();
 try{await new Promise(resolve=>setTimeout(resolve,65000));}
 finally{stopping=true;clearInterval(timer);await Promise.allSettled([scheduler.stop(),pending]);}
}
