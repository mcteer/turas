import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as create, GET as list } from "../../app/api/conversations/route";
import { GET as read } from "../../app/api/conversations/[id]/route";

async function identity(name: "panel" | "partner" | "mcteer") {
  const response = await login(new Request(`${process.env.TURAS_APP_ORIGIN}/api/auth/login`, {
    method: "POST", headers: { origin: process.env.TURAS_APP_ORIGIN!, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password: process.env[name === "mcteer" ? "TURAS_DEMO_PASSWORD" : `${name.toUpperCase()}_PASSWORD`] }),
  }));
  expect(response.status).toBe(200);
  const body = await response.json();
  return { cookie: response.headers.get("set-cookie")!.split(";")[0], csrf: body.data.csrfToken };
}
function request(path: string, actor: { cookie: string; csrf: string }, body?: unknown) {
  return new Request(`${process.env.TURAS_APP_ORIGIN}${path}`, {
    method: body ? "POST" : "GET", headers: { origin: process.env.TURAS_APP_ORIGIN!, cookie: actor.cookie, "x-csrf-token": actor.csrf, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
describe("general chat ownership", () => {
  it("creates a private conversation without selecting or inventing a customer", async () => {
    const actor = await identity("panel"), other = await identity("mcteer");
    const input = { requestKey: randomUUID(), title: "Technical best practices" };
    const response = await create(request("/api/conversations", actor, input));
    expect(response.status).toBe(201);
    const result = (await response.json()).data;
    expect(result.customerId).toBeNull(); expect(result.title).toBe(input.title);
    expect((await create(request("/api/conversations", actor, input))).status).toBe(200);
    expect((await read(request(`/api/conversations/${result.id}`, other), { params: Promise.resolve({ id: result.id }) })).status).toBe(404);
    const own = await read(request(`/api/conversations/${result.id}`, actor), { params: Promise.resolve({ id: result.id }) });
    expect(own.status).toBe(200);
    expect((await own.json()).data.contextStatus).toBe("current");
    const items = (await (await list(request("/api/conversations", actor))).json()).data.items;
    expect(items.some((item: { id: string }) => item.id === result.id)).toBe(true);
  });
  it("lets a partner ask general questions and keeps request keys and scope immutable", async () => {
    const actor = await identity("partner"), key = randomUUID();
    const response = await create(request("/api/conversations", actor, { customerId: null, requestKey: key }));
    expect(response.status).toBe(201);
    expect((await response.json()).data.customerId).toBeNull();
    expect((await create(request("/api/conversations", actor, { requestKey: key, title: "Changed" }))).status).toBe(409);
  });
});
