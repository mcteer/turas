import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getServerConfig } from "../lib/server/config";
import { supportAdvicePrompt } from "../lib/support/advice";
import type { buildSupportLiveScenario } from "../tests/fixtures/support/live-scenarios";

export type SupportLiveAuth = { cookie: string; csrf: string };
const preparedSchema = z.object({ attemptId: z.string().uuid(), operationId: z.string().uuid(),
  conversationId: z.string().uuid(), nativeRequestId: z.string().uuid() }).passthrough();
export type SupportLivePrepared = z.infer<typeof preparedSchema>;
function signal(deadlineAt: number) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("Support live deadline exhausted");
  return AbortSignal.timeout(Math.min(remaining, 20000));
}
export async function supportLiveLogin(origin: string, deadlineAt: number): Promise<SupportLiveAuth> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "panel", password: getServerConfig().PANEL_PASSWORD }), signal: signal(deadlineAt) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  await login.body?.cancel();
  if (!login.ok || !cookie) throw new Error("Support live login failed");
  const response = await fetch(`${origin}/api/auth/session`, { headers: { cookie }, signal: signal(deadlineAt) });
  const body = await response.json();
  const csrf = z.string().min(1).parse(body.data?.csrfToken);
  if (!response.ok) throw new Error("Support live session unavailable");
  return { cookie, csrf };
}
export async function supportLivePost(origin: string, auth: SupportLiveAuth, path: string, input: unknown,
  deadlineAt: number, extra: Record<string, string> = {}) {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { cookie: auth.cookie, origin,
    "content-type": "application/json", "x-csrf-token": auth.csrf, ...extra }, body: JSON.stringify(input), signal: signal(deadlineAt) });
  const body = await response.json();
  if (!response.ok) {
    const code = body?.code ?? body?.error?.code;
    throw new Error(`Support live request denied (${response.status}; ${typeof code === "string" && /^[a-z_]{1,100}$/.test(code) ? code : "unknown"})`);
  }
  return body;
}
export async function prepareSupportLive(origin: string, auth: SupportLiveAuth,
  scenario: Awaited<ReturnType<typeof buildSupportLiveScenario>>, deadlineAt: number) {
  const conversation = await supportLivePost(origin, auth, "/api/conversations", { requestKey: randomUUID(),
    customerId: scenario.customerId, title: `Synthetic support live ${scenario.id}` }, deadlineAt);
  const result = await supportLivePost(origin, auth, `/api/support/customers/${scenario.customerId}/advice`, {
    requestKey: randomUUID(), conversationId: conversation.data.id, workloadId: scenario.workloadId,
    audience: scenario.audience, selectedEngagementIds: scenario.selectedEngagementIds, sourceRefs: scenario.sourceRefs }, deadlineAt);
  const prepared = preparedSchema.parse(result.data);
  const native = await supportLivePost(origin, auth, "/eve/v1/session", { operationId: prepared.operationId }, deadlineAt,
    { "x-turas-conversation-id": prepared.conversationId });
  return { prepared, nativeSessionId: z.string().min(1).parse(native.sessionId) };
}
/** Exactly one call; connection loss is uncertain and must never trigger retry. */
export async function dispatchSupportLive(origin: string, auth: SupportLiveAuth, prepared: SupportLivePrepared,
  nativeSessionId: string, deadlineAt: number) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0 || remaining > 120000) throw new Error("Invalid support dispatch deadline");
  const response = await fetch(`${origin}/eve/v1/session/${nativeSessionId}`, { method: "POST", headers: {
    cookie: auth.cookie, origin, "content-type": "application/json", "x-csrf-token": auth.csrf,
    "x-turas-conversation-id": prepared.conversationId, "x-turas-request-key": prepared.nativeRequestId },
    body: JSON.stringify({ message: supportAdvicePrompt }), signal: AbortSignal.timeout(remaining) });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Support live dispatch denied (${response.status})`);
}
