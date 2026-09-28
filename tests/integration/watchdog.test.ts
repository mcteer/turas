import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signMaintenanceRequest, verifyMaintenanceRequest, claimDueJobs, finishDueJob } from "../../lib/server/conversations/watchdog";
import { performMaintenance } from "../../lib/server/conversations/maintenance";
import type { AttachSessionFn } from "eve/channels";

const path = "/internal/turas/maintenance";
const created: string[] = [];

async function db<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function dueFixture(secondsUntilDeadline = -10): Promise<{ conversationId: string; attemptId: string }> {
  const conversationId = randomUUID(), messageId = randomUUID(), attemptId = randomUUID();
  const deadline = new Date(Date.now() + secondsUntilDeadline * 1_000);
  const dispatchStarted = new Date(deadline.getTime() - 120_000);
  created.push(conversationId);
  await db(async (client) => {
    await client.query(`INSERT INTO conversations
      (id, environment_id, workspace_id, customer_id, owner_principal_id,
       creation_operation_id, binding_state, eve_session_id, title)
      VALUES ($1,$2,$3,$4,$5,$6,'bound',$7,'Watchdog synthetic')`,
    [conversationId, process.env.TURAS_TEST_ENVIRONMENT_ID, DEMO_IDS.workspace,
      DEMO_IDS.sharedCustomer, DEMO_IDS.panel, randomUUID(), `wrun_${randomUUID()}`]);
    await client.query(`INSERT INTO submitted_messages
      (id,conversation_id,request_key,body_digest,text) VALUES ($1,$2,$3,$4,$5)`,
    [messageId, conversationId, randomUUID(), "a".repeat(64), "Synthetic input"]);
    await client.query(`INSERT INTO response_attempts
      (id,conversation_id,message_id,input_digest,dispatch_state,response_state,
       dispatch_start_index,dispatch_started_at,deadline_at)
      VALUES ($1,$2,$3,$4,'dispatching','running',0,$5,$6)`,
    [attemptId, conversationId, messageId, "a".repeat(64), dispatchStarted, deadline]);
    await client.query(`INSERT INTO watchdog_jobs
      (attempt_id,deadline_at,state,next_attempt_at)
      SELECT id, deadline_at, 'pending', deadline_at FROM response_attempts WHERE id = $1`, [attemptId]);
  });
  return { conversationId, attemptId };
}

