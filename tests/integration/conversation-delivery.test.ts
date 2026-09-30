import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { POST as login } from "../../app/api/auth/login/route";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { claimBinding, markBindingUncertain, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch, recordNativeReceipt, markDispatchUncertain } from "../../lib/server/conversations/dispatch";
import { projectNativeEvent } from "../../lib/server/conversations/projection";
import { reconcileFromEvents } from "../../lib/server/conversations/reconcile";
import { requireTestDatabaseUrl } from "../fixtures/database";

const isolatedTestUrl = requireTestDatabaseUrl();
const createdIds: string[] = [];
async function withTestDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: isolatedTestUrl });
  await client.connect();
  try { return await run(client); }
  finally { await client.end(); }
}

describe("conversation persistence invariants", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });
  afterEach(async () => {
    await withTestDatabase(async (client) => {
      await client.query("DROP TRIGGER IF EXISTS turas_test_hook_fail ON event_projections");
      await client.query("DROP FUNCTION IF EXISTS turas_test_hook_fail()");
      await client.query("DROP TRIGGER IF EXISTS turas_test_attempt_fail ON response_attempts");
      await client.query("DROP FUNCTION IF EXISTS turas_test_attempt_fail()");
    });
    if (!createdIds.length) return;
    const ids = createdIds.splice(0);
    await withTestDatabase(async (client) => {
      await client.query("TRUNCATE context_injection_receipts, context_snapshot_receipts");
      await client.query("DELETE FROM watchdog_jobs WHERE attempt_id IN (SELECT id FROM response_attempts WHERE conversation_id = ANY($1::uuid[]))", [ids]);
      await client.query("DELETE FROM event_projections WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM response_attempts WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM submitted_messages WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [ids]);
    });
  });
  it("has durable conversations, attempts, projections and worker records", async () => {
    await withTestDatabase(async (client) => {
      const result = await client.query<{ name: string | null }>(`
        SELECT to_regclass('public.' || name)::text AS name FROM unnest($1::text[]) name
      `, [["conversations", "submitted_messages", "response_attempts", "event_projections",
        "watchdog_jobs", "maintenance_workers", "maintenance_nonces"]]);
      expect(result.rows.every((row) => row.name !== null)).toBe(true);
    });
  });

  it("keeps owner, customer and workspace immutable", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const id = randomUUID();
        await client.query(`INSERT INTO conversations
          (id, environment_id, workspace_id, customer_id, owner_principal_id,
           creation_operation_id, binding_state, title)
          VALUES ($1,$2,$3,$4,$5,$6,'unbound','Synthetic test')`,
        [id, process.env.TURAS_TEST_ENVIRONMENT_ID, DEMO_IDS.workspace,
          DEMO_IDS.sharedCustomer, DEMO_IDS.panel, randomUUID()]);
        await expect(client.query("UPDATE conversations SET owner_principal_id = $1 WHERE id = $2",
          [DEMO_IDS.mcteer, id])).rejects.toThrow();
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("serializes parked-session creation and retries one stable operation after a lost receipt", async () => {
    const origin = "http://127.0.0.1:3000";
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    expect(signedIn.status).toBe(200);
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const session = await getCurrentSession(new Request(origin, { headers: { cookie } }));
    if (!session) throw new Error("Login fixture failed");
    const key = randomUUID();
    const { conversation } = await createOwnedConversation(session,
      { customerId: DEMO_IDS.sharedCustomer, requestKey: key });
    createdIds.push(conversation.id);
    const start = new Date();
    const first = await claimBinding(session, conversation.id, key, start);
    expect(first.state).toBe("claimed");
    if (first.state !== "claimed") throw new Error("Expected binding claim");
    const concurrent = await claimBinding(session, conversation.id, key, start);
    expect(concurrent.state).toBe("pending");
    await markBindingUncertain(session, conversation.id, first.claimToken);
    const retried = await claimBinding(session, conversation.id, key,
      new Date(start.getTime() + 6_000));
    expect(retried.state).toBe("claimed");
    if (retried.state !== "claimed") throw new Error("Expected retry claim");
    expect(retried.operationId).toBe(first.operationId);
    const nativeId = `wrun_${randomUUID()}`;
    const bound = await bindNativeSession(session, conversation.id, retried.claimToken, nativeId);
    expect(bound.eveSessionId).toBe(nativeId);
    expect((await claimBinding(session, conversation.id, key)).state).toBe("bound");
  });

  it("deduplicates a message key and records the cursor and deadline before dispatch", async () => {
    const origin = "http://127.0.0.1:3000";
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const session = await getCurrentSession(new Request(origin, { headers: { cookie } }));
    if (!session) throw new Error("Login fixture failed");
    const key = randomUUID();
    const { conversation } = await createOwnedConversation(session,
      { customerId: DEMO_IDS.sharedCustomer, requestKey: randomUUID() });
    createdIds.push(conversation.id);
    const claim = await claimBinding(session, conversation.id, (await withTestDatabase(async (client) =>
      (await client.query<{ creation_operation_id: string }>("SELECT creation_operation_id FROM conversations WHERE id = $1",
        [conversation.id])).rows[0].creation_operation_id)));
    if (claim.state !== "claimed") throw new Error("Expected binding claim");
    const nativeId = `wrun_${randomUUID()}`;
    await bindNativeSession(session, conversation.id, claim.claimToken, nativeId);
    await withTestDatabase(async (client) => {
      await client.query(`INSERT INTO maintenance_workers (environment_id, worker_id, last_seen_at)
        VALUES ($1, 'test-worker', now()) ON CONFLICT (environment_id, worker_id)
        DO UPDATE SET last_seen_at = now()`, [process.env.TURAS_TEST_ENVIRONMENT_ID]);
    });
    const first = await prepareAttempt(session, conversation.id, nativeId, key, "Hello");
    expect(first.created).toBe(true);
    const replay = await prepareAttempt(session, conversation.id, nativeId, key, "Hello");
    expect(replay.created).toBe(false);
    expect(replay.attemptId).toBe(first.attemptId);
    await expect(prepareAttempt(session, conversation.id, nativeId, key, "Changed"))
      .rejects.toMatchObject({ status: 409 });
    await expect(prepareAttempt(session, conversation.id, nativeId, randomUUID(), "Another"))
      .rejects.toMatchObject({ status: 409 });
    const dispatched = await claimDispatch(session, conversation.id, first.attemptId, 5);
    expect(dispatched.dispatchStartIndex).toBe(5);
    expect(dispatched.deadlineAt.getTime() - dispatched.dispatchStartedAt.getTime()).toBe(120_000);
    const event = (type: string, data: Record<string, unknown>) => ({
      type, data, meta: { id: `evt_${randomUUID()}`, at: new Date().toISOString() },
    });
    expect((await reconcileFromEvents(nativeId, first.attemptId, [])).state).toBe("uncertain");
    const received = event("message.received", { message: "Hello", turnId: "turn_test", sequence: 0 });
    await projectNativeEvent(nativeId, first.attemptId, received);
    await projectNativeEvent(nativeId, first.attemptId, received);
    const completed = event("message.completed", { message: "Partial answer", turnId: "turn_test",
      stepIndex: 0, sequence: 0, finishReason: "stop" });
    await projectNativeEvent(nativeId, first.attemptId, completed);
    await withTestDatabase(async (client) => {
      const pending = await client.query<{ response_state: string }>(
        "SELECT response_state FROM response_attempts WHERE id = $1", [first.attemptId]);
      expect(pending.rows[0].response_state).toBe("running");
    });
    const terminal = event("turn.completed", { turnId: "turn_test", sequence: 0 });
    await projectNativeEvent(nativeId, first.attemptId, terminal);
    const repaired = await reconcileFromEvents(nativeId, first.attemptId, [
      { index: 2, event: event("message.received", { message: "Hello", turnId: "older" }) },
      { index: 5, event: received }, { index: 6, event: completed }, { index: 7, event: terminal },
    ]);
    expect(repaired.state).toBe("reconciled");
    expect(repaired.nextIndex).toBe(8);
    await withTestDatabase(async (client) => {
      const finished = await client.query<{ response_state: string }>(
        "SELECT response_state FROM response_attempts WHERE id = $1", [first.attemptId]);
      expect(finished.rows[0].response_state).toBe("completed");
      const count = await client.query<{ count: string }>(
        "SELECT count(*) FROM event_projections WHERE conversation_id = $1", [conversation.id]);
      expect(Number(count.rows[0].count)).toBe(3);
    });

    // This synthetic worker must remain live while remote disposable DB checks
    // exercise the earlier projection/reconciliation path.
    await withTestDatabase((client) => client.query(`UPDATE maintenance_workers
      SET last_seen_at=now() WHERE environment_id=$1`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]));
    const lostReceipt = await prepareAttempt(session, conversation.id, nativeId,
      randomUUID(), "Hello");
    expect(lostReceipt.created).toBe(true);
    await claimDispatch(session, conversation.id, lostReceipt.attemptId, 10);
    const recovered = await reconcileFromEvents(nativeId, lostReceipt.attemptId, [
      { index: 5, event: received },
      { index: 10, event: event("message.received", { message: "Hello", turnId: "turn_two", sequence: 1 }) },
      { index: 11, event: event("message.completed", { message: "Recovered", turnId: "turn_two",
        stepIndex: 0, sequence: 1, finishReason: "stop" }) },
      { index: 12, event: event("turn.completed", { turnId: "turn_two", sequence: 1 }) },
    ]);
    expect(recovered).toEqual({ state: "reconciled", nextIndex: 13 });
    await withTestDatabase(async (client) => {
      const result = await client.query<{ dispatch_state: string; response_state: string;
        input_event_id: string | null; native_receipt: unknown }>(
        "SELECT dispatch_state, response_state, input_event_id, native_receipt FROM response_attempts WHERE id = $1",
        [lostReceipt.attemptId]);
      expect(result.rows[0].dispatch_state).toBe("admitted");
      expect(result.rows[0].response_state).toBe("completed");
      expect(result.rows[0].input_event_id).toBeTruthy();
      expect(result.rows[0].native_receipt).toBeNull();
    });

    const combinedKey = randomUUID();
    const combined = await prepareAttempt(session, conversation.id, nativeId, combinedKey, "Combined outage");
    await claimDispatch(session, conversation.id, combined.attemptId, 20);
    const combinedInput = event("message.received", { message: "Combined outage",
      turnId: "turn_combined", sequence: 2 });
    await withTestDatabase(async (client) => {
      await client.query(`CREATE FUNCTION turas_test_hook_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected projection outage'; END $$`);
      await client.query(`CREATE TRIGGER turas_test_hook_fail BEFORE INSERT ON event_projections
        FOR EACH ROW EXECUTE FUNCTION turas_test_hook_fail()`);
    });
    await expect(projectNativeEvent(nativeId, combined.attemptId, combinedInput)).rejects.toThrow();
    await withTestDatabase(async (client) => {
      await client.query("DROP TRIGGER turas_test_hook_fail ON event_projections");
      await client.query("DROP FUNCTION turas_test_hook_fail()");
      const projections = await client.query<{ count: string }>(
        "SELECT count(*) FROM event_projections WHERE native_event_id = $1", [combinedInput.meta.id]);
      expect(Number(projections.rows[0].count)).toBe(0);
    });
    expect((await reconcileFromEvents(nativeId, combined.attemptId, [])).state).toBe("uncertain");
    const sameKey = await prepareAttempt(session, conversation.id, nativeId, combinedKey, "Combined outage");
    expect(sameKey).toMatchObject({ attemptId: combined.attemptId, created: false,
      dispatchState: "uncertain" });
    await expect(prepareAttempt(session, conversation.id, nativeId,
      randomUUID(), "No second dispatch")).rejects.toMatchObject({ status: 409 });
    const combinedOutput = event("message.completed", { message: "Recovered combined outage",
      turnId: "turn_combined", stepIndex: 0 });
    const combinedTerminal = event("turn.completed", { turnId: "turn_combined" });
    const afterRestart = JSON.parse(execFileSync(process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "tests/fixtures/reconcile-child.ts"], {
        input: JSON.stringify({ nativeSessionId: nativeId, attemptId: combined.attemptId, events: [
      { index: 20, event: combinedInput }, { index: 21, event: combinedOutput },
      { index: 22, event: combinedTerminal },
        ] }),
        env: { ...process.env, DATABASE_URL: isolatedTestUrl,
          TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID },
      }).toString("utf8")) as { state: string; nextIndex: number };
    expect(afterRestart).toEqual({ state: "reconciled", nextIndex: 23 });
    const replayed = await withTestDatabase(async (client) => (await client.query<{
      response_state: string; native_receipt: unknown; input_event_id: string;
    }>("SELECT response_state, native_receipt, input_event_id FROM response_attempts WHERE id = $1",
    [combined.attemptId])).rows[0]);
    expect(replayed).toMatchObject({ response_state: "completed", native_receipt: null,
      input_event_id: combinedInput.meta.id });

    await withTestDatabase((client) => client.query(`UPDATE maintenance_workers
      SET last_seen_at=now() WHERE environment_id=$1`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]));
    const ambiguousKey = randomUUID();
    const ambiguousAttempt = await prepareAttempt(session, conversation.id, nativeId,
      ambiguousKey, "Expected input");
    await claimDispatch(session, conversation.id, ambiguousAttempt.attemptId, 30);
    const mismatch = event("message.received", { message: "Different input",
      turnId: "turn_ambiguous", sequence: 3 });
    expect((await reconcileFromEvents(nativeId, ambiguousAttempt.attemptId,
      [{ index: 30, event: mismatch }])).state).toBe("ambiguous");
    const flagged = await withTestDatabase(async (client) => (await client.query<{
      dispatch_state: string; last_error_code: string; job_state: string;
    }>(`SELECT a.dispatch_state, a.last_error_code, j.state AS job_state
      FROM response_attempts a JOIN watchdog_jobs j ON j.attempt_id = a.id WHERE a.id = $1`,
    [ambiguousAttempt.attemptId])).rows[0]);
    expect(flagged).toMatchObject({ dispatch_state: "uncertain",
      last_error_code: "reconcile_ambiguous", job_state: "needs_attention" });
    await expect(prepareAttempt(session, conversation.id, nativeId,
      randomUUID(), "Should remain blocked")).rejects.toMatchObject({ status: 409 });
  });

  it("never delegates an unpersisted claim and blocks a lost post-admission receipt", async () => {
    const origin = "http://127.0.0.1:3000";
    const signedIn = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "panel", password: process.env.PANEL_PASSWORD }),
    }));
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const session = await getCurrentSession(new Request(origin, { headers: { cookie } }));
    if (!session) throw new Error("Login fixture failed");
    const operationId = randomUUID();
    const { conversation } = await createOwnedConversation(session,
      { customerId: DEMO_IDS.sharedCustomer, requestKey: operationId });
    createdIds.push(conversation.id);
    const binding = await claimBinding(session, conversation.id, operationId);
    if (binding.state !== "claimed") throw new Error("Binding fixture failed");
    const nativeId = `wrun_${randomUUID()}`;
    await bindNativeSession(session, conversation.id, binding.claimToken, nativeId);
    await withTestDatabase((client) => client.query(`INSERT INTO maintenance_workers
      (environment_id,worker_id,last_seen_at) VALUES ($1,'failure-worker',now())
      ON CONFLICT (environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]).then(() => undefined));
    const requestKey = randomUUID();
    const prepared = await prepareAttempt(session, conversation.id, nativeId, requestKey, "Synthetic failure");
    await withTestDatabase(async (client) => {
      await client.query(`CREATE FUNCTION turas_test_attempt_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected attempt write outage'; END $$`);
      await client.query(`CREATE TRIGGER turas_test_attempt_fail BEFORE UPDATE ON response_attempts
        FOR EACH ROW EXECUTE FUNCTION turas_test_attempt_fail()`);
    });
    await expect(claimDispatch(session, conversation.id, prepared.attemptId, 10)).rejects.toThrow();
    await withTestDatabase(async (client) => {
      await client.query("DROP TRIGGER turas_test_attempt_fail ON response_attempts");
      await client.query("DROP FUNCTION turas_test_attempt_fail()");
      const state = await client.query<{ dispatch_state: string }>(
        "SELECT dispatch_state FROM response_attempts WHERE id = $1", [prepared.attemptId]);
      expect(state.rows[0].dispatch_state).toBe("prepared");
      const jobs = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM watchdog_jobs WHERE attempt_id = $1", [prepared.attemptId]);
      expect(Number(jobs.rows[0].n)).toBe(0);
    });
    await claimDispatch(session, conversation.id, prepared.attemptId, 10);
    await withTestDatabase(async (client) => {
      await client.query(`CREATE FUNCTION turas_test_attempt_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected receipt write outage'; END $$`);
      await client.query(`CREATE TRIGGER turas_test_attempt_fail BEFORE UPDATE ON response_attempts
        FOR EACH ROW EXECUTE FUNCTION turas_test_attempt_fail()`);
    });
    await expect(recordNativeReceipt(session, conversation.id, prepared.attemptId,
      Response.json({ ok: true, status: "accepted", deliveryId: "lost" }, { status: 202 })))
      .rejects.toThrow();
    await withTestDatabase(async (client) => {
      await client.query("DROP TRIGGER turas_test_attempt_fail ON response_attempts");
      await client.query("DROP FUNCTION turas_test_attempt_fail()");
    });
    await markDispatchUncertain(session, conversation.id, prepared.attemptId);
    expect(await prepareAttempt(session, conversation.id, nativeId, requestKey,
      "Synthetic failure")).toMatchObject({ created: false, dispatchState: "uncertain" });
    await expect(prepareAttempt(session, conversation.id, nativeId,
      randomUUID(), "Another delivery")).rejects.toMatchObject({ status: 409 });
  });
});
