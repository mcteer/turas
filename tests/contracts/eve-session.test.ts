import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eveChannel } from "eve/channels/eve";
import type { EveChannel } from "eve/channels/eve";
import channel from "../../agent/channels/eve";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as createConversation } from "../../app/api/conversations/route";
import { GET as readConversation } from "../../app/api/conversations/[id]/route";
import { GET as readAttempt } from "../../app/api/conversations/[id]/attempts/[requestKey]/route";
import { composeEveRoutes } from "../../lib/server/conversations/eve-routes";
import { projectNativeEvent } from "../../lib/server/conversations/projection";

const origin = "http://127.0.0.1:3000";
const createdIds: string[] = [];
const guardedPaths = [
  "POST /eve/v1/session",
  "POST /eve/v1/session/:sessionId",
  "GET /eve/v1/session/:sessionId/stream",
  "POST /eve/v1/session/:sessionId/cancel",
  "POST /eve/v1/session/:sessionId/clear",
  "POST /eve/v1/session/:sessionId/compact",
  "POST /eve/v1/session/:sessionId/reset",
  "GET /eve/v1/info",
];

function route(channelToUse: EveChannel, method: string, path: string) {
  const found = channelToUse.routes.find((entry) => entry.method === method && entry.path === path);
  if (!found || found.transport === "websocket") throw new Error(`Missing HTTP route ${method} ${path}`);
  return found;
}

const args = { params: { sessionId: "wrun_hidden" } } as unknown as Parameters<ReturnType<typeof route>["handler"]>[1];

