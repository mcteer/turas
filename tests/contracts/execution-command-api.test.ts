import { lockExecutionActor } from "../../lib/server/execution/policy";
import { verifyExecutionSources } from "../../lib/server/execution/sources";
import { withTransaction } from "../../lib/server/db/client";
import { createExecutionBaseline } from "../fixtures/execution/baseline";
import { chargeExecutionRate } from "../../lib/server/execution/locks";
import { randomUUID } from "node:crypto";
import { withExecutionDatabase } from "../fixtures/execution/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { createExecutionPreview, assertExecutionPreview, executionCursor, readExecutionCursor } from "../../lib/server/execution/previews";
import { describe, expect, it } from "vitest";
import { executionCommandSchema, executionPeriodSchema } from "../../lib/server/execution/schema";
import { executeExecutionCommand, readExecutionReceipt, executionDigest } from "../../lib/server/execution/commands";

describe("strict execution command boundaries", () => {
  it("refuses authority flags, invalid request identities and stale version shapes", () => {
    const valid = { version: "execution-v1", action: "setup", requestKey: randomUUID(),
      expectedVersions: { baseline: 1, plan: 1 }, payload: { baselineId: randomUUID() } };
    expect(executionCommandSchema.safeParse(valid).success).toBe(true);
    for (const data of [{ ...valid, reviewer: true }, { ...valid, requestKey: "not-a-uuid" },
      { ...valid, expectedVersions: { baseline: 0 } }, { ...valid, payload: { baselineId: randomUUID(), actorId: randomUUID() } }])
      expect(executionCommandSchema.safeParse(data).success).toBe(false);
  });
  it("uses real inclusive dates and rejects period overflow rather than truncating", () => {
    expect(executionPeriodSchema.safeParse({ from: "2024-02-29", to: "2024-03-01" }).success).toBe(true);
    for (const data of [{ from: "2025-02-29", to: "2025-03-01" }, { from: "2026-01-01", to: "2026-05-01" },
      { from: "2026-01-02", to: "2026-01-01" }]) expect(executionPeriodSchema.safeParse(data).success).toBe(false);
  });
  it("normalizes object key order but distinguishes actual command changes", () => {
    expect(executionDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(executionDigest({ b: { d: 3, c: 2 }, a: 1 }));
    expect(executionDigest({ minutes: 1 })).not.toBe(executionDigest({ minutes: 2 }));
  });
});

describe("signed execution review inputs", () => {
  it("binds exact candidate, actor, session and expiry", async () => {
    await withExecutionDatabase(async db => {
      const actor = await createProfileTestSession(db, "mcteer"), panel = await createProfileTestSession(db, "panel");
      const now = Date.now(), input = { revisionId: randomUUID(), generation: 1 }, preview = createExecutionPreview(actor, input, now);
      expect(() => assertExecutionPreview(actor, input, preview, now)).not.toThrow();
      expect(() => assertExecutionPreview(panel, input, preview, now)).toThrow();
      expect(() => assertExecutionPreview({ ...actor, sessionId: randomUUID() }, input, preview, now)).toThrow();
      expect(() => assertExecutionPreview(actor, { ...input, generation: 2 }, preview, now)).toThrow();
      expect(() => assertExecutionPreview(actor, input, preview, now + 300_000)).toThrow();
    });
  });
  it("binds pages to actor, filter and generation and rejects tampering or expiry", () => {
    const now = Date.now(), scope = { member: randomUUID(), generation: 4, kind: "activity" };
    const cursor = executionCursor(scope, new Date(now).toISOString(), randomUUID(), now);
    expect(readExecutionCursor(cursor, scope, now)?.scope).toMatch(/^[a-f0-9]{64}$/);
    expect(() => readExecutionCursor(cursor, { ...scope, generation: 5 }, now)).toThrow();
    expect(() => readExecutionCursor(cursor, scope, now + 600_000)).toThrow();
    expect(() => readExecutionCursor(cursor.slice(0, -1) + (cursor.endsWith("0") ? "1" : "0"), scope, now)).toThrow();
  });
});


describe("atomic execution rate windows", () => {
  it("bounds new write intake independently and retains reads/review after exhaustion", async () => {
    await withExecutionDatabase(async db => {
      await db.query("BEGIN");
      try {
        const actor = await createProfileTestSession(db, "panel");
        await db.query(`INSERT INTO execution_rate_windows(environment_id,workspace_id,membership_id,bucket,window_start,count)
          VALUES($1,$2,$3,'write',date_trunc('minute',clock_timestamp()),60)`,
          [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId]);
        await expect(chargeExecutionRate(db, actor, "write")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });
        await chargeExecutionRate(db, actor, "read");
        await chargeExecutionRate(db, actor, "review");
        expect((await db.query("SELECT count FROM execution_rate_windows WHERE membership_id=$1 AND bucket='write'", [actor.membershipId])).rows[0].count).toBe(60);
      } finally { await db.query("ROLLBACK"); }
    });
  });
});

