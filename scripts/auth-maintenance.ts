import { Client } from "pg";
import { getServerConfig } from "../lib/server/config.ts";
import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";

const config = getServerConfig();
const args = process.argv.slice(2);
const client = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5_000 });

async function main(): Promise<void> {
  await client.connect();
  try {
    const marker = await client.query<{ environment_id: string }>(
      "SELECT environment_id FROM turas_environment LIMIT 1",
    );
    if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID) {
      throw new Error("Database environment marker mismatch");
    }
    if (args.length === 1 && args[0] === "--prune") {
      // Immutable attempts, continuation authorities and later domain receipts
      // may retain a session independently of the conversation's initial login.
      // Discover actual FK references so a new audited domain cannot break
      // pruning or tempt maintenance to discard its authority history.
      const references=await client.query<{clause:string}>(`SELECT format(
        'NOT EXISTS (SELECT 1 FROM %I.%I r WHERE r.%I = s.id)',n.nspname,t.relname,a.attname) AS clause
        FROM pg_constraint fk JOIN pg_class t ON t.oid=fk.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=fk.conkey[1]
        WHERE fk.contype='f' AND fk.confrelid='login_sessions'::regclass
          AND cardinality(fk.conkey)=1 AND cardinality(fk.confkey)=1`);
      const sessions = await client.query(
        `DELETE FROM login_sessions s WHERE (s.expires_at <= now() OR s.revoked_at IS NOT NULL)
          ${references.rows.map(row=>'AND '+row.clause).join('\n')}`,
      );
      const windows = await client.query("DELETE FROM rate_windows WHERE expires_at <= now()");
      console.log(`Removed ${sessions.rowCount ?? 0} expired/revoked sessions and ${windows.rowCount ?? 0} expired rate windows`);
      return;
    }
    if (args.length === 2 && args[0] === "--revoke-principal") {
      const identity = {
        mcteer: DEMO_IDS.mcteer,
        panel: DEMO_IDS.panel,
        partner: DEMO_IDS.partner,
      }[args[1] as "mcteer" | "panel" | "partner"];
      if (!identity) throw new Error("Unknown configured demo principal");
      const revoked = await client.query(
        "UPDATE login_sessions SET revoked_at = now() WHERE principal_id = $1 AND revoked_at IS NULL",
        [identity],
      );
      console.log(`Revoked ${revoked.rowCount ?? 0} sessions for configured account ${args[1]}`);
      return;
    }
    throw new Error("Use --prune or --revoke-principal <mcteer|panel|partner>");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Auth maintenance failed");
  process.exitCode = 1;
});