describe("eve session boundary", () => {
  beforeAll(() => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Isolated test database required");
    }
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });
  afterEach(async () => {
    if (!createdIds.length) return;
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      const ids = createdIds.splice(0);
      await client.query("DELETE FROM watchdog_jobs WHERE attempt_id IN (SELECT id FROM response_attempts WHERE conversation_id = ANY($1::uuid[]))", [ids]);
      await client.query("DELETE FROM event_projections WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM response_attempts WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM submitted_messages WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [ids]);
    } finally { await client.end(); }
  });

  it("keeps native sessions, controls and inspection closed to an unauthenticated local caller", async () => {
    for (const signature of guardedPaths) {
      const [method, path] = signature.split(" ");
      const response = await route(channel, method, path).handler(new Request(`${origin}${path.replace(":sessionId", "wrun_hidden")}`, {
        method,
      }), args);
      expect([401, 403], signature).toContain(response.status);
    }
    const forged = await route(channel, "POST", "/eve/v1/session").handler(
      new Request(`${origin}/eve/v1/session`, { method: "POST", headers: {
        origin, "content-type": "application/json", "x-vercel-oidc-token": "forged",
        "x-eve-forwarded-principal": "panel", "x-turas-conversation-id": randomUUID(),
      }, body: JSON.stringify({ operationId: randomUUID() }) }), args);
    expect(forged.status).toBe(401);
  });

  it("closes every unused native callback, webhook, task, control and inspection route", async () => {
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const allowed = new Set([
      "GET /eve/v1/health", "POST /eve/v1/session", "POST /eve/v1/session/:sessionId",
      "GET /eve/v1/session/:sessionId/stream", "POST /eve/v1/session/:sessionId/cancel",
    ]);
    for (const entry of channel.routes) {
      if (entry.transport === "websocket") continue;
      const signature = `${entry.method} ${entry.path}`;
      if (allowed.has(signature)) continue;
      const path = entry.path.replace(/:[^/]+/g, "test");
      const response = await entry.handler(new Request(`${origin}${path}`, {
        method: entry.method, headers: { origin, cookie },
      }), args);
      expect(response.status, signature).toBe(403);
    }
  });

  it("binds only an owned parked conversation and delegates native create without a message", async () => {
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    expect(signedIn.status).toBe(200);
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const payload = await signedIn.json() as { data: { csrfToken: string } };
    const key = randomUUID();
    const created = await createConversation(new Request(`${origin}/api/conversations`, {
      method: "POST", headers: { origin, cookie, "content-type": "application/json",
        "x-csrf-token": payload.data.csrfToken },
      body: JSON.stringify({ customerId: DEMO_IDS.sharedCustomer, requestKey: key }),
    }));
    expect(created.status).toBe(201);
    const conversation = await created.json() as { data: { id: string } };
    createdIds.push(conversation.data.id);
    const nativeId = `wrun_${randomUUID()}`;
    let delegated = 0;
    let sent = 0;
    let tailReads = 0;
    let tailCaptures = 0;
    let cancelled = 0;
    const native = eveChannel({ auth: [] });
    const mocked = { ...native, routes: native.routes.map((entry) =>
      entry.method === "POST" && entry.path === "/eve/v1/session"
        ? { ...entry, handler: async (request: Request) => {
          delegated += 1;
          expect(await request.json()).toEqual({ operationId: key });
          return Response.json({ ok: true, sessionId: nativeId, status: "accepted" });
        } }
        : entry.method === "POST" && entry.path === "/eve/v1/session/:sessionId"
          ? { ...entry, handler: async (request: Request) => {
            sent += 1;
            expect(await request.json()).toEqual({ message: "Hello" });
            if (sent === 1) return Response.json({ ok: false, code: "session_not_ready" }, { status: 409 });
            return Response.json({ ok: true, status: "accepted", deliveryId: "delivery-test" });
          } }
        : entry.method === "GET" && entry.path === "/eve/v1/session/:sessionId/stream"
          ? { ...entry, handler: async () => {
            tailReads += 1;
            return new Response(null, { headers: { "x-eve-stream-tail-index": "4",
              "content-type": "application/x-ndjson", "x-eve-stream-version": "1" } });
          } }
        : entry.method === "POST" && entry.path === "/eve/v1/session/:sessionId/cancel"
          ? { ...entry, handler: async (request: Request) => {
            cancelled += 1;
            expect(await request.json()).toEqual({ turnId: "turn_test" });
            return Response.json({ ok: true, status: "accepted" });
          } }
        : entry),
    } as EveChannel;
    const guarded = composeEveRoutes(mocked);
    const request = () => new Request(`${origin}/eve/v1/session`, {
      method: "POST", headers: { origin, cookie, "content-type": "application/json",
        "x-csrf-token": payload.data.csrfToken,
        "x-turas-conversation-id": conversation.data.id },
      body: JSON.stringify({ operationId: key }),
    });
    expect((await route(guarded, "POST", "/eve/v1/session").handler(request(), args)).status).toBe(200);
    expect(delegated).toBeGreaterThanOrEqual(1);
    const visible = await readConversation(new Request(`${origin}/api/conversations/${conversation.data.id}`,
      { headers: { cookie } }), { params: Promise.resolve({ id: conversation.data.id }) });
    expect((await visible.json() as { data: { eveSessionId: string } }).data.eveSessionId).toBe(nativeId);
    const duplicate = await route(guarded, "POST", "/eve/v1/session").handler(request(), args);
    expect((await duplicate.json() as { sessionId: string }).sessionId).toBe(nativeId);
    const ownedStream = await route(guarded, "GET", "/eve/v1/session/:sessionId/stream")
      .handler(new Request(`${origin}/eve/v1/session/${nativeId}/stream`, { headers: { cookie } }),
        { params: { sessionId: nativeId } } as unknown as typeof args);
    expect(ownedStream.status).toBe(200);
    expect(ownedStream.headers.get("x-eve-stream-version")).toBe("1");
    await ownedStream.body?.cancel();
    const hiddenStream = await route(guarded, "GET", "/eve/v1/session/:sessionId/stream")
      .handler(new Request(`${origin}/eve/v1/session/${nativeId}/stream`),
        { params: { sessionId: nativeId } } as unknown as typeof args);
    expect(hiddenStream.status).toBe(401);
    const otherLogin = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "mcteer", password: process.env.TURAS_DEMO_PASSWORD }),
    }));
    const otherCookie = (otherLogin.headers.get("set-cookie") ?? "").split(";")[0];
    const otherCsrf = (await otherLogin.json() as { data: { csrfToken: string } }).data.csrfToken;
    const otherStream = await route(guarded, "GET", "/eve/v1/session/:sessionId/stream")
      .handler(new Request(`${origin}/eve/v1/session/${nativeId}/stream`, {
        headers: { cookie: otherCookie },
      }), { params: { sessionId: nativeId } } as unknown as typeof args);
    expect(otherStream.status).toBe(404);

    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`INSERT INTO maintenance_workers (environment_id, worker_id, last_seen_at)
        VALUES ($1, 'contract-worker', now()) ON CONFLICT (environment_id, worker_id)
        DO UPDATE SET last_seen_at = now()`, [process.env.TURAS_TEST_ENVIRONMENT_ID]);
    } finally { await client.end(); }
    const sendKey = randomUUID();
    const send = (message: unknown) => new Request(`${origin}/eve/v1/session/${nativeId}`, {
      method: "POST", headers: { origin, cookie, "content-type": "application/json",
        "x-csrf-token": payload.data.csrfToken,
        "x-turas-conversation-id": conversation.data.id,
        "x-turas-request-key": sendKey },
      body: JSON.stringify(message),
    });
    const nativeArgs = { params: { sessionId: nativeId },
      attachSession: () => ({ getStreamTailIndex: async () => { tailCaptures += 1; return 4; } }),
    } as unknown as typeof args;
    const crossOwnerSend = await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(new Request(`${origin}/eve/v1/session/${nativeId}`, {
        method: "POST", headers: { origin, cookie: otherCookie, "content-type": "application/json",
          "x-csrf-token": otherCsrf, "x-turas-conversation-id": conversation.data.id,
          "x-turas-request-key": randomUUID() }, body: JSON.stringify({ message: "Hello" }),
      }), nativeArgs);
    expect(crossOwnerSend.status).toBe(404);
    expect(sent).toBe(0);
    const crossSiteSend = await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(new Request(`${origin}/eve/v1/session/${nativeId}`, {
        method: "POST", headers: { origin: "https://other.example", cookie,
          "content-type": "application/json", "x-csrf-token": payload.data.csrfToken,
          "x-turas-conversation-id": conversation.data.id,
          "x-turas-request-key": randomUUID() }, body: JSON.stringify({ message: "Hello" }),
      }), nativeArgs);
    expect(crossSiteSend.status).toBe(403);
    expect(sent).toBe(0);
    const tailReadsBeforeSend = tailReads;
    const firstSend = await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(send({ message: "Hello" }), nativeArgs);
    expect(firstSend.status).toBe(200);
    expect(sent).toBe(2);
    expect(tailCaptures).toBe(1);
    expect(tailReads).toBe(tailReadsBeforeSend);
    const sameKey = await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(send({ message: "Hello" }), nativeArgs);
    expect(sameKey.status).toBe(200);
    expect(sent).toBe(2);
    expect((await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(send({ message: "Changed" }), nativeArgs)).status).toBe(409);
    expect((await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(send({ inputResponses: [] }), nativeArgs)).status).toBe(422);
    expect((await route(guarded, "POST", "/eve/v1/session/:sessionId")
      .handler(send({ message: "Hello", attachments: [{ data: "hidden" }] }), nativeArgs)).status).toBe(422);
    const status = await readAttempt(new Request(`${origin}/api/conversations/${conversation.data.id}/attempts/${sendKey}`,
      { headers: { cookie } }), { params: Promise.resolve({ id: conversation.data.id, requestKey: sendKey }) });
    expect(status.status).toBe(200);
    expect((await status.json() as { data: { dispatchState: string } }).data.dispatchState).toBe("admitted");
    const attemptClient = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await attemptClient.connect();
    let attemptId: string;
    try {
      attemptId = (await attemptClient.query<{ id: string }>(
        "SELECT id FROM response_attempts WHERE conversation_id = $1", [conversation.data.id])).rows[0].id;
    } finally { await attemptClient.end(); }
    await projectNativeEvent(nativeId, attemptId, {
      type: "message.received", data: { message: "Hello", turnId: "turn_test", sequence: 0 },
      meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() },
    });
    const cancel = (turnId: string) => new Request(`${origin}/eve/v1/session/${nativeId}/cancel`, {
      method: "POST", headers: { origin, cookie, "content-type": "application/json",
        "x-csrf-token": payload.data.csrfToken }, body: JSON.stringify({ turnId }),
    });
    const cancelRoute = route(guarded, "POST", "/eve/v1/session/:sessionId/cancel");
    const otherCancel = await cancelRoute.handler(new Request(`${origin}/eve/v1/session/${nativeId}/cancel`, {
      method: "POST", headers: { origin, cookie: otherCookie,
        "content-type": "application/json", "x-csrf-token": otherCsrf },
      body: JSON.stringify({ turnId: "turn_test" }),
    }), nativeArgs);
    expect(otherCancel.status).toBe(404);
    expect(cancelled).toBe(0);
    expect((await cancelRoute.handler(cancel("other_turn"), nativeArgs)).status).toBe(409);
    expect(cancelled).toBe(0);
    expect((await cancelRoute.handler(cancel("turn_test"), nativeArgs)).status).toBe(200);
    expect(cancelled).toBe(1);
    const stopping = await readAttempt(new Request(`${origin}/api/conversations/${conversation.data.id}/attempts/${sendKey}`,
      { headers: { cookie } }), { params: Promise.resolve({ id: conversation.data.id, requestKey: sendKey }) });
    expect((await stopping.json() as { data: { responseState: string } }).data.responseState).toBe("stopping");
    await projectNativeEvent(nativeId, attemptId, {
      type: "turn.cancelled", data: { turnId: "turn_test", sequence: 0 },
      meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() },
    });
    const terminal = await readAttempt(new Request(`${origin}/api/conversations/${conversation.data.id}/attempts/${sendKey}`,
      { headers: { cookie } }), { params: Promise.resolve({ id: conversation.data.id, requestKey: sendKey }) });
    expect((await terminal.json() as { data: { responseState: string } }).data.responseState).toBe("cancelled");
    const detail = await readConversation(new Request(`${origin}/api/conversations/${conversation.data.id}`,
      { headers: { cookie } }), { params: Promise.resolve({ id: conversation.data.id }) });
    const detailData = (await detail.json() as { data: { history?: { eventType: string }[] } }).data;
    expect(detailData.history?.map((item) => item.eventType)).toContain("message.received");
    expect(detailData.history?.map((item) => item.eventType)).toContain("turn.cancelled");
  });
});
