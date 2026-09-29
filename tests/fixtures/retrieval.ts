import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(resolve("migrations/manifest.json"), "utf8")) as {
  migrations: { file: string }[];
};
const planned = [
  "019-retrieval-projections.cjs",
  "020-shared-knowledge.cjs",
  "021-research-runs.cjs",
  "022-retrieval-context-fences.cjs",
  "023-knowledge-submit-and-retention.cjs",
  "024-research-request-revisions.cjs",
  "025-research-discovery-results.cjs",
  "026-research-review-conflicts.cjs",
  "027-bounded-receipt-retention.cjs",
  "028-research-normalized-origin.cjs",
];

export async function applyRetrievalMigrations(client: PoolClient, from: number, through: number): Promise<void> {
  for (let number = from; number <= through; number += 1) {
    const file = number <= 18 ? manifest.migrations[number - 1]?.file : planned[number - 19];
    if (!file) throw new Error(`Missing migration ${number}`);
    const migration = require(`../../migrations/${file}`) as {
      up: (pgm: { sql: (statement: string) => void }) => void;
    };
    const statements: string[] = [];
    migration.up({ sql: (statement) => statements.push(statement) });
    for (const statement of statements) await client.query(statement);
  }
}

export async function withIsolatedRetrievalSchema<T>(client: PoolClient, run: (schema: string) => Promise<T>): Promise<T> {
  const schema = `retrieval_test_${randomUUID().replaceAll("-", "")}`;
  await client.query("BEGIN");
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}",public`);
    await applyRetrievalMigrations(client, 1, 18);
    await client.query("INSERT INTO turas_environment(environment_id,schema_version) VALUES($1,18)",
      [`test-retrieval-${schema}`]);
    return await run(schema);
  } finally {
    await client.query("ROLLBACK");
  }
}

export async function checkDefinitions(client: PoolClient, table: string): Promise<string> {
  const result = await client.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid=$1::regclass
  `, [table]);
  return result.rows.map((row) => row.definition).join(" ");
}

export async function rejectsCheck(client: PoolClient, sql: string, values: unknown[]): Promise<void> {
  await client.query("SAVEPOINT retrieval_reject");
  try {
    let rejected = false;
    try {
      await client.query(sql, values);
    } catch (error) {
      rejected = true;
      if (!error || typeof error !== "object" || !("code" in error) ||
          typeof error.code !== "string" ||
          !(error.code.startsWith("23") || error.code.startsWith("22"))) throw error;
    }
    if (!rejected) throw new Error("Expected a database constraint rejection");
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT retrieval_reject");
    await client.query("RELEASE SAVEPOINT retrieval_reject");
  }
}
