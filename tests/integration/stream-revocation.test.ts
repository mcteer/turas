import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eveChannel } from "eve/channels/eve";
import type { EveChannel } from "eve/channels/eve";
import { guardNativeStream } from "../../lib/server/conversations/stream";
import { composeEveRoutes } from "../../lib/server/conversations/eve-routes";
import { POST as login } from "../../app/api/auth/login/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

describe("native stream revocation", () => {
  beforeAll(() => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Disposable test database required");
    }
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });
  it("closes a quiet stream and cancels its upstream reader when authority disappears", async () => {
    let authorized = true;
    let cancelled = false;
    const native = new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "application/x-ndjson",
      "x-eve-stream-version": "1", "x-eve-stream-tail-index": "7" } });
    const protectedResponse = guardNativeStream(native, async () => authorized, 20, 50);
    expect(protectedResponse.headers.get("x-eve-stream-version")).toBe("1");
    expect(protectedResponse.headers.get("x-eve-stream-tail-index")).toBe("7");
    const reader = protectedResponse.body!.getReader();
    authorized = false;
    const result = await Promise.race([reader.read(), delay(250).then(() => "timeout")]);
    expect(result).toEqual({ done: true, value: undefined });
    expect(cancelled).toBe(true);
  });

  it("does not forward a later chunk after a failed authority check", async () => {
    let authorized = true;
    let source: ReadableStreamDefaultController<Uint8Array> | undefined;
    const native = new Response(new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
    }));
    const protectedResponse = guardNativeStream(native, async () => authorized, 20, 50);
    const reader = protectedResponse.body!.getReader();
    source!.enqueue(new TextEncoder().encode("first\n"));
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first\n");
    authorized = false;
    await delay(35);
    const second = await reader.read();
    expect(second.done).toBe(true);
  });

  it("fails closed when an authority check stalls and cancels the native reader", async () => {
    let checks = 0;
    let cancelled = false;
    const native = new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }));
    const guarded = guardNativeStream(native, async () => {
      checks += 1;
      return new Promise<boolean>(() => undefined);
    }, 20, 25);
    const result = await Promise.race([guarded.body!.getReader().read(), delay(250).then(() => "timeout")]);
    expect(result).toEqual({ done: true, value: undefined });
    expect(checks).toBe(1);
    expect(cancelled).toBe(true);
  });

  it("lets a fenced chunk finish without a redundant timer check closing it", async () => {
    let checks = 0;
    let authorized = true;
    const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("fenced\n")); },
    })), async () => { checks += 1; return authorized; }, 20, 25,
    async (_chunk, enqueue) => { await delay(70); enqueue(); });
    const reader = guarded.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("fenced\n");
    expect(checks).toBe(1);
    authorized = false;
    expect(await Promise.race([reader.read(), delay(250).then(() => "timeout")]))
      .toEqual({ done: true, value: undefined });
  });

  it("batches replay chunks under a release-time authority fence", async () => {
    let releases = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 100; index += 1) {
          controller.enqueue(new TextEncoder().encode(`${index}\n`));
        }
        controller.close();
      },
    });
    const guarded = guardNativeStream(new Response(source), async () => true,
      10_000, 100, async (_chunk, enqueue) => { releases += 1; enqueue(); });
    const output = await guarded.text();
    expect(output).toBe(Array.from({ length: 100 }, (_, index) => `${index}\n`).join(""));
    expect(releases).toBeLessThan(100);
  });

  it("fails closed when the authority store reports an outage", async () => {
    let cancelled = false;
    const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    })), async () => { throw new Error("injected database outage"); }, 20, 50);
    const result = await Promise.race([guarded.body!.getReader().read(),
      delay(250).then(() => "timeout")]);
    expect(result).toEqual({ done: true, value: undefined });
    expect(cancelled).toBe(true);
  });

  it("does not forward bytes after an active stream loses access", async () => {
    let authorized = true;
    let source: ReadableStreamDefaultController<Uint8Array> | undefined;
    const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
    })), async () => authorized, 20, 50);
    const reader = guarded.body!.getReader();
    source!.enqueue(new TextEncoder().encode("before"));
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("before");
    authorized = false;
    source!.enqueue(new TextEncoder().encode("after"));
    const next = await reader.read();
    // An already queued byte may arrive within the 20ms authority lease.
    if (!next.done) expect(new TextDecoder().decode(next.value)).toBe("after");
    expect((await reader.read()).done).toBe(true);
  });

  it("closes an owned quiet stream after partner grant revocation and denies reconnect", async () => {
    const origin = "http://127.0.0.1:3000";
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "partner", password: process.env.PARTNER_PASSWORD }),
    }));
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const session = await getCurrentSession(new Request(origin, { headers: { cookie } }));
    if (!session) throw new Error("Partner login fixture failed");
    const operationId = randomUUID();
    const { conversation } = await createOwnedConversation(session, {
      customerId: DEMO_IDS.sharedCustomer, requestKey: operationId,
    });
    const binding = await claimBinding(session, conversation.id, operationId);
    if (binding.state !== "claimed") throw new Error("Binding fixture failed");
    const nativeId = `wrun_${randomUUID()}`;
    await bindNativeSession(session, conversation.id, binding.claimToken, nativeId);
    let upstreamCancelled = false;
    const native = eveChannel({ auth: [] });
    const mocked = { ...native, routes: native.routes.map((entry) =>
      entry.method === "GET" && entry.path === "/eve/v1/session/:sessionId/stream"
        ? { ...entry, handler: async () => new Response(new ReadableStream<Uint8Array>({
          cancel() { upstreamCancelled = true; },
        }), { headers: { "content-type": "application/x-ndjson" } }) } : entry),
    } as EveChannel;
    const guarded = composeEveRoutes(mocked);
    const streamRoute = guarded.routes.find((entry) => entry.method === "GET" &&
      entry.path === "/eve/v1/session/:sessionId/stream");
    if (!streamRoute || streamRoute.transport === "websocket") throw new Error("Native stream route missing");
    const request = () => new Request(`${origin}/eve/v1/session/${nativeId}/stream`, {
      headers: { cookie },
    });
    const args = { params: { sessionId: nativeId } } as unknown as Parameters<typeof streamRoute.handler>[1];
    const db = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await db.connect();
    try {
      const protectedStream = await streamRoute.handler(request(), args);
      expect(protectedStream.status).toBe(200);
      const reader = protectedStream.body!.getReader();
      await delay(100);
      const revokedAt = Date.now();
      await db.query(`UPDATE customer_grants SET state = 'revoked', revision = revision + 1
        WHERE membership_id = $1 AND customer_id = $2`,
      [DEMO_IDS.partnerMembership, DEMO_IDS.sharedCustomer]);
      const finished = await Promise.race([reader.read(), delay(12_000).then(() => "timeout")]);
      expect(finished).toEqual({ done: true, value: undefined });
      expect(Date.now() - revokedAt).toBeLessThanOrEqual(30_000);
      expect(upstreamCancelled).toBe(true);
      const denied = await streamRoute.handler(request(), args);
      expect(denied.status).toBe(404);
    } finally {
      await db.query(`UPDATE customer_grants SET state = 'active', revision = revision + 1
        WHERE membership_id = $1 AND customer_id = $2`,
      [DEMO_IDS.partnerMembership, DEMO_IDS.sharedCustomer]);
      await db.query("DELETE FROM conversations WHERE id = $1", [conversation.id]);
      await db.end();
    }
  }, 15_000);

  it("closes on logout, expiry and owner disablement without forwarding a quiet stream", async () => {
    const db = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await db.connect();
    try {
      for (const mode of ["logout", "expiry", "disabled"] as const) {
        const signedIn = await login(new Request("http://127.0.0.1:3000/api/auth/login", {
          method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
          body: JSON.stringify({ username: "partner", password: process.env.PARTNER_PASSWORD }),
        }));
        const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
        const request = new Request("http://127.0.0.1:3000/eve/v1/session/test/stream", {
          headers: { cookie },
        });
        const identity = await getCurrentSession(request);
        if (!identity) throw new Error("Synthetic identity missing");
        let cancelled = false;
        const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
          cancel() { cancelled = true; },
        })), async () => Boolean(await getCurrentSession(request)), 20, 50);
        const reader = guarded.body!.getReader();
        await delay(50);
        try {
          if (mode === "logout") {
            await db.query("UPDATE login_sessions SET revoked_at = now() WHERE id = $1", [identity.sessionId]);
          } else if (mode === "expiry") {
            await db.query(`UPDATE login_sessions SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 second'
              WHERE id = $1`, [identity.sessionId]);
          } else {
            await db.query("UPDATE principals SET active = false WHERE id = $1", [identity.principalId]);
          }
          const finished = await Promise.race([reader.read(), delay(300).then(() => "timeout")]);
          expect(finished, mode).toEqual({ done: true, value: undefined });
          expect(cancelled, mode).toBe(true);
          expect(await getCurrentSession(request)).toBeNull();
        } finally {
          if (mode === "disabled") {
            await db.query("UPDATE principals SET active = true WHERE id = $1", [identity.principalId]);
          }
        }
      }
    } finally { await db.end(); }
  });
});
