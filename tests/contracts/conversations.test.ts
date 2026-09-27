import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as createConversation, GET as listConversations } from "../../app/api/conversations/route";
import { GET as readConversation } from "../../app/api/conversations/[id]/route";

const origin = "http://127.0.0.1:3000";
const createdIds: string[] = [];

async function identity(name: "mcteer" | "panel" | "partner") {
  const response = await login(new Request(`${origin}/api/auth/login`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: name, password: process.env[name === "mcteer"
      ? "TURAS_DEMO_PASSWORD" : `${name.toUpperCase()}_PASSWORD`] }),
  }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  const body = await response.json() as { data: { csrfToken: string } };
  return { cookie, csrf: body.data.csrfToken };
}

function api(path: string, method: string, auth: { cookie: string; csrf: string }, body?: unknown) {
  return new Request(`${origin}${path}`, {
    method, headers: { origin, cookie: auth.cookie, "x-csrf-token": auth.csrf,
      "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("owned conversations API", () => {
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
      await client.query("DELETE FROM event_projections WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [ids]);
    }
    finally { await client.end(); }
  });

  it("creates an idempotent owned conversation and hides it from another internal member", async () => {
    const panel = await identity("panel");
    const mcteer = await identity("mcteer");
    const key = randomUUID();
    const input = { customerId: DEMO_IDS.sharedCustomer, requestKey: key, title: "Synthetic discussion" };
    const first = await createConversation(api("/api/conversations", "POST", panel, input));
    expect(first.status).toBe(201);
    const created = await first.json() as { data: { id: string; ownerPrincipalId: string } };
    createdIds.push(created.data.id);
    expect(created.data.ownerPrincipalId).toBe(DEMO_IDS.panel);
    const replay = await createConversation(api("/api/conversations", "POST", panel, input));
    expect(replay.status).toBe(200);
    expect((await replay.json() as { data: { id: string } }).data.id).toBe(created.data.id);
    const listed = await listConversations(api("/api/conversations", "GET", panel));
    expect((await listed.json() as { data: { items: { id: string }[] } }).data.items.some((item) => item.id === created.data.id)).toBe(true);
    const hidden = await readConversation(api(`/api/conversations/${created.data.id}`, "GET", mcteer), {
      params: Promise.resolve({ id: created.data.id }),
    });
    expect(hidden.status).toBe(404);
  });

  it("rejects an unassigned partner customer without creating a record", async () => {
    const partner = await identity("partner");
    const response = await createConversation(api("/api/conversations", "POST", partner, {
      customerId: DEMO_IDS.deniedCustomer, requestKey: randomUUID(), title: "Hidden",
    }));
    expect(response.status).toBe(404);
  });

  it("keeps a completed answer visible after more than 500 streaming deltas", async () => {
    const panel = await identity("panel");
    const response = await createConversation(api("/api/conversations", "POST", panel, {
      customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID(), title: "Long synthetic answer",
    }));
    const id = (await response.json() as { data: { id: string } }).data.id;
    createdIds.push(id);
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`INSERT INTO event_projections
        (native_event_id,conversation_id,native_session_id,event_type,turn_id,visible_payload,emitted_at)
        SELECT 'evt_' || gen_random_uuid()::text,$1,'wrun_synthetic','message.appended',
          'turn_synthetic','{"messageDelta":"x"}'::jsonb, now() + (n || ' milliseconds')::interval
        FROM generate_series(1,501) n`, [id]);
      await client.query(`INSERT INTO event_projections
        (native_event_id,conversation_id,native_session_id,event_type,turn_id,visible_payload,emitted_at)
        VALUES ($1,$2,'wrun_synthetic','message.completed','turn_synthetic',$3,
          now() + interval '502 milliseconds')`, [`evt_${randomUUID()}`, id,
        JSON.stringify({ message: "Visible final response" })]);
    } finally { await client.end(); }
    const detail = await readConversation(api(`/api/conversations/${id}`, "GET", panel), {
      params: Promise.resolve({ id }),
    });
    const body = await detail.json() as { data: { history: Array<{ eventType: string;
      payload: { message?: string } }> } };
    expect(body.data.history.some((event) => event.eventType === "message.completed" &&
      event.payload.message === "Visible final response")).toBe(true);
  });
});
