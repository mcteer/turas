import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertDatabaseEnvironment } from "../../lib/server/db/readiness";
import { withTestDatabase } from "../fixtures/database";
import { BOUNDARY_IDS, DEMO_IDS } from "../fixtures/identities";
import { GET } from "../../app/api/health/ready/route";
import { heartbeatWorker } from "../../lib/server/conversations/watchdog";

const runFile = promisify(execFile);

describe("foundation database boundaries", () => {
  it("recognizes the initialized local environment through readiness", async () => {
    // CI does not start root dev; explicitly record the worker heartbeat that
    // readiness requires, rather than depending on another process on the host.
    await heartbeatWorker("foundation-readiness-fixture");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ready: true } });
  });

  it("rejects a wrong marker, missing schema and unavailable database", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "INSERT INTO turas_environment (environment_id, schema_version) VALUES ($1, 1) ON CONFLICT (singleton_id) DO NOTHING",
          [process.env.TURAS_TEST_ENVIRONMENT_ID],
        );
        const read = () => client.query("SELECT environment_id, schema_version FROM turas_environment LIMIT 1");
        await expect(assertDatabaseEnvironment(1, process.env.TURAS_TEST_ENVIRONMENT_ID, read)).resolves.toBeUndefined();
        await expect(assertDatabaseEnvironment(1, "wrong-environment", read)).rejects.toThrow("Database unavailable");
        await expect(assertDatabaseEnvironment(999, process.env.TURAS_TEST_ENVIRONMENT_ID, read)).rejects.toThrow("Database unavailable");
        await expect(assertDatabaseEnvironment(1, "test-002", () => client.query("SELECT * FROM absent_environment_table"))).rejects.toThrow("Database unavailable");
      } finally {
        await client.query("ROLLBACK");
      }
    });
    await expect(assertDatabaseEnvironment(1, "test-002", async () => { throw new Error("offline"); })).rejects.toThrow("Database unavailable");
  });

  it("keeps partner organizations tied to their workspace", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("INSERT INTO workspaces (id, name) VALUES ($1, 'first'), ($2, 'second')", [BOUNDARY_IDS.firstWorkspace, BOUNDARY_IDS.otherWorkspace]);
        await client.query("INSERT INTO partner_organizations (id, workspace_id, name) VALUES ($1, $2, 'one'), ($3, $4, 'two')", [BOUNDARY_IDS.firstPartnerOrganization, BOUNDARY_IDS.firstWorkspace, BOUNDARY_IDS.otherPartnerOrganization, BOUNDARY_IDS.otherWorkspace]);
        await client.query("SAVEPOINT invalid_membership");
        await client.query("INSERT INTO principals (id, login_name, display_name) VALUES ($1, 'fixture-partner', 'fixture')", [BOUNDARY_IDS.otherPartnerPrincipal]);
        await expect(client.query(
          `INSERT INTO memberships (id, principal_id, workspace_id, kind, partner_org_id, role)
           VALUES ($1, $2, $3, 'partner', $4, 'member')`,
          [BOUNDARY_IDS.otherPartnerMembership, BOUNDARY_IDS.otherPartnerPrincipal, BOUNDARY_IDS.firstWorkspace, BOUNDARY_IDS.otherPartnerOrganization],
        )).rejects.toMatchObject({ code: "23503" });
        await client.query("ROLLBACK TO SAVEPOINT invalid_membership");
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("denies schema and migration ledger access to the runtime role", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await expect(client.query("CREATE TABLE runtime_must_not_create (id integer)"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(client.query("SELECT name FROM turas_migrations LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.end();
    }
  });

  it("reruns bootstrap without reactivating a disabled principal", async () => {
    const runBootstrap = async () => {
      await runFile(process.execPath, ["--experimental-strip-types", "scripts/bootstrap-demo.ts"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
          TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID,
        },
      });
    };
    await withTestDatabase(async (client) => {
      await client.query(
        "INSERT INTO turas_environment (environment_id, schema_version) VALUES ($1, 1) ON CONFLICT (singleton_id) DO NOTHING",
        [process.env.TURAS_TEST_ENVIRONMENT_ID],
      );
    });
    await runBootstrap();
    try {
      await withTestDatabase(async (client) => {
        await client.query("UPDATE principals SET active = false WHERE id = $1", [DEMO_IDS.partner]);
      });
      await runBootstrap();
      await withTestDatabase(async (client) => {
        const state = await client.query<{ active: boolean }>("SELECT active FROM principals WHERE id = $1", [DEMO_IDS.partner]);
        expect(state.rows[0]?.active).toBe(false);
      });
    } finally {
      await withTestDatabase(async (client) => {
        await client.query("UPDATE principals SET active = true WHERE id = $1", [DEMO_IDS.partner]);
      });
    }
  });
});
