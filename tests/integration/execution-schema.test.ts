import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createExecutionBaseline } from "../fixtures/execution/baseline";
import { createResource } from "../../lib/server/staffing/resources";
import { syntheticResource } from "../fixtures/staffing/seed";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { requireOwnedExecutionClone, withExecutionEvalEnvironment } from "../../scripts/execution-eval-environment";
import { withExecutionDatabase } from "../fixtures/execution/environment";
import { requireExecutionEnvironment } from "../../lib/server/execution/repository";

export const executionTables = ["execution_workspaces", "execution_baseline_bindings", "execution_baseline_items",
  "execution_records", "execution_record_revisions", "execution_record_payloads", "execution_record_sources",
  "execution_review_decisions", "execution_milestone_heads", "execution_milestone_events", "execution_reconciliations",
  "execution_reconciliation_items", "execution_command_receipts", "execution_rate_windows", "execution_time_entries",
  "execution_time_revisions", "execution_time_payloads", "execution_time_decisions", "execution_resource_days",
  "execution_actual_days", "execution_effort_heads", "execution_calculation_receipts", "execution_advice_bindings",
  "execution_advice_attempts", "execution_advice_dependencies", "execution_advice_reads", "execution_advice_steps",
  "execution_advice_usage", "execution_cleanup_jobs"];

describe("008 schema and grants", () => {
  it("upgrades an explicit034 fixture without rewriting its migration history", async () => {
    requireOwnedExecutionClone();
    await withExecutionEvalEnvironment(async environment => {
      const client = new Client({ connectionString: requireOwnedExecutionClone() }); await client.connect();
      try {
        expect((await client.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(34);
        requireOwnedExecutionClone();
        const bootstrap = spawnSync(process.execPath,["--experimental-strip-types","scripts/bootstrap-demo.ts"],{env:process.env,encoding:"utf8",timeout:120_000});
        if (bootstrap.error || bootstrap.status!==0) throw new Error("Owned034 demo bootstrap failed");
        const fixture = await withExecutionDatabase(async db => {
          await db.query("BEGIN");
          try {
            const baseline = await createExecutionBaseline(db);
            const resource = await createResource(baseline.reviewer, { requestKey: randomUUID(), rationale: "Synthetic pre-upgrade reviewed resource identity", resource: syntheticResource() }, db);
            await db.query("COMMIT");
            return { ...baseline, resource };
          } catch (error) { await db.query("ROLLBACK"); throw error; }
        });
        const decisions = (await client.query("SELECT to_jsonb(d) AS metadata FROM plan_decisions d WHERE plan_id=$1", [fixture.created.planId])).rows;
        const resources = (await client.query("SELECT to_jsonb(r) AS metadata FROM workforce_resource_revisions r WHERE resource_id=$1", [fixture.resource.resourceId])).rows;
        const prior = (await client.query("SELECT name FROM turas_migrations ORDER BY name")).rows;
        await environment.upgrade();
        expect((await client.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(37);
        expect((await client.query("SELECT name FROM turas_migrations ORDER BY name")).rows.slice(0, prior.length)).toEqual(prior);
        expect((await client.query("SELECT to_jsonb(d) AS metadata FROM plan_decisions d WHERE plan_id=$1", [fixture.created.planId])).rows).toEqual(decisions);
        expect((await client.query("SELECT to_jsonb(r) AS metadata FROM workforce_resource_revisions r WHERE resource_id=$1", [fixture.resource.resourceId])).rows).toEqual(resources);
      } finally { await client.end(); }
    }, { empty: true, initialSchemaVersion: 34, sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL });
  }, 180_000);
  it("creates every table and denies runtime history/payload mutation and cleanup numeric access", async () => {
    await withExecutionDatabase(async db => {
      const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => r.tablename);
      expect(tables).toEqual(expect.arrayContaining(executionTables));
      for (const table of ["execution_record_revisions", "execution_review_decisions", "execution_time_revisions",
        "execution_time_decisions", "execution_advice_steps", "execution_advice_usage", "execution_command_receipts"]) {
        const grants = await db.query(`SELECT has_table_privilege('turas_runtime',$1,'UPDATE') AS u,
          has_table_privilege('turas_runtime',$1,'DELETE') AS d`, [table]);
        expect(grants.rows[0]).toEqual({ u: false, d: false });
      }
      const grants = await db.query(`SELECT
        has_table_privilege('turas_runtime','execution_record_payloads','DELETE') AS runtime_purge,
        has_table_privilege('turas_execution_cleanup','execution_record_payloads','DELETE') AS cleanup_purge,
        has_table_privilege('turas_execution_cleanup','execution_actual_days','UPDATE') AS cleanup_actual,
        has_table_privilege('turas_execution_cleanup','execution_time_decisions','DELETE') AS cleanup_decision`);
      expect(grants.rows[0]).toEqual({ runtime_purge: false, cleanup_purge: true, cleanup_actual: false, cleanup_decision: false });
    });
  });
  it("keeps readiness feature-local and allows authorized reads when intake is disabled", async () => {
    await withExecutionDatabase(async db => {
      await requireExecutionEnvironment(db, false);
      const prior = process.env.TURAS_008_DISABLED; process.env.TURAS_008_DISABLED = "1";
      try {
        await requireExecutionEnvironment(db, false);
        await expect(requireExecutionEnvironment(db, true)).rejects.toMatchObject({ status: 503, code: "feature_disabled" });
      } finally { if (prior === undefined) delete process.env.TURAS_008_DISABLED; else process.env.TURAS_008_DISABLED = prior; }
      await db.query("BEGIN");
      try {
        await db.query("UPDATE turas_environment SET schema_version=34");
        await expect(requireExecutionEnvironment(db, false)).rejects.toMatchObject({ status: 503, code: "schema_unavailable" });
        expect((await db.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(34);
      } finally { await db.query("ROLLBACK"); }
    });
  });
  it("initializes an empty owned database explicitly at037", async () => {
    await withExecutionEvalEnvironment(async () => {
      await withExecutionDatabase(async db => {
        expect((await db.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version).toBe(37);
        expect((await db.query("SELECT count(*)::int AS n FROM execution_actual_days")).rows[0].n).toBe(0);
      });
    }, { empty: true, sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL });
  }, 180_000);
});
