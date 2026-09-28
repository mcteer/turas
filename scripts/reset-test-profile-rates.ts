import { Client } from "pg";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";

const url = requireTestDatabaseUrl();
const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
const client = new Client({ connectionString: url });
try {
  await client.connect();
  const state = await client.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1");
  if (state.rows.length !== 1 || state.rows[0].environment_id !== marker) {
    throw new Error("Disposable test environment marker mismatch");
  }
  await client.query(`DELETE FROM rate_windows WHERE environment_id=$1
    AND category IN ('profile_read','profile_write')`, [marker]);
} finally { await client.end(); }
