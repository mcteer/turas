import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { getServerConfig } from "../lib/server/config";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { getCurrentSession } from "../lib/server/auth/sessions";
import { prepareAttempt, claimDispatch } from "../lib/server/conversations/dispatch";
import { closeRuntimePool } from "../lib/server/db/client";

const config = getServerConfig();
const origin = new URL(config.TURAS_APP_ORIGIN);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Restart check requires a loopback application origin");
}
const phase = process.argv[2];
if (phase !== "--seed" && phase !== "--verify") {
  throw new Error("Use --seed, restart root dev without clearing storage, then --verify <conversation> <request-key>");
}

async function login() {
  const response = await fetch(new URL("/api/auth/login", origin), { method: "POST",
    headers: { origin: origin.origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "panel", password: config.PANEL_PASSWORD }),
    signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Synthetic sign-in failed (${response.status})`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  const body = await response.json() as { data?: { csrfToken?: string } };
  if (!cookie || !body.data?.csrfToken) throw new Error("Synthetic session missing");
  return { cookie, csrf: body.data.csrfToken };
}

async function application(path: string, identity: { cookie: string; csrf: string },
  method = "GET", body?: unknown) {
  return fetch(new URL(path, origin), { method,
    headers: { cookie: identity.cookie, origin: origin.origin,
      "x-csrf-token": identity.csrf, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000) });
}

const database = new Client({ connectionString: config.DATABASE_URL });
await database.connect();
try {
  if (phase === "--seed") {
    const identity = await login();
    const operationId = randomUUID();
    const created = await application("/api/conversations", identity, "POST", {
      customerId: DEMO_IDS.sharedCustomer, requestKey: operationId,
      title: "Synthetic restart deadline check",
    });
    if (created.status !== 201) throw new Error(`Synthetic create failed (${created.status})`);
    const conversationId = (await created.json() as { data: { id: string } }).data.id;
    const native = await fetch(new URL("/eve/v1/session", origin), { method: "POST",
      headers: { cookie: identity.cookie, origin: origin.origin,
        "x-csrf-token": identity.csrf, "x-turas-conversation-id": conversationId,
        "content-type": "application/json" }, body: JSON.stringify({ operationId }),
      signal: AbortSignal.timeout(10_000) });
    if (!native.ok) throw new Error(`Synthetic native create failed (${native.status})`);
    const nativeSessionId = (await native.json() as { sessionId: string }).sessionId;
    const session = await getCurrentSession(new Request(origin, {
      headers: { cookie: identity.cookie },
    }));
    if (!session) throw new Error("Synthetic identity not found");
    const requestKey = randomUUID();
    const prepared = await prepareAttempt(session, conversationId, nativeSessionId,
      requestKey, "Synthetic restart attempt; no model request is made");
    await claimDispatch(session, conversationId, prepared.attemptId, 0);
    // Preserve the actual 120-second deadline. Four prior synthetic failures
    // make the first post-restart retry visibly require operator review.
    await database.query(`UPDATE watchdog_jobs SET failure_count = 4
      WHERE attempt_id = $1`, [prepared.attemptId]);
    process.stdout.write(`${JSON.stringify({ conversationId, requestKey,
      attemptId: prepared.attemptId })}\n`);
  } else {
    const conversationId = process.argv[3], requestKey = process.argv[4];
    if (!/^[0-9a-f-]{36}$/.test(conversationId ?? "") ||
        !/^[0-9a-f-]{36}$/.test(requestKey ?? "")) {
      throw new Error("Synthetic conversation and request key are required");
    }
    const identity = await login();
    let state: string | null = null;
    for (let index = 0; index < 25; index++) {
      const status = await application(`/api/conversations/${conversationId}/attempts/${requestKey}`,
        identity);
      if (!status.ok) throw new Error(`Synthetic attempt unavailable (${status.status})`);
      const data = (await status.json() as { data: { watchdogState: string;
        responseState: string; dispatchState: string } }).data;
      state = data.watchdogState;
      if (state === "needs_attention") {
        if (data.responseState !== "pending" ||
            !["dispatching", "uncertain"].includes(data.dispatchState)) {
          throw new Error("Unexpected synthetic attempt transition");
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (state !== "needs_attention") throw new Error("Restarted worker did not surface attention");
    const check = await database.query<{ attempts: string; inputs: string }>(`
      SELECT (SELECT count(*) FROM response_attempts WHERE conversation_id = $1)::text AS attempts,
        (SELECT count(*) FROM event_projections WHERE conversation_id = $1
          AND event_type = 'message.received')::text AS inputs`, [conversationId]);
    if (check.rows[0].attempts !== "1" || check.rows[0].inputs !== "0") {
      throw new Error("Restart created an extra attempt or native input");
    }
    process.stdout.write(`${JSON.stringify({ attentionVisible: true, attemptCount: 1,
      nativeInputCount: 0 })}\n`);
    await database.query("DELETE FROM watchdog_jobs WHERE attempt_id IN (SELECT id FROM response_attempts WHERE conversation_id = $1)", [conversationId]);
    await database.query("DELETE FROM response_attempts WHERE conversation_id = $1", [conversationId]);
    await database.query("DELETE FROM submitted_messages WHERE conversation_id = $1", [conversationId]);
    await database.query("DELETE FROM conversations WHERE id = $1", [conversationId]);
  }
} finally {
  await database.end();
  await closeRuntimePool();
}