describe("durable execution command identity", () => {
  it("converges concurrent first writes, refuses changed input, and rechecks live authority on replay", async () => {
    const fixture = await withTransaction(db => createExecutionBaseline(db));
    const command = { version: "execution-v1", action: "setup", requestKey: randomUUID(),
      expectedVersions: { baseline: 1, plan: 1 }, payload: { baselineId: fixture.baselineId } };
    let applied = 0;
    const handler = async () => { applied++; return { state: "committed" as const, executionGeneration: 1, changed: [{ id: randomUUID(), version: 1 }] }; };
    const [a,b] = await Promise.all([executeExecutionCommand(fixture.author, fixture.engagementId, command, handler),
      executeExecutionCommand(fixture.author, fixture.engagementId, command, handler)]);
    expect(a).toEqual(b); expect(applied).toBe(1);
    expect(await readExecutionReceipt(fixture.author, command.requestKey)).toEqual(a);
    await expect(executeExecutionCommand(fixture.author, fixture.engagementId, { ...command, expectedVersions: { baseline: 2, plan: 1 } }, handler))
      .rejects.toMatchObject({ status: 409, code: "key_conflict" });
    await withTransaction(db => db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [fixture.author.sessionId]));
    await expect(executeExecutionCommand(fixture.author, fixture.engagementId, command, handler)).rejects.toMatchObject({ status: 401 });
    await expect(readExecutionReceipt(fixture.author, command.requestKey)).rejects.toMatchObject({ status: 401 });
    expect(applied).toBe(1);
  });
  it("rolls back metadata receipt when the handler fails", async () => {
    const fixture = await withTransaction(db => createExecutionBaseline(db)), requestKey = randomUUID();
    await expect(executeExecutionCommand(fixture.author, fixture.engagementId,
      { version: "execution-v1", action: "setup", requestKey, expectedVersions: { baseline: 1, plan: 1 }, payload: { baselineId: fixture.baselineId } },
      async db => { await db.query("SELECT 1"); throw new Error("Synthetic rollback"); })).rejects.toThrow("Synthetic rollback");
    await expect(readExecutionReceipt(fixture.author, requestKey)).rejects.toMatchObject({ status: 404 });
  });
});

describe("authoritative execution evidence", () => {
  it("uses the exact accepted baseline and refuses missing or changed source identities", async () => {
    const f = await withTransaction(db => createExecutionBaseline(db));
    await withTransaction(async db => {
      await lockExecutionActor(db,f.author,f.customerId,"read");
      const reference = { id: randomUUID(), kind: "milestone_baseline" as const, sourceRevisionId: f.baselineId,
        generation: 1, contentDigest: f.created.contentDigest };
      expect(await verifyExecutionSources(db,f.author,f.customerId,f.engagementId,"delivery",[reference],true)).toMatch(/^[a-f0-9]{64}$/);
      await expect(verifyExecutionSources(db,f.author,f.customerId,f.engagementId,"delivery",[{ ...reference,generation:2 }],true)).rejects.toMatchObject({ status:409 });
      await expect(verifyExecutionSources(db,f.author,f.customerId,f.engagementId,"delivery",[{ ...reference,kind:"execution_record",sourceRevisionId:randomUUID() }],true)).rejects.toMatchObject({ status:409 });
    });
  });
});
