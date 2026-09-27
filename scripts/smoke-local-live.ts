import { randomUUID } from "node:crypto";
import { getServerConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";

if (process.argv.slice(2).join(" ") !== "--live") {
  throw new Error("Live model smoke requires the explicit --live flag");
}
const config = getServerConfig();
const origin = new URL(config.TURAS_APP_ORIGIN);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Live smoke requires a loopback app origin");
}
const accounts = [
  { name: "mcteer", password: config.TURAS_DEMO_PASSWORD },
  { name: "panel", password: config.PANEL_PASSWORD },
  { name: "partner", password: config.PARTNER_PASSWORD },
] as const;
type Identity = { cookie: string; csrf: string };

async function call(path: string, identity: Identity, options?: { method?: string; body?: unknown }) {
  return fetch(new URL(path, origin), {
    method: options?.method ?? "GET", cache: "no-store",
    headers: { cookie: identity.cookie, origin: origin.origin,
      "x-csrf-token": identity.csrf, "content-type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function run(name: string, password: string) {
  const signedIn = await fetch(new URL("/api/auth/login", origin), {
    method: "POST", headers: { origin: origin.origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password }),
  });
  if (!signedIn.ok) throw new Error(`${name}: sign-in failed (${signedIn.status})`);
  const cookie = signedIn.headers.get("set-cookie")?.split(";")[0];
  const loginBody = await signedIn.json() as { data?: { csrfToken?: string } };
  if (!cookie || !loginBody.data?.csrfToken) throw new Error(`${name}: session unavailable`);
  const identity = { cookie, csrf: loginBody.data.csrfToken };
  const operationId = randomUUID();
  const created = await call("/api/conversations", identity, { method: "POST",
    body: { customerId: DEMO_IDS.sharedCustomer, requestKey: operationId,
      title: `Synthetic live smoke ${name}` } });
  if (created.status !== 201) throw new Error(`${name}: domain create failed (${created.status})`);
  const conversation = (await created.json() as { data: { id: string } }).data;
  let nativeSessionId: string | undefined;
  for (let index = 0; index < 5; index++) {
    const response = await fetch(new URL("/eve/v1/session", origin), {
      method: "POST", headers: { cookie, origin: origin.origin, "content-type": "application/json",
        "x-csrf-token": identity.csrf, "x-turas-conversation-id": conversation.id },
      body: JSON.stringify({ operationId }), signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      nativeSessionId = (await response.json() as { sessionId: string }).sessionId;
      break;
    }
    if (response.status !== 409) throw new Error(`${name}: native create failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!nativeSessionId) throw new Error(`${name}: native binding remained pending`);
  const requestKey = randomUUID();
  const send = await fetch(new URL(`/eve/v1/session/${nativeSessionId}`, origin), {
    method: "POST", headers: { cookie, origin: origin.origin, "content-type": "application/json",
      "x-csrf-token": identity.csrf, "x-turas-conversation-id": conversation.id,
      "x-turas-request-key": requestKey },
    body: JSON.stringify({ message: "In one short sentence, identify this as a synthetic Turas smoke test and state that no customer profile was changed." }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!send.ok) throw new Error(`${name}: send was not acknowledged (${send.status})`);
  const started = Date.now();
  let finalState = "pending";
  let turnId: string | null = null;
  let outputTokens = 0;
  while (Date.now() - started < 120_000) {
    const status = await call(`/api/conversations/${conversation.id}/attempts/${requestKey}`, identity);
    if (!status.ok) throw new Error(`${name}: attempt status unavailable (${status.status})`);
    const body = await status.json() as { data: { responseState: string; nativeTurnId: string | null;
      outputTokens: number } };
    finalState = body.data.responseState;
    turnId = body.data.nativeTurnId;
    outputTokens = body.data.outputTokens;
    if (["completed", "cancelled", "failed"].includes(finalState)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!["completed", "cancelled", "failed"].includes(finalState) && turnId) {
    await fetch(new URL(`/eve/v1/session/${nativeSessionId}/cancel`, origin), {
      method: "POST", headers: { cookie, origin: origin.origin, "content-type": "application/json",
        "x-csrf-token": identity.csrf }, body: JSON.stringify({ turnId }),
      signal: AbortSignal.timeout(10_000),
    });
  }
  const detail = await call(`/api/conversations/${conversation.id}`, identity);
  if (!detail.ok) throw new Error(`${name}: persisted history unavailable`);
  const history = (await detail.json() as { data: { history: Array<{ eventType: string;
    payload: { message?: string } }> } }).data.history;
  const survivedReload = history.some((event) => event.eventType === "message.completed" &&
    typeof event.payload.message === "string" && event.payload.message.length > 0);
  const result = { account: name, conversationId: conversation.id,
    responseState: finalState, outputTokens, survivedReload, elapsedMs: Date.now() - started };
  console.log(JSON.stringify(result));
  if (finalState !== "completed" || !survivedReload) throw new Error(`${name}: live response did not complete`);
}

for (const account of accounts) await run(account.name, account.password);
