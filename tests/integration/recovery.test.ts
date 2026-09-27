import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

describe("migration failure recovery", () => {
  it("rolls back a failing migration and preserves previously acknowledged records", async () => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Disposable test database required");
    }
    const directory = await mkdtemp(join(tmpdir(), "turas-migration-failure-"));
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    try {
      await cp("migrations", directory, { recursive: true });
      const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
        migrations: Array<{ file: string; sha256: string }>;
      };
      for (const entry of manifest.migrations) {
        const digest = createHash("sha256").update(await readFile(join(directory, entry.file))).digest("hex");
        expect(digest).toBe(entry.sha256);
      }
      await writeFile(join(directory, "007-injected-failure.cjs"),
        "exports.up = (pgm) => { pgm.sql(\"UPDATE turas_environment SET schema_version = 999\"); pgm.sql(\"SELECT 1 / 0\"); };\n");
      await client.connect();
      const before = await client.query<{ schema_version: number; total: string }>(`
        SELECT e.schema_version,
          (SELECT count(*) FROM response_attempts WHERE dispatch_state = 'admitted')::text AS total
        FROM turas_environment e WHERE environment_id = $1`, [process.env.TURAS_TEST_ENVIRONMENT_ID]);
      const ledger = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM turas_migrations");
      await expect(runner({ dbClient: client, dir: directory, migrationsTable: "turas_migrations",
        ignorePattern: "manifest\\.json", direction: "up", singleTransaction: true,
        advisoryLockMode: "wait" })).rejects.toThrow();
      const after = await client.query<{ schema_version: number; total: string }>(`
        SELECT e.schema_version,
          (SELECT count(*) FROM response_attempts WHERE dispatch_state = 'admitted')::text AS total
        FROM turas_environment e WHERE environment_id = $1`, [process.env.TURAS_TEST_ENVIRONMENT_ID]);
      const ledgerAfter = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM turas_migrations");
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(ledgerAfter.rows[0]).toEqual(ledger.rows[0]);
    } finally {
      await client.end().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
