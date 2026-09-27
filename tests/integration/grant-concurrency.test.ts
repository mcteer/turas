import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { setMembershipActive, setPartnerGrant } from "../../lib/server/access/service";
import { DEMO_IDS } from "../fixtures/identities";

const runFile = promisify(execFile);

describe("partner grant concurrency", () => {
  it("commits one decision and rejects its conflicting peer", async () => {
    if (!process.env.TURAS_TEST_DATABASE_URL) throw new Error("Isolated test database required");
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    await runFile(process.execPath, ["--experimental-strip-types", "scripts/bootstrap-demo.ts"], {
      cwd: process.cwd(), env: process.env,
    });
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("DELETE FROM customer_grants WHERE membership_id = $1 AND customer_id = $2", [DEMO_IDS.partnerMembership, DEMO_IDS.deniedCustomer]);
      const beforeAudit = await client.query<{ count: string }>(
        "SELECT count(*) FROM access_audit WHERE action = 'grant_change' AND customer_id = $1",
        [DEMO_IDS.deniedCustomer],
      );
      const input = {
        actorPrincipalId: DEMO_IDS.mcteer,
        membershipId: DEMO_IDS.partnerMembership,
        customerId: DEMO_IDS.deniedCustomer,
        expectedRevision: 0,
        state: "active" as const,
      };
      const results = await Promise.allSettled([
        setPartnerGrant({ ...input, requestKey: randomUUID() }),
        setPartnerGrant({ ...input, requestKey: randomUUID() }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const grant = await client.query("SELECT revision FROM customer_grants WHERE membership_id = $1 AND customer_id = $2", [DEMO_IDS.partnerMembership, DEMO_IDS.deniedCustomer]);
      expect(Number(grant.rows[0]?.revision)).toBe(1);
      const afterAudit = await client.query<{ count: string }>(
        "SELECT count(*) FROM access_audit WHERE action = 'grant_change' AND customer_id = $1",
        [DEMO_IDS.deniedCustomer],
      );
      expect(Number(afterAudit.rows[0].count) - Number(beforeAudit.rows[0].count)).toBe(1);
    } finally {
      await client.query("DELETE FROM customer_grants WHERE membership_id = $1 AND customer_id = $2", [DEMO_IDS.partnerMembership, DEMO_IDS.deniedCustomer]);
      await client.end();
    }
  });

  it("keeps the final administrator active", async () => {
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    await expect(setMembershipActive({
      actorPrincipalId: DEMO_IDS.mcteer,
      membershipId: DEMO_IDS.mcteerMembership,
      expectedRevision: 0,
      active: false,
      requestKey: randomUUID(),
    })).rejects.toMatchObject({ code: "last_admin" });
  });

  it("does not allow two simultaneous disables to remove every administrator", async () => {
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    const extraPrincipal = randomUUID();
    const extraMembership = randomUUID();
    try {
      await client.query(
        "INSERT INTO principals (id, login_name, display_name) VALUES ($1, $2, 'Fixture administrator')",
        [extraPrincipal, `fixture-${extraPrincipal}`],
      );
      await client.query(
        `INSERT INTO memberships (id, principal_id, workspace_id, kind, role)
         VALUES ($1, $2, $3, 'internal', 'admin')`,
        [extraMembership, extraPrincipal, DEMO_IDS.workspace],
      );
      const decisions = await Promise.allSettled([
        setMembershipActive({ actorPrincipalId: DEMO_IDS.mcteer,
          membershipId: DEMO_IDS.mcteerMembership, expectedRevision: 0,
          active: false, requestKey: randomUUID() }),
        setMembershipActive({ actorPrincipalId: DEMO_IDS.mcteer,
          membershipId: extraMembership, expectedRevision: 0,
          active: false, requestKey: randomUUID() }),
      ]);
      expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const remaining = await client.query<{ count: string }>(
        "SELECT count(*) FROM memberships WHERE workspace_id = $1 AND role = 'admin' AND active",
        [DEMO_IDS.workspace],
      );
      expect(Number(remaining.rows[0].count)).toBe(1);
    } finally {
      await client.query("UPDATE memberships SET active = true, revision = 0 WHERE id = $1", [DEMO_IDS.mcteerMembership]);
      await client.query("DELETE FROM memberships WHERE id = $1", [extraMembership]);
      await client.query("DELETE FROM principals WHERE id = $1", [extraPrincipal]);
      await client.end();
    }
  });
});
