import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { getServerConfig } from "../../lib/server/config";
import { lockStaffingActor } from "../../lib/server/staffing/policy";
import { createProfileTestSession } from "../fixtures/profiles";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

describe("current singleton staffing authority", () => {
  it("allows mcteer for both predicates and panel only for operational access", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT staffing_policy");
      try {
        const manager = await createProfileTestSession(db, "mcteer");
        const panel = await createProfileTestSession(db, "panel");
        await lockStaffingActor(db, manager, "manager");
        await lockStaffingActor(db, manager, "finance");
        await lockStaffingActor(db, panel, "operational");
        await expect(lockStaffingActor(db, panel, "manager")).rejects.toMatchObject({ status: 403 });
        await expect(lockStaffingActor(db, panel, "finance")).rejects.toMatchObject({ status: 403 });
        const partner = await createProfileTestSession(db, "partner");
        await expect(lockStaffingActor(db, partner, "operational")).rejects.toMatchObject({ status: 403 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_policy"); }
    });
  });

  it("denies another live admin even when its supplied login name is mcteer", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT staffing_policy");
      try {
        const principalId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
        await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic other admin')",
          [principalId, `synthetic_${principalId}`]);
        await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')",
          [membershipId, principalId, DEMO_IDS.workspace]);
        await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [sessionId, principalId, "a".repeat(64)]);
        const actor = { principalId, membershipId, sessionId, workspaceId: DEMO_IDS.workspace,
          kind: "internal" as const, role: "admin" as const, loginName: "mcteer", displayName: "Synthetic",
          token: "fixture", expiresAt: new Date(Date.now() + 3_600_000) };
        await expect(lockStaffingActor(db, actor, "manager")).rejects.toMatchObject({ status: 403 });
        await expect(lockStaffingActor(db, actor, "finance")).rejects.toMatchObject({ status: 403 });
        await expect(lockStaffingActor(db, { ...actor, principalId: DEMO_IDS.mcteer }, "manager"))
          .rejects.toMatchObject({ status: 401 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_policy"); }
    });
  });

  it("rechecks revocation, role and workspace before reads and receipt reconciliation", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT staffing_policy");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]);
        await expect(lockStaffingActor(db, actor, "manager")).rejects.toMatchObject({ status: 401 });
        await db.query("UPDATE login_sessions SET revoked_at=NULL WHERE id=$1", [actor.sessionId]);
        await db.query("UPDATE memberships SET role='member' WHERE id=$1", [actor.membershipId]);
        await expect(lockStaffingActor(db, actor, "finance")).rejects.toMatchObject({ status: 401 });
        await db.query("UPDATE memberships SET role='admin' WHERE id=$1", [actor.membershipId]);
        await db.query("UPDATE workspaces SET active=false WHERE id=$1", [actor.workspaceId]);
        await expect(lockStaffingActor(db, actor, "operational")).rejects.toMatchObject({ status: 401 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_policy"); }
    });
  });

  it("denies disabled principal and membership even with an unexpired session", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT staffing_policy");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        await db.query("UPDATE principals SET active=false WHERE id=$1", [actor.principalId]);
        await expect(lockStaffingActor(db, actor, "manager")).rejects.toMatchObject({ status: 401 });
        await db.query("UPDATE principals SET active=true WHERE id=$1", [actor.principalId]);
        await db.query("UPDATE memberships SET active=false WHERE id=$1", [actor.membershipId]);
        await expect(lockStaffingActor(db, actor, "manager")).rejects.toMatchObject({ status: 401 });
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_policy"); }
    });
  });

  it("does not create a fictitious customer for workforce scope and denies foreign customers", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT staffing_policy");
      try {
        const actor = await createProfileTestSession(db, "mcteer");
        await lockStaffingActor(db, actor, "manager");
        await lockStaffingActor(db, actor, "operational", { customerId: DEMO_IDS.sharedCustomer });
        await expect(lockStaffingActor(db, actor, "operational", { customerId: randomUUID() }))
          .rejects.toMatchObject({ status: 404, code: "not_found" });
        expect(getServerConfig().TURAS_ENVIRONMENT_ID).toBe(process.env.TURAS_TEST_ENVIRONMENT_ID);
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_policy"); }
    });
  });
});
