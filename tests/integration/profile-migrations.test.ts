import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl, withTestDatabase } from "../fixtures/database";
import { Client } from "pg";
import { DEMO_IDS } from "../fixtures/identities";
import { randomUUID } from "node:crypto";
import { assertDatabaseEnvironment } from "../../lib/server/db/readiness";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";

// The test runner points at an isolated local turas_test database. Migration setup
// applies the checked manifest before this suite; every mutation below rolls back.
describe("003 profile migrations", () => {
  it("has the profile and context-fence tables with the expected schema version", async () => {
    await withTestDatabase(async (client) => {
      const state = await client.query<{ schema_version: number }>("SELECT schema_version FROM turas_environment");
      expect(state.rows[0]?.schema_version).toBeGreaterThanOrEqual(13);
      const tables = await client.query<{ name: string }>(`SELECT tablename AS name FROM pg_tables
        WHERE schemaname = 'public' AND tablename IN
        ('customer_profile_state','customer_workloads','customer_stewards','profile_records',
         'profile_revisions','profile_review_decisions','profile_lifecycle_events',
         'profile_retraction_requests','profile_command_receipts','evidence_sources',
         'evidence_source_revisions','evidence_source_events','profile_evidence_links',
         'research_checks','evidence_quality_snapshots','evidence_conflicts','evidence_conflict_events',
         'profile_private_lineage','profile_audit_events','context_snapshot_receipts')`);
      expect(tables.rows).toHaveLength(20);
    });
  });

  it("preserves existing customer, grant and conversation identity on upgrade", async () => {
    await withTestDatabase(async (client) => {
      const legacy = await client.query<{ name: string }>("SELECT name FROM turas_migrations ORDER BY name");
      expect(legacy.rows.slice(0, 6).map((row) => row.name)).toEqual([
        "001-identity-foundation", "002-login-sessions", "003-customer-access",
        "004-conversations", "005-conversation-invariants", "006-native-receipts",
      ]);
      const fks = await client.query<{ name: string }>(`SELECT conname AS name FROM pg_constraint
        WHERE conrelid = 'profile_records'::regclass AND contype = 'f'`);
      expect(fks.rows.some((row) => row.name.includes("customer"))).toBe(true);
      const existing = await client.query("SELECT id FROM customer_references LIMIT 1");
      expect(existing.rows.every((row) => typeof row.id === "string")).toBe(true);
    });
  });

  it("enforces canonical roots and immutable revision payloads", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const recordId = randomUUID();
        const duplicateId = randomUUID();
        await client.query(`INSERT INTO profile_records
          (id, workspace_id, customer_id, kind, canonical_key, created_by)
          VALUES ($1,$2,$3,'customer_details','customer_details',$4)`,
        [recordId, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer, DEMO_IDS.panelMembership]);
        await client.query("SAVEPOINT duplicate_root");
        await expect(client.query(`INSERT INTO profile_records
          (id, workspace_id, customer_id, kind, canonical_key, created_by)
          VALUES ($1,$2,$3,'customer_details','customer_details',$4)`,
        [duplicateId, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer, DEMO_IDS.panelMembership])).rejects.toMatchObject({ code: "23505" });
        await client.query("ROLLBACK TO SAVEPOINT duplicate_root");
        const revisionId = randomUUID();
        await client.query(`INSERT INTO profile_revisions
          (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
           payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
          VALUES ($1,$2,$3,$4,1,'v1','{}'::jsonb,'{}'::jsonb,$5,'manual','internal','other_internal',$6)`,
        [revisionId, recordId, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer,
          DEMO_IDS.panelMembership, "a".repeat(64)]);
        await client.query("SAVEPOINT immutable_revision");
        await expect(client.query("UPDATE profile_revisions SET payload = '{\"edited\":true}'::jsonb WHERE id = $1", [revisionId]))
          .rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK TO SAVEPOINT immutable_revision");
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("fails closed for wrong environment or a partial schema", async () => {
    await withTestDatabase(async (client) => {
      const read = () => client.query("SELECT environment_id, schema_version FROM turas_environment LIMIT 1");
      await expect(assertDatabaseEnvironment(8, "wrong-environment", read)).rejects.toThrow("Database unavailable");
      const partial = async () => {
        const result = await read();
        return { ...result, rows: result.rows.map((row) => ({ ...row, schema_version: 11 })) };
      };
      await expect(assertDatabaseEnvironment(12, process.env.TURAS_TEST_ENVIRONMENT_ID, partial))
        .rejects.toThrow("Database unavailable");
    });
  });

  it("rejects profile commands while the migration ledger is below readiness", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const actor = await createProfileTestSession(client, "panel");
          await client.query("UPDATE turas_environment SET schema_version=12");
          await expect(submitProfileCommand(actor, DEMO_IDS.sharedCustomer, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: "Synthetic incomplete migration", sourceType: "manual" },
          }, client)).rejects.toMatchObject({ status: 503 });
          const leaked = await client.query(`SELECT 1 FROM profile_revisions
            WHERE payload->>'text'='Synthetic incomplete migration'`);
          expect(leaked.rows).toHaveLength(0);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorEnvironment; }
  });

  it("does not grant schema creation to the runtime role", async () => {
    await withTestDatabase(async (client) => {
      const result = await client.query<{ allowed: boolean }>(
        "SELECT has_schema_privilege('turas_runtime', 'public', 'CREATE') AS allowed",
      );
      expect(result.rows[0]?.allowed).toBe(false);
      for (const table of ["profile_revisions", "profile_review_decisions", "evidence_quality_snapshots", "context_snapshot_receipts"]) {
        const privilege = await client.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('turas_runtime', $1, 'UPDATE') AS allowed", [table]);
        expect(privilege.rows[0]?.allowed).toBe(false);
      }
    });
  });

  it("lets the runtime lock mutable profile roots without locking immutable revisions", async () => {
    const runtime = new URL(process.env.DATABASE_URL!);
    const test = new URL(requireTestDatabaseUrl());
    if (runtime.hostname !== test.hostname) throw new Error("Runtime/test hosts differ");
    runtime.pathname = test.pathname;
    const client = new Client({ connectionString: runtime.toString() });
    await client.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query(`SELECT v.id FROM profile_revisions v
        JOIN profile_records r ON r.id=v.record_id LIMIT 1 FOR UPDATE OF r`))
        .resolves.toBeDefined();
      await client.query("SAVEPOINT immutable_lock");
      await expect(client.query(`SELECT id FROM profile_revisions LIMIT 1 FOR UPDATE`))
        .rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT immutable_lock");
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
});
