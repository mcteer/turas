import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction, query } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { runStaffingCommand, readStaffingCommandReceipt, reserveStaffingRate, tryStaffingCommandReplay } from "../../lib/server/staffing/commands";

import { createSessionToken, hashSessionToken, sessionCookieName } from "../../lib/server/auth/sessions";
import { GET } from "../../app/api/staffing/commands/[requestKey]/route";

const options = { capability: "manager" as const, table: "workforce_command_receipts" as const };
describe("authorized digest-bound staffing commands", () => {
  it("standalone preparation replays only a current-authorized exact committed digest without reserving another write", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const request = { requestKey: randomUUID(), action: "resource_create", rationale: "Synthetic standalone replay" };
    expect(await tryStaffingCommandReplay(actor, request, options)).toBeNull();
    const result = await runStaffingCommand(actor, request, options, async () => ({ resourceId: randomUUID(), state: "active" }));
    const before = await query("SELECT window_start,count FROM staffing_write_windows WHERE actor_membership_id=$1 ORDER BY window_start", [actor.membershipId]);
    expect(await tryStaffingCommandReplay(actor, request, options)).toEqual(result);
    expect(await query("SELECT window_start,count FROM staffing_write_windows WHERE actor_membership_id=$1 ORDER BY window_start", [actor.membershipId])).toEqual(before);
    await expect(tryStaffingCommandReplay(actor, { ...request, rationale: "Synthetic different digest" }, options)).rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
    await expect(tryStaffingCommandReplay(actor, request, { ...options, table: "staffing_command_receipts" })).rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
    const panel = await withTransaction(db => createProfileTestSession(db, "panel"));
    await expect(tryStaffingCommandReplay(panel, request, options)).rejects.toMatchObject({ status: 403 });
    await query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
    await expect(tryStaffingCommandReplay(actor, request, options)).rejects.toMatchObject({ status: 401 });
  }, 120_000);
  it("replays IDs once, rejects changed input and rechecks current authority", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT command_fixture");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        const request = { requestKey: randomUUID(), action: "resource_create" };
        let calls = 0;
        const execute = async () => { calls++; return { resourceId: randomUUID(), state: "active" }; };
        const first = await runStaffingCommand(actor, request, options, execute, db);
        expect(await runStaffingCommand(actor, request, options, execute, db)).toEqual(first);
        expect(await readStaffingCommandReceipt(actor, request.requestKey, db)).toEqual(first);
        expect(calls).toBe(1);
        await expect(runStaffingCommand(actor, request, { ...options, table: "staffing_command_receipts" }, execute, db))
          .rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
        await expect(runStaffingCommand(actor, { ...request, changed: true }, options, execute, db))
          .rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
        const panel = await createProfileTestSession(db, "panel");
        await expect(readStaffingCommandReceipt(panel, request.requestKey, db)).rejects.toMatchObject({ status: 404 });
        await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
        await expect(readStaffingCommandReceipt(actor, request.requestKey, db)).rejects.toMatchObject({ status: 401 });
        await expect(runStaffingCommand(actor, request, options, execute, db)).rejects.toMatchObject({ status: 401 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT command_fixture"); }
    });
  });
  it("rolls back domain writes when the response contains private fields", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT command_fixture");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        const key = randomUUID(), id = randomUUID();
        await expect(runStaffingCommand(actor, { requestKey: key, action: "resource_create" }, options, async client => {
          await client.query(`INSERT INTO workforce_resources(id,environment_id,workspace_id,external_key,kind,created_by_membership_id)
            VALUES($1,$2,$3,$4,'internal',$5)`, [id, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, id, actor.membershipId]);
          return { resourceId: id, evidence: "PRIVATE_SENTINEL" };
        }, db)).rejects.toBeDefined();
        expect((await db.query("SELECT id FROM workforce_resources WHERE id=$1", [id])).rowCount).toBe(0);
        expect((await db.query("SELECT id FROM workforce_command_receipts WHERE request_key=$1", [key])).rowCount).toBe(0);
      } finally { await db.query("ROLLBACK TO SAVEPOINT command_fixture"); }
    });
  });
  it("reserves exactly the bounded import admission count atomically", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT command_fixture");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        await db.query("DELETE FROM staffing_write_windows WHERE actor_membership_id=$1", [actor.membershipId]);
        for (let i = 0; i < 5; i++) await reserveStaffingRate(db, actor, "import");
        await expect(reserveStaffingRate(db, actor, "import")).rejects.toMatchObject({ status: 429 });
        expect((await db.query("SELECT count FROM staffing_write_windows WHERE actor_membership_id=$1", [actor.membershipId])).rows[0].count).toBe(5);
      } finally { await db.query("ROLLBACK TO SAVEPOINT command_fixture"); }
    });
  });
  it("serves no-store actor-only receipts through the authenticated HTTP route", async () => {
    requireOwnedStaffingClone();
    const token = createSessionToken();
    const actor = await withTransaction(async db => {
      const session = await createProfileTestSession(db, "mcteer");
      await db.query("UPDATE login_sessions SET token_hash=$1 WHERE id=$2", [hashSessionToken(token), session.sessionId]);
      return { ...session, token };
    });
    const key = randomUUID();
    const result = await runStaffingCommand(actor, { requestKey: key, action: "resource_create" }, options,
      async () => ({ resourceId: randomUUID(), state: "active" }));
    const context = { params: Promise.resolve({ requestKey: key }) };
    const url = `${process.env.TURAS_APP_ORIGIN}/api/staffing/commands/${key}`;
    expect((await GET(new Request(url), context)).status).toBe(401);
    const response = await GET(new Request(url, { headers: { cookie: `${sessionCookieName()}=${token}` } }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toEqual(result);
    await query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
    const revoked = await GET(new Request(url, { headers: { cookie: `${sessionCookieName()}=${token}` } }), context);
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(await revoked.json())).not.toContain(result.resourceId);
  });

  it("concurrent identical creates leave one resource and one receipt", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const key = randomUUID(), externalKey = `race_${key}`;
    const request = { requestKey: key, action: "resource_create", externalKey };
    const execute = async (db: Parameters<Parameters<typeof withTransaction>[0]>[0]) => {
      const id = randomUUID();
      await db.query(`INSERT INTO workforce_resources(id,environment_id,workspace_id,external_key,kind,created_by_membership_id)
        VALUES($1,$2,$3,$4,'internal',$5)`, [id, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, externalKey, actor.membershipId]);
      return { resourceId: id };
    };
    const results = await Promise.all([runStaffingCommand(actor, request, options, execute),
      withTransaction(db => runStaffingCommand(actor, request, options, execute, db))]);
    expect(results[0]).toEqual(results[1]);
    expect((await query("SELECT id FROM workforce_resources WHERE external_key=$1", [externalKey])).rowCount).toBe(1);
    expect((await query("SELECT id FROM workforce_command_receipts WHERE request_key=$1", [key])).rowCount).toBe(1);
  });
});