describe("maintenance request authority", () => {
  beforeAll(() => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Isolated test database required");
    }
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  });
  afterEach(async () => {
    if (!created.length) return;
    const ids = created.splice(0);
    await db(async (client) => {
      await client.query("TRUNCATE context_injection_receipts, context_snapshot_receipts");
      await client.query(`DELETE FROM watchdog_jobs WHERE attempt_id IN
        (SELECT id FROM response_attempts WHERE conversation_id = ANY($1::uuid[]))`, [ids]);
      await client.query("DELETE FROM response_attempts WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM submitted_messages WHERE conversation_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [ids]);
    });
  });

  it("accepts one signed request and rejects a replay, invalid signature and demo cookie", async () => {
    const body = JSON.stringify({ action: "reconcile", attemptId: randomUUID(),
      environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID });
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signMaintenanceRequest("POST", path, timestamp, nonce, body);
    const request = (nonceValue: string, signatureValue: string, cookie?: string) =>
      new Request(`http://127.0.0.1:2000${path}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-turas-timestamp": timestamp, "x-turas-nonce": nonceValue,
          "x-turas-signature": signatureValue, ...(cookie ? { cookie } : {}) }, body,
      });
    await expect(verifyMaintenanceRequest(request(nonce, "0".repeat(64))))
      .rejects.toMatchObject({ status: 403 });
    await expect(verifyMaintenanceRequest(request(randomUUID(), signature, "turas_session=fake")))
      .rejects.toMatchObject({ status: 403 });
    expect((await verifyMaintenanceRequest(request(nonce, signature))).action).toBe("reconcile");
    await expect(verifyMaintenanceRequest(request(nonce, signature)))
      .rejects.toMatchObject({ status: 403 });
  });

  it("leases each overdue attempt to one worker and recovers an expired lease", async () => {
    const { attemptId } = await dueFixture();
    const [first, simultaneous] = await Promise.all([
      claimDueJobs("worker-one"), claimDueJobs("worker-two"),
    ]);
    expect([...first, ...simultaneous].filter((job) => job.attemptId === attemptId)).toHaveLength(1);
    expect((await claimDueJobs("worker-three")).some((job) => job.attemptId === attemptId)).toBe(false);
    await db(async (client) => {
      await client.query(`UPDATE watchdog_jobs SET lease_expires_at = now() - interval '1 second'
        WHERE attempt_id = $1`, [attemptId]);
    });
    const recovered = await claimDueJobs("worker-three");
    expect(recovered.map((job) => job.attemptId)).toContain(attemptId);
    await finishDueJob("worker-one", attemptId, "settled");
    const status = await db(async (client) => (await client.query<{ state: string }>(
      "SELECT state FROM watchdog_jobs WHERE attempt_id = $1", [attemptId])).rows[0].state);
    expect(status).toBe("leased");
    await finishDueJob("worker-three", attemptId, "settled");
    const settled = await db(async (client) => (await client.query<{ state: string }>(
      "SELECT state FROM watchdog_jobs WHERE attempt_id = $1", [attemptId])).rows[0].state);
    expect(settled).toBe("settled");
  });

  it("targets the original observed turn after owner disablement and a lost cancel receipt", async () => {
    const { attemptId } = await dueFixture();
    await db(async (client) => {
      await client.query("UPDATE response_attempts SET native_turn_id = 'turn_original' WHERE id = $1", [attemptId]);
      await client.query("UPDATE principals SET active = false WHERE id = $1", [DEMO_IDS.panel]);
    });
    const cancelled: string[] = [];
    const attachSession = (() => ({
      getStreamTailIndex: async () => -1,
      cancel: async ({ turnId }: { turnId: string }) => {
        cancelled.push(turnId);
        if (cancelled.length === 1) throw new Error("injected lost cancel receipt");
        return { status: "accepted" };
      },
    })) as unknown as AttachSessionFn;
    try {
      expect((await claimDueJobs("cancel-worker")).map((job) => job.attemptId)).toContain(attemptId);
      await expect(performMaintenance({ action: "cancel_due", attemptId,
        environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID! }, attachSession)).rejects.toThrow();
      await finishDueJob("cancel-worker", attemptId, "retry", "cancel_receipt_lost");
      await db(async (client) => {
        await client.query(`UPDATE watchdog_jobs SET next_attempt_at = now() - interval '1 second'
          WHERE attempt_id = $1`, [attemptId]);
      });
      expect((await claimDueJobs("retry-worker")).map((job) => job.attemptId)).toContain(attemptId);
      expect(await performMaintenance({ action: "cancel_due", attemptId,
        environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID! }, attachSession)).toBe("cancel_requested");
      expect(cancelled).toEqual(["turn_original", "turn_original"]);
      const state = await db(async (client) => (await client.query<{ response_state: string }>(
        "SELECT response_state FROM response_attempts WHERE id = $1", [attemptId])).rows[0].response_state);
      expect(state).toBe("running");
    } finally {
      await db((client) => client.query("UPDATE principals SET active = true WHERE id = $1",
        [DEMO_IDS.panel]).then(() => undefined));
    }
  });

  it("does not claim a turn before its stored deadline and claims it after restart", async () => {
    const beforeDeadline = await dueFixture(10); // dispatch began at simulated t=110s
    const childClaim = (workerId: string) => JSON.parse(execFileSync(process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "tests/fixtures/watchdog-child.ts", workerId], {
        env: { ...process.env, DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
          TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID },
      }).toString("utf8")) as string[];
    expect(childClaim("restart-worker-before")).not.toContain(beforeDeadline.attemptId);
    const afterDeadline = await dueFixture(-5); // dispatch began at simulated t=125s
    expect(childClaim("restart-worker-after")).toContain(afterDeadline.attemptId);
    expect((await claimDueJobs("second-worker")).map((job) => job.attemptId))
      .not.toContain(afterDeadline.attemptId);
  });

  it("settles a stale job without cancelling a later turn", async () => {
    const { conversationId, attemptId } = await dueFixture();
    await db(async (client) => {
      await client.query("UPDATE response_attempts SET response_state = 'completed' WHERE id = $1", [attemptId]);
      const messageId = randomUUID();
      await client.query(`INSERT INTO submitted_messages
        (id,conversation_id,request_key,body_digest,text) VALUES ($1,$2,$3,$4,'Later')`,
      [messageId, conversationId, randomUUID(), "b".repeat(64)]);
      await client.query(`INSERT INTO response_attempts
        (id,conversation_id,message_id,input_digest,dispatch_state,response_state,native_turn_id)
        VALUES ($1,$2,$3,$4,'admitted','running','turn_later')`,
      [randomUUID(), conversationId, messageId, "b".repeat(64)]);
    });
    expect((await claimDueJobs("stale-worker")).map((job) => job.attemptId)).toContain(attemptId);
    let cancellations = 0;
    const attach = (() => ({ cancel: async () => { cancellations += 1; } })) as unknown as AttachSessionFn;
    expect(await performMaintenance({ action: "cancel_due", attemptId,
      environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID! }, attach)).toBe("settled");
    expect(cancellations).toBe(0);
    await finishDueJob("stale-worker", attemptId, "settled");
  });

  it("keeps an unconfirmed turn blocked and exposes attention after bounded maintenance failures", async () => {
    const { attemptId } = await dueFixture();
    for (let failure = 1; failure <= 5; failure++) {
      const workerId = `failure-worker-${failure}`;
      expect((await claimDueJobs(workerId)).map((job) => job.attemptId)).toContain(attemptId);
      await finishDueJob(workerId, attemptId, "retry", "native_generation_unavailable");
      const state = await db(async (client) => (await client.query<{
        state: string; failure_count: number;
      }>("SELECT state, failure_count FROM watchdog_jobs WHERE attempt_id = $1",
      [attemptId])).rows[0]);
      expect(state.failure_count).toBe(failure);
      expect(state.state).toBe(failure === 5 ? "needs_attention" : "pending");
      if (failure < 5) await db((client) => client.query(`UPDATE watchdog_jobs
        SET next_attempt_at = now() - interval '1 second' WHERE attempt_id = $1`,
      [attemptId]).then(() => undefined));
    }
    expect((await claimDueJobs("another-worker")).some((job) => job.attemptId === attemptId)).toBe(false);
    const response = await db(async (client) => (await client.query<{
      response_state: string; dispatch_state: string;
    }>("SELECT response_state, dispatch_state FROM response_attempts WHERE id = $1",
    [attemptId])).rows[0]);
    expect(response).toEqual({ response_state: "running", dispatch_state: "dispatching" });
  });
});
