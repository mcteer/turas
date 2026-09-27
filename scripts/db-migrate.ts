import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

type Manifest = { version: number; migrations: { file: string; sha256: string }[] };

const directory = resolve("migrations");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")) as Manifest;
const configuredEnvironment = process.env.TURAS_ENVIRONMENT_ID;
const url = process.env.DATABASE_URL_UNPOOLED;
const initialize = process.argv.includes("--init");

function verifyFiles(): void {
  const files = readdirSync(directory).filter((file) => /^\d{3}-[a-z0-9-]+\.cjs$/.test(file)).sort();
  if (files.length !== manifest.migrations.length ||
      files.some((file, index) => manifest.migrations[index]?.file !== file)) {
    throw new Error("Migration manifest does not match migration files");
  }
  for (const entry of manifest.migrations) {
    const digest = createHash("sha256").update(readFileSync(resolve(directory, entry.file))).digest("hex");
    if (digest !== entry.sha256) throw new Error(`Migration digest mismatch: ${entry.file}`);
  }
}

async function main(): Promise<void> {
  if (!configuredEnvironment || !url) throw new Error("Explicit migration environment and direct database URL required");
  verifyFiles();
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    const existing = await client.query<{ name: string | null }>("SELECT to_regclass('public.turas_environment')::text AS name");
    if (initialize) {
      if (existing.rows[0]?.name) throw new Error("Environment already initialized");
      const other = await client.query<{ name: string }>(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'turas_migrations' LIMIT 1",
      );
      if (other.rowCount) throw new Error("Refusing to initialize a nonempty database");
      const ledger = await client.query<{ name: string | null }>(
        "SELECT to_regclass('public.turas_migrations')::text AS name",
      );
      if (ledger.rows[0]?.name) {
        const applied = await client.query("SELECT 1 FROM turas_migrations LIMIT 1");
        if (applied.rowCount) throw new Error("Refusing to initialize an applied migration ledger");
      }
    } else {
      if (!existing.rows[0]?.name) throw new Error("Initialize this empty environment explicitly with db:init");
      const marker = await client.query<{ environment_id: string; schema_version: number }>(
        "SELECT environment_id, schema_version FROM turas_environment LIMIT 1",
      );
      if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== configuredEnvironment) {
        throw new Error("Database environment marker mismatch");
      }
    }

    const ledgerExists = await client.query<{ name: string | null }>(
      "SELECT to_regclass('public.turas_migrations')::text AS name",
    );
    if (!initialize && !ledgerExists.rows[0]?.name) throw new Error("Migration ledger missing");
    if (!initialize) {
      const applied = await client.query<{ name: string }>("SELECT name FROM turas_migrations");
      const listed = new Set(manifest.migrations.map((entry) => entry.file.replace(/\.cjs$/, "")));
      for (const row of applied.rows) {
        if (!listed.has(row.name)) throw new Error(`Applied migration absent from manifest: ${row.name}`);
      }
    }

    const base = {
      dbClient: client,
      dir: directory,
      migrationsTable: "turas_migrations",
      ignorePattern: "manifest\\.json",
      direction: "up" as const,
      singleTransaction: true,
      advisoryLockMode: "wait" as const,
    };
    if (initialize) {
      await runner({ ...base, count: 1 });
      await client.query(
        "INSERT INTO turas_environment (environment_id, schema_version) VALUES ($1, 1)",
        [configuredEnvironment],
      );
    }
    await runner(base);
    const highest = Math.max(...manifest.migrations.map((entry) => Number.parseInt(entry.file.slice(0, 3), 10)));
    await client.query("UPDATE turas_environment SET schema_version = $1 WHERE environment_id = $2", [highest, configuredEnvironment]);
    console.log(`Environment ${configuredEnvironment}: migration version ${highest} ready`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
