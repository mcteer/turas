import { describe, expect, it } from "vitest";
import { eveChannel } from "eve/channels/eve";

describe("installed eve channel compatibility", () => {
  it("exposes the native HTTP routes required by the planned wrappers", () => {
    const channel = eveChannel({ auth: [] });
    const routes = new Set(channel.routes.map(({ method, path }) => `${method} ${path}`));
    for (const route of [
      "POST /eve/v1/session",
      "POST /eve/v1/session/:sessionId",
      "GET /eve/v1/session/:sessionId/stream",
      "POST /eve/v1/session/:sessionId/cancel",
    ]) {
      expect(routes.has(route), route).toBe(true);
    }
  });

  it("allows a wrapper to deny a request and forward an untouched native response", async () => {
    const channel = eveChannel({ auth: [] });
    const nativeStreamRoute = channel.routes.find(
      (route) => route.method === "GET" && route.path === "/eve/v1/session/:sessionId/stream",
    );
    expect(nativeStreamRoute).toBeDefined();
    if (!nativeStreamRoute || nativeStreamRoute.transport === "websocket") throw new Error("Expected native HTTP route");

    const nativeResponse = new Response('{"type":"session.waiting","index":0}\n', {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "x-eve-stream-version": "1",
        "x-eve-tail-index": "0",
      },
    });
    const forwarded = {
      ...nativeStreamRoute,
      handler: async (request: Request) => request.headers.has("x-test-allow")
        ? nativeResponse
        : new Response(null, { status: 403 }),
    };

    const denied = await forwarded.handler(new Request("http://localhost/eve/v1/session/a/stream"));
    expect(denied.status).toBe(403);
    const allowed = await forwarded.handler(new Request("http://localhost/eve/v1/session/a/stream", {
      headers: { "x-test-allow": "1" },
    }));
    expect(allowed).toBe(nativeResponse);
    expect(allowed.headers.get("x-eve-stream-version")).toBe("1");
    expect(allowed.headers.get("x-eve-tail-index")).toBe("0");
    expect(await allowed.text()).toBe('{"type":"session.waiting","index":0}\n');
  });
});
