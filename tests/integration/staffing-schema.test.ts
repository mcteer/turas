import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { requireStaffingEnvironment } from "../../lib/server/staffing/repository";
import { requireOwnedStaffingClone, withStaffingEvalEnvironment } from "../../scripts/staffing-eval-environment";

const currentSchemaVersion = (JSON.parse(readFileSync("migrations/manifest.json", "utf8")) as { version: number }).version;

describe("explicit staffing schema and runtime grants", () => {
  it("initializes an empty owned database at the current manifest schema", async () => {
    requireOwnedStaffingClone();
    await withStaffingEvalEnvironment(async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
      await client.connect();
      try {
        const marker = await client.query("SELECT environment_id,schema_version FROM turas_environment");
        expect(marker.rows).toEqual([{ environment_id: process.env.TURAS_TEST_ENVIRONMENT_ID, schema_version: currentSchemaVersion }]);
      } finally { await client.end(); }
    }, { empty: true, sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL });
  }, 120_000);

  it("upgrades an owned schema-031 fixture without rewriting earlier migration identities", async () => {
    requireOwnedStaffingClone();
    await withStaffingEvalEnvironment(async (environment) => {
      const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
      await client.connect();
      try {
        expect((await client.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(31);
        const prior = await client.query("SELECT name FROM turas_migrations ORDER BY name");
        await environment.upgrade();
        expect((await client.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(currentSchemaVersion);
        const after = await client.query("SELECT name FROM turas_migrations ORDER BY name");
        expect(after.rows.slice(0, prior.rows.length)).toEqual(prior.rows);
      } finally { await client.end(); }
    }, { empty: true, initialSchemaVersion: 31,
      sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL });
  }, 120_000);

  it("enforces scoped resource identity and append-only schema contracts", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'"))
        .rows.map((r: { tablename: string }) => r.tablename);
      expect(names).toEqual(expect.arrayContaining(["workforce_resources", "workforce_source_versions",
        "workforce_competency_revisions", "resource_calendar_revisions", "staffing_capacity_days",
        "staffing_demand_days", "staffing_demand_events", "staffing_demand_event_payloads", "staffing_allocation_revisions", "staffing_decisions",
        "staffing_scenarios", "staffing_conversation_bindings", "staffing_model_step_receipts", "staffing_model_step_usage_receipts", "staffing_skill_load_receipts"]));
      expect(names).not.toContain("staffing_capability_grants");
      await db.query("SAVEPOINT staffing_schema");
      try {
        await db.query("SAVEPOINT cross_scope");
        await expect(db.query(`INSERT INTO workforce_resources
          (id,environment_id,workspace_id,external_key,kind,membership_id,created_by_membership_id)
          VALUES($1,$2,$3,$4,'internal',$5,$5)`, [randomUUID(), process.env.TURAS_ENVIRONMENT_ID,
          randomUUID(), `synthetic_${randomUUID()}`, DEMO_IDS.mcteerMembership]))
          .rejects.toMatchObject({ code: "23503" });
        await db.query("ROLLBACK TO SAVEPOINT cross_scope");
        const grants = await db.query(`SELECT
          has_table_privilege('turas_runtime','workforce_competency_revisions','UPDATE') AS revision_update,
          has_table_privilege('turas_runtime','staffing_decisions','DELETE') AS decision_delete,
          has_table_privilege('turas_runtime','staffing_demand_events','UPDATE') AS demand_event_update,
          has_table_privilege('turas_runtime','staffing_demand_event_payloads','DELETE') AS demand_event_payload_delete,
          has_table_privilege('turas_runtime','staffing_capacity_days','UPDATE') AS ledger_update,
          has_table_privilege('turas_runtime','staffing_skill_load_receipts','UPDATE') AS skill_load_update,
          has_table_privilege('turas_runtime','staffing_skill_load_receipts','DELETE') AS skill_load_delete,
          has_table_privilege('turas_runtime','staffing_model_step_usage_receipts','UPDATE') AS usage_update,
          has_table_privilege('turas_runtime','staffing_model_step_usage_receipts','DELETE') AS usage_delete,
          has_table_privilege('turas_runtime','workforce_competency_payloads','DELETE') AS payload_delete,
          has_function_privilege('turas_runtime','turas_purge_workforce_source(uuid,bigint)','EXECUTE') AS purge_execute`);
        expect(grants.rows[0]).toEqual({ revision_update: false, decision_delete: false,
          demand_event_update: false, demand_event_payload_delete: false, ledger_update: true, skill_load_update: false, skill_load_delete: false,
          usage_update: false, usage_delete: false, payload_delete: false, purge_execute: true });
        const guards = await db.query(`SELECT tgname FROM pg_trigger
          WHERE tgrelid='staffing_allocation_revisions'::regclass AND NOT tgisinternal`);
        expect(guards.rowCount).toBeGreaterThan(0);
      } finally { await db.query("ROLLBACK TO SAVEPOINT staffing_schema"); }
    });
  });

  it("rejects mutable history and denies runtime payload deletion privileges", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SAVEPOINT immutable_fixture");
      try {
        const id = randomUUID(), revisionId = randomUUID();
        await db.query(`INSERT INTO workforce_resources(id,environment_id,workspace_id,external_key,kind,created_by_membership_id)
          VALUES($1,$2,$3,$4,'internal',$5)`, [id, process.env.TURAS_ENVIRONMENT_ID,
          DEMO_IDS.workspace, id, DEMO_IDS.mcteerMembership]);
        await db.query(`INSERT INTO workforce_resource_revisions(id,environment_id,workspace_id,resource_id,revision_number,content_digest,actor_membership_id)
          VALUES($1,$2,$3,$4,1,$5,$6)`, [revisionId, process.env.TURAS_ENVIRONMENT_ID,
          DEMO_IDS.workspace, id, "a".repeat(64), DEMO_IDS.mcteerMembership]);
        await db.query(`INSERT INTO workforce_resource_payloads(revision_id,display_name,timezone,region_code,rationale)
          VALUES($1,'Synthetic resource','UTC','US','Synthetic test')`, [revisionId]);
        for (const sql of [
          "UPDATE workforce_resources SET external_key='changed' WHERE id=$1",
          "UPDATE workforce_resource_revisions SET revision_number=2 WHERE resource_id=$1",
        ]) {
          await db.query("SAVEPOINT rejected_change");
          await expect(db.query(sql, [id])).rejects.toMatchObject({ code: "23514" });
          await db.query("ROLLBACK TO SAVEPOINT rejected_change");
        }
        expect((await db.query(`SELECT has_table_privilege('turas_runtime',
          'workforce_resource_payloads','DELETE') AS allowed`)).rows[0].allowed).toBe(false);
        expect((await db.query("SELECT revision_id FROM workforce_resource_payloads WHERE revision_id=$1", [revisionId])).rowCount).toBe(1);
        await db.query("SET LOCAL ROLE turas_runtime");
        expect((await db.query("SELECT display_name FROM workforce_resource_payloads WHERE revision_id=$1 FOR SHARE", [revisionId]))
          .rows[0].display_name).toBe("Synthetic resource");
        for (const [sql, code] of [
          ["UPDATE workforce_resource_payloads SET revision_id=revision_id WHERE revision_id=$1", "23514"],
          ["UPDATE workforce_resource_payloads SET display_name='Changed' WHERE revision_id=$1", "42501"],
          ["DELETE FROM workforce_resource_payloads WHERE revision_id=$1", "42501"],
        ]) {
          await db.query("SAVEPOINT runtime_payload_change");
          await expect(db.query(sql, [revisionId])).rejects.toMatchObject({ code });
          await db.query("ROLLBACK TO SAVEPOINT runtime_payload_change");
        }
        await db.query("RESET ROLE");
      } finally { await db.query("ROLLBACK TO SAVEPOINT immutable_fixture"); }
    });
  });

  it("allows runtime reads to lock immutable payloads without table-wide update or delete grants", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async db => {
      await db.query("SET LOCAL ROLE turas_runtime");
      for (const table of ["plan_revision_payloads", "milestone_baseline_payloads",
        "workforce_resource_payloads", "workforce_skill_payloads", "workforce_competency_payloads",
        "workforce_extraction_payloads", "workforce_extracted_cell_payloads", "workforce_mapping_payloads",
        "resource_calendar_payloads", "staffing_demand_payloads", "staffing_allocation_payloads",
        "staffing_economic_input_payloads", "staffing_scenario_payloads", "staffing_advisory_read_payloads"]) {
        await db.query(`SELECT * FROM ${table} LIMIT 1 FOR SHARE`);
        expect((await db.query(`SELECT
          has_table_privilege(current_user,$1,'UPDATE') AS update,
          has_table_privilege(current_user,$1,'DELETE') AS delete`, [table])).rows[0])
          .toEqual({ update: false, delete: false });
      }
      await db.query("RESET ROLE");
    });
  });

  it("fails feature readiness without DDL and allows eligible reads while intake is disabled", async () => {
    requireOwnedStaffingClone();
    await withTransaction(async (db) => {
      await requireStaffingEnvironment(db, false);
      const prior = process.env.TURAS_007_DISABLED;
      process.env.TURAS_007_DISABLED = "1";
      try {
        await requireStaffingEnvironment(db, false);
        await expect(requireStaffingEnvironment(db, true)).rejects.toMatchObject({ status: 503, code: "staffing_disabled" });
      } finally {
        if (prior === undefined) delete process.env.TURAS_007_DISABLED;
        else process.env.TURAS_007_DISABLED = prior;
      }
      await db.query("SAVEPOINT old_schema");
      try {
        await db.query("UPDATE turas_environment SET schema_version=31");
        await expect(requireStaffingEnvironment(db, false)).rejects.toMatchObject({ status: 503, code: "staffing_unavailable" });
      } finally { await db.query("ROLLBACK TO SAVEPOINT old_schema"); }
    });
  });
});
