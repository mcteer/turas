import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const url = process.env.DATABASE_URL_UNPOOLED;
const environment = process.env.TURAS_ENVIRONMENT_ID;
if (!url || !environment) throw new Error("Explicit migration database and environment required");

const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
try {
  await client.connect();
  const marker = await client.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1",
  );
  if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== environment) {
    throw new Error("Database environment marker mismatch");
  }
  await client.query(readFileSync(resolve("scripts/db-role-setup.sql"), "utf8"));
  console.log("Runtime database privileges refreshed");
} finally {
  await client.end();
}
