import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { getServerConfig } from "../lib/server/config.ts";
import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";

const nameFlag = process.argv.indexOf("--name");
const name = nameFlag >= 0 ? process.argv[nameFlag + 1]?.trim() : undefined;
if (!name || name.length > 200) throw new Error("Provide --name with 1–200 characters");
const config = getServerConfig();
const client = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5_000 });

try {
  await client.connect();
  const marker = await client.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1",
  );
  if (marker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID) {
    throw new Error("Database environment marker mismatch");
  }
  const id = randomUUID();
  await client.query(
    "INSERT INTO customer_references (id, workspace_id, display_name, synthetic) VALUES ($1, $2, $3, true)",
    [id, DEMO_IDS.workspace, name],
  );
  console.log(`Created synthetic customer reference ${id}`);
} finally {
  await client.end();
}
