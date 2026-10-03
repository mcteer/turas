import { randomUUID } from "node:crypto";
import { getServerConfig } from "../lib/server/config";
import { requireOwnedExecutionClone } from "./execution-eval-environment";
import { signMaintenanceRequest } from "../lib/server/conversations/watchdog";
import type { buildExecutionLiveCase } from "../tests/fixtures/execution/advisory";

export type ExecutionLiveAuth = { cookie: string; csrf: string };
export type ExecutionLivePrepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
export type ExecutionLiveStatus = { state: string; responseAttemptId: string | null; nativeTurnId: string | null;
  outputReadable: boolean; fenced: boolean; inputTokens: number | null; outputTokens: number | null;
  readCalls: number; stepsAdmitted: number; responseState: string | null };
type Case = Awaited<ReturnType<typeof buildExecutionLiveCase>>;

function localOrigin(raw: string) {
  requireOwnedExecutionClone();
  const origin = new URL(raw);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Owned local live runtime required");
  return origin.origin;
}
function signal(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Execution live deadline reached");
  return AbortSignal.timeout(Math.min(15_000, remaining));
}
export function executionLiveHeaders(origin: string, auth: ExecutionLiveAuth, extra: Record<string, string> = {}) {
  return { origin: localOrigin(origin), cookie: auth.cookie, "content-type": "application/json", "x-csrf-token": auth.csrf, ...extra };
}
export async function executionLivePost(origin: string, auth: ExecutionLiveAuth, path: string, body: unknown, deadline: number,
  extra: Record<string, string> = {}) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Owned live path required");
  return fetch(`${localOrigin(origin)}${path}`, { method: "POST", redirect: "error", headers: executionLiveHeaders(origin, auth, extra),
    body: JSON.stringify(body), signal: signal(deadline) });
}
export async function executionLiveLogin(origin: string, role: "panel" | "mcteer", deadline: number): Promise<ExecutionLiveAuth> {
  const config = getServerConfig(), host = localOrigin(origin);
  const response = await fetch(`${host}/api/auth/login`, { method: "POST", redirect: "error", signal: signal(deadline),
    headers: { origin: host, "content-type": "application/json" },
    body: JSON.stringify({ username: role, password: role === "panel" ? config.PANEL_PASSWORD : config.TURAS_DEMO_PASSWORD }) });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!response.ok || !cookie) throw new Error("Owned live login failed");
  const session = await fetch(`${host}/api/auth/session`, { redirect: "error", headers: { cookie }, signal: signal(deadline) });
  const body = await session.json() as { data?: { csrfToken?: string } };
  if (!session.ok || !body.data?.csrfToken) throw new Error("Owned live session unavailable");
  return { cookie, csrf: body.data.csrfToken };
}
export async function prepareExecutionLive(origin: string, auth: ExecutionLiveAuth, current: Pick<Case,"customerId"|"engagementId"|"period">, instructions: string, deadline: number) {
  const made=await executionLivePost(origin,auth,"/api/conversations",{customerId:current.customerId,title:"Reviewed execution explanation",requestKey:randomUUID()},deadline);
  if(!made.ok)throw new Error("Owned live conversation creation failed");
  const conversationId=(await made.json()).data.id as string;
  if (typeof conversationId !== "string" || !/^[0-9a-f-]{36}$/i.test(conversationId)) throw new Error("Owned live conversation identity unavailable");
  const overview=await fetch(`${localOrigin(origin)}/api/execution/engagements/${current.engagementId}`,{headers:{cookie:auth.cookie},signal:signal(deadline)});
  if(!overview.ok)throw new Error("Owned live scope unavailable");
  const view=(await overview.json()).data;
  const admissionInput={requestKey:randomUUID(),conversationId,expectedGeneration:view.generation,...current.period};
  const response=await executionLivePost(origin,auth,`/api/execution/engagements/${current.engagementId}/advice`,admissionInput,deadline);
  if(!response.ok)throw new Error("Owned live advisory preparation failed");
  const prepared = (await response.json()).data as ExecutionLivePrepared;
  for (const id of [prepared.attemptId, prepared.conversationId, prepared.operationId, prepared.nativeRequestId]) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Owned live preparation identity unavailable");
  }
  const bound = await executionLivePost(origin, auth, "/eve/v1/session", { operationId: prepared.operationId }, deadline,
    { "x-turas-conversation-id": prepared.conversationId });
  if (!bound.ok) throw new Error("Owned live native binding failed");
  const nativeSessionId = (await bound.json()).sessionId as string;
  if (!/^wrun_[A-Za-z0-9_-]{1,160}$/.test(nativeSessionId)) throw new Error("Owned live native identity missing");
  return { prepared, nativeSessionId, admissionInput };
}
/** The runner calls this once per fixed case, never as a recovery/retry path. */
export async function dispatchExecutionLive(origin: string, auth: ExecutionLiveAuth,
  prepared: ExecutionLivePrepared, nativeSessionId: string, instructions: string, deadline: number) {
  const response = await executionLivePost(origin, auth, `/eve/v1/session/${nativeSessionId}`, { message: instructions }, deadline,
    { "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId });
  if (!response.ok) throw new Error("Owned live initial dispatch did not confirm; no retry is allowed");
  await response.body?.cancel();
}
export async function readExecutionLiveStatus(origin: string, auth: ExecutionLiveAuth, attemptId: string, deadline: number): Promise<ExecutionLiveStatus> {
  const response = await fetch(`${localOrigin(origin)}/api/execution/advice/${attemptId}`, { redirect: "error", cache: "no-store",
    headers: { cookie: auth.cookie }, signal: signal(deadline) });
  if (!response.ok) throw new Error("Owned live metadata unavailable");
  return (await response.json()).data;
}
export async function waitExecutionLive<T>(read: () => Promise<T>, accept: (value: T) => boolean, deadline: number): Promise<T> {
  while (Date.now() < deadline) {
    const value = await read(); if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
  throw new Error("Owned live condition exceeded its original deadline");
}

/** The origin comes from this owned supervisor's startup log, never a caller
 * supplied service. This operation reads native metadata and cannot dispatch. */
export async function reconcileExecutionLive(startupLog: string, responseAttemptId: string, deadline: number) {
  requireOwnedExecutionClone();
  const matches = [...startupLog.matchAll(/server listening at (http:\/\/127\.0\.0\.1:\d+)\//g)];
  const origin = matches.at(-1)?.[1];
  if (!origin) throw new Error("Owned native maintenance origin unavailable");
  const path = "/internal/turas/maintenance", timestamp = String(Date.now()), nonce = randomUUID();
  const body = JSON.stringify({ action: "reconcile", attemptId: responseAttemptId,
    environmentId: getServerConfig().TURAS_ENVIRONMENT_ID });
  const response = await fetch(`${localOrigin(origin)}${path}`, { method: "POST", redirect: "error", signal: signal(deadline),
    headers: { "content-type": "application/json", "x-turas-timestamp": timestamp, "x-turas-nonce": nonce,
      "x-turas-signature": signMaintenanceRequest("POST", path, timestamp, nonce, body) }, body });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Owned native reconciliation unavailable"); }
  const result = (await response.json()).data?.status;
  if (result !== "settled" && result !== "retry") throw new Error("Owned native reconciliation returned an invalid result");
  return result as "settled" | "retry";
}
