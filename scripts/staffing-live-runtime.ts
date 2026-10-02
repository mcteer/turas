import { randomUUID } from "node:crypto";
import { getServerConfig } from "../lib/server/config";
import { requireOwnedStaffingClone } from "./staffing-eval-environment";
import { signMaintenanceRequest } from "../lib/server/conversations/watchdog";
import type { buildStaffingLiveCase } from "../tests/fixtures/staffing/live-cases";

export type StaffingLiveAuth = { cookie: string; csrf: string };
export type StaffingLivePrepared = { attemptId: string; conversationId: string; operationId: string; nativeRequestId: string };
export type StaffingLiveStatus = { state: string; responseAttemptId: string | null; nativeTurnId: string | null;
  outputReadable: boolean; fenced: boolean; inputTokens: number | null; outputTokens: number | null;
  readCalls: number; stepsAdmitted: number; responseState: string | null };
type Case = Awaited<ReturnType<typeof buildStaffingLiveCase>>;

function localOrigin(raw: string) {
  requireOwnedStaffingClone();
  const origin = new URL(raw);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Owned local live runtime required");
  return origin.origin;
}
function signal(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Staffing live deadline reached");
  return AbortSignal.timeout(Math.min(15_000, remaining));
}
export function staffingLiveHeaders(origin: string, auth: StaffingLiveAuth, extra: Record<string, string> = {}) {
  return { origin: localOrigin(origin), cookie: auth.cookie, "content-type": "application/json", "x-csrf-token": auth.csrf, ...extra };
}
export async function staffingLivePost(origin: string, auth: StaffingLiveAuth, path: string, body: unknown, deadline: number,
  extra: Record<string, string> = {}) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Owned live path required");
  return fetch(`${localOrigin(origin)}${path}`, { method: "POST", redirect: "error", headers: staffingLiveHeaders(origin, auth, extra),
    body: JSON.stringify(body), signal: signal(deadline) });
}
export async function staffingLiveLogin(origin: string, role: "panel" | "mcteer", deadline: number): Promise<StaffingLiveAuth> {
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
export async function prepareStaffingLive(origin: string, auth: StaffingLiveAuth, current: Case, instructions: string, deadline: number) {
  const d = current.demand;
  const response = await staffingLivePost(origin, auth, "/api/staffing/advisory", { requestKey: randomUUID(),
    customerId: d.customerId, demandId: d.demandId, revisionId: d.revisionId, contentDigest: d.contentDigest,
    expectedAggregateVersion: d.aggregateVersion, mode: current.scenarioId ? "finance" : "operational", scenarioId: current.scenarioId, instructions }, deadline);
  if (!response.ok) throw new Error("Owned live advisory preparation failed");
  const prepared = (await response.json()).data as StaffingLivePrepared;
  for (const id of [prepared.attemptId, prepared.conversationId, prepared.operationId, prepared.nativeRequestId]) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Owned live preparation identity unavailable");
  }
  const bound = await staffingLivePost(origin, auth, "/eve/v1/session", { operationId: prepared.operationId }, deadline,
    { "x-turas-conversation-id": prepared.conversationId });
  if (!bound.ok) throw new Error("Owned live native binding failed");
  const nativeSessionId = (await bound.json()).sessionId as string;
  if (!/^wrun_[A-Za-z0-9_-]{1,160}$/.test(nativeSessionId)) throw new Error("Owned live native identity missing");
  return { prepared, nativeSessionId };
}
/** The runner calls this once per fixed case, never as a recovery/retry path. */
export async function dispatchStaffingLive(origin: string, auth: StaffingLiveAuth,
  prepared: StaffingLivePrepared, nativeSessionId: string, instructions: string, deadline: number) {
  const response = await staffingLivePost(origin, auth, `/eve/v1/session/${nativeSessionId}`, { message: instructions }, deadline,
    { "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId });
  if (!response.ok) throw new Error("Owned live initial dispatch did not confirm; no retry is allowed");
  await response.body?.cancel();
}
export async function readStaffingLiveStatus(origin: string, auth: StaffingLiveAuth, attemptId: string, deadline: number): Promise<StaffingLiveStatus> {
  const response = await fetch(`${localOrigin(origin)}/api/staffing/advisory/${attemptId}`, { redirect: "error", cache: "no-store",
    headers: { cookie: auth.cookie }, signal: signal(deadline) });
  if (!response.ok) throw new Error("Owned live metadata unavailable");
  return (await response.json()).data;
}
export async function waitStaffingLive<T>(read: () => Promise<T>, accept: (value: T) => boolean, deadline: number): Promise<T> {
  while (Date.now() < deadline) {
    const value = await read(); if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
  throw new Error("Owned live condition exceeded its original deadline");
}

/** The origin comes from this owned supervisor's startup log, never a caller
 * supplied service. This operation reads native metadata and cannot dispatch. */
export async function reconcileStaffingLive(startupLog: string, responseAttemptId: string, deadline: number) {
  requireOwnedStaffingClone();
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
