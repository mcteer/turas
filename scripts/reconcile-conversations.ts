import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { getServerConfig } from "../lib/server/config";
import { signMaintenanceRequest } from "../lib/server/conversations/watchdog";

const args = process.argv.slice(2);
const conversationId = args[0] === "--conversation" ? args[1] : undefined;
const originInput = args[2] === "--eve-origin" ? args[3] : process.env.TURAS_EVE_INTERNAL_ORIGIN;
if (!conversationId || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(conversationId) ||
    !originInput || args.length > (args[2] ? 4 : 2)) {
  throw new Error("Use --conversation <UUID> --eve-origin http://127.0.0.1:<port>/");
}
const origin = new URL(originInput);
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" || origin.username || origin.password) {
  throw new Error("Reconciliation requires a loopback eve origin");
}

const config = getServerConfig();
const client = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5_000 });
try {
  await client.connect();
  const marker = await client.query<{ environment_id: string }>("SELECT environment_id FROM turas_environment LIMIT 1");
  if (marker.rows.length !== 1 || marker.rows[0].environment_id !== config.TURAS_ENVIRONMENT_ID) {
    throw new Error("Database environment marker mismatch");
  }
  const attempts = await client.query<{ id: string }>(`SELECT a.id FROM response_attempts a
    JOIN conversations c ON c.id = a.conversation_id
    WHERE c.id = $1 AND c.environment_id = $2 AND a.dispatch_start_index IS NOT NULL
    ORDER BY a.created_at`, [conversationId, config.TURAS_ENVIRONMENT_ID]);
  if (!attempts.rows.length) throw new Error("No dispatch attempts found in this environment");
  for (const attempt of attempts.rows) {
    const path = "/internal/turas/maintenance";
    const body = JSON.stringify({ action: "reconcile", attemptId: attempt.id,
      environmentId: config.TURAS_ENVIRONMENT_ID });
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signMaintenanceRequest("POST", path, timestamp, nonce, body);
    const response = await fetch(new URL(path, origin), { method: "POST", body,
      headers: { "content-type": "application/json", "x-turas-timestamp": timestamp,
        "x-turas-nonce": nonce, "x-turas-signature": signature }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Reconciliation route returned ${response.status}`);
    const result = await response.json() as { data?: { status?: string } };
    if (!result.data?.status) throw new Error("Reconciliation status unavailable");
    console.log(`${attempt.id}: ${result.data.status}`);
  }
} finally {
  await client.end();
}
