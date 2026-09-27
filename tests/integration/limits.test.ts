import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { POST as login } from "../../app/api/auth/login/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt } from "../../lib/server/conversations/dispatch";

const origin = "http://127.0.0.1:3000";
const created: string[] = [];

async function db<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function fixture() {
  const signedIn = await login(new Request(`${origin}/api/auth/login`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }) }));
  const cookie = signedIn.headers.get("set-cookie")?.split(";")[0];
  const session = await getCurrentSession(new Request(origin, { headers: { cookie: cookie ?? "" } }));
  if (!session) throw new Error("Synthetic login failed");
  const operationId = randomUUID();
  const { conversation } = await createOwnedConversation(session,
    { customerId: DEMO_IDS.sharedCustomer, requestKey: operationId });
  created.push(conversation.id);
  const claim = await claimBinding(session, conversation.id, operationId);
  if (claim.state !== "claimed") throw new Error("Synthetic binding failed");
  const nativeId = `wrun_${randomUUID()}`;
  await bindNativeSession(session, conversation.id, claim.claimToken, nativeId);
  await db((client) => client.query(`INSERT INTO maintenance_workers
    (environment_id, worker_id, last_seen_at) VALUES ($1,'limits-worker',now())
    ON CONFLICT (environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,
  [process.env.TURAS_TEST_ENVIRONMENT_ID]).then(() => undefined));
  return { session, conversationId: conversation.id, nativeId };
}

describe("send admission limits", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });
  afterEach(async () => {
    if (!created.length) return;
    const ids = created.splice(0);
    await db(async (client) => {
      await client.query(`DELETE FROM watchdog_jobs WHERE attempt_id IN
        (SELECT id FROM response_attempts WHERE conversation_id = ANY($1::uuid[]))`, [ids]);
      await client.query("DELETE FROM response_attempts WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM submitted_messages WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [ids]);
    });
  });

  it("rejects more than 16 KiB of normalized input before recording a message", async () => {
    const f = await fixture();
    await expect(prepareAttempt(f.session, f.conversationId, f.nativeId,
      randomUUID(), "é".repeat(8_193))).rejects.toMatchObject({ status: 413 });
    const count = await db(async (client) => (await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM submitted_messages WHERE conversation_id = $1", [f.conversationId])).rows[0].n);
    expect(Number(count)).toBe(0);
  });

  it("enforces the twenty-per-minute threshold before a new dispatch", async () => {
    const f = await fixture();
    await db(async (client) => {
      for (let index = 0; index < 20; index++) {
        await client.query(`INSERT INTO submitted_messages
          (id,conversation_id,request_key,body_digest,text)
          VALUES ($1,$2,$3,$4,'Synthetic')`, [randomUUID(), f.conversationId,
          randomUUID(), "a".repeat(64)]);
      }
    });
    await expect(prepareAttempt(f.session, f.conversationId, f.nativeId,
      randomUUID(), "Another")).rejects.toMatchObject({ status: 429 });
  });

  it("enforces a recorded twenty-thousand output-token budget", async () => {
    const f = await fixture();
    await db(async (client) => {
      const messageId = randomUUID();
      await client.query(`INSERT INTO submitted_messages
        (id,conversation_id,request_key,body_digest,text) VALUES ($1,$2,$3,$4,'Synthetic')`,
      [messageId, f.conversationId, randomUUID(), "a".repeat(64)]);
      await client.query(`INSERT INTO response_attempts
        (id,conversation_id,message_id,input_digest,dispatch_state,response_state,output_tokens)
        VALUES ($1,$2,$3,$4,'admitted','completed',20000)`,
      [randomUUID(), f.conversationId, messageId, "a".repeat(64)]);
    });
    await expect(prepareAttempt(f.session, f.conversationId, f.nativeId,
      randomUUID(), "Another")).rejects.toMatchObject({ status: 429 });
  });

  it("allows at most two active attempts per principal", async () => {
    const first = await fixture(), second = await fixture(), third = await fixture();
    await prepareAttempt(first.session, first.conversationId, first.nativeId, randomUUID(), "One");
    await prepareAttempt(second.session, second.conversationId, second.nativeId, randomUUID(), "Two");
    await expect(prepareAttempt(third.session, third.conversationId, third.nativeId,
      randomUUID(), "Three")).rejects.toMatchObject({ status: 429 });
    const thirdMessages = await db(async (client) => (await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM submitted_messages WHERE conversation_id = $1",
      [third.conversationId])).rows[0].n);
    expect(Number(thirdMessages)).toBe(0);
  });

  it("allows at most twenty active attempts in the environment", async () => {
    const f = await fixture();
    await db(async (client) => {
      for (let index = 0; index < 20; index++) {
        const conversationId = randomUUID(), messageId = randomUUID();
        created.push(conversationId);
        await client.query(`INSERT INTO conversations
          (id,environment_id,workspace_id,customer_id,owner_principal_id,
           creation_operation_id,binding_state,title)
          VALUES ($1,$2,$3,$4,$5,$6,'unbound','Synthetic environment limit')`,
        [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, DEMO_IDS.workspace,
          DEMO_IDS.sharedCustomer, DEMO_IDS.mcteer, randomUUID()]);
        await client.query(`INSERT INTO submitted_messages
          (id,conversation_id,request_key,body_digest,text)
          VALUES ($1,$2,$3,$4,'Synthetic')`, [messageId, conversationId,
          randomUUID(), "a".repeat(64)]);
        await client.query(`INSERT INTO response_attempts
          (id,conversation_id,message_id,input_digest,dispatch_state,response_state)
          VALUES ($1,$2,$3,$4,'prepared','pending')`,
        [randomUUID(), conversationId, messageId, "a".repeat(64)]);
      }
    });
    await expect(prepareAttempt(f.session, f.conversationId, f.nativeId,
      randomUUID(), "Over environment limit")).rejects.toMatchObject({ status: 429 });
    const rejectedMessages = await db(async (client) => (await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM submitted_messages WHERE conversation_id = $1",
      [f.conversationId])).rows[0].n);
    expect(Number(rejectedMessages)).toBe(0);
  });

  it("denies new model work when the maintenance heartbeat is stale", async () => {
    const f = await fixture();
    await db((client) => client.query(`UPDATE maintenance_workers
      SET last_seen_at = now() - interval '20 seconds' WHERE environment_id = $1`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]).then(() => undefined));
    try {
      await expect(prepareAttempt(f.session, f.conversationId, f.nativeId,
        randomUUID(), "Worker unavailable")).rejects.toMatchObject({ status: 503 });
      const messages = await db(async (client) => (await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM submitted_messages WHERE conversation_id = $1",
        [f.conversationId])).rows[0].n);
      expect(Number(messages)).toBe(0);
    } finally {
      await db((client) => client.query(`UPDATE maintenance_workers
        SET last_seen_at = now() WHERE environment_id = $1`,
      [process.env.TURAS_TEST_ENVIRONMENT_ID]).then(() => undefined));
    }
  });
});
