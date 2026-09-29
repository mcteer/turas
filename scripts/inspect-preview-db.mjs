import pg from "pg";

const { Client } = pg;

function previewConnection() {
  const preview = process.env.NEON_PREVIEW_DB;
  const production = process.env.NEON_PROD_DB;
  const runtime = process.env.DATABASE_URL;
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (!preview || !production || !runtime || !direct) {
    throw new Error("Preview, Production, runtime and direct database URLs must be configured");
  }

  const pooledUrl = new URL(preview);
  const productionUrl = new URL(production);
  const directUrl = new URL(direct);
  const runtimeUrl = new URL(runtime);
  if (!pooledUrl.hostname.endsWith(".neon.tech") ||
      !pooledUrl.hostname.includes("-pooler.") ||
      pooledUrl.hostname === productionUrl.hostname ||
      runtimeUrl.hostname !== pooledUrl.hostname ||
      runtimeUrl.pathname !== pooledUrl.pathname ||
      (runtimeUrl.href !== pooledUrl.href && runtimeUrl.username !== "turas_runtime")) {
    throw new Error("Refusing to inspect a non-Preview or non-Neon runtime endpoint");
  }
  const expectedDirect = new URL(pooledUrl);
  expectedDirect.hostname = pooledUrl.hostname.replace("-pooler.", ".");
  if (directUrl.href !== expectedDirect.href) {
    throw new Error("Direct database URL does not match the selected Preview endpoint");
  }
  return direct;
}

async function main() {
  const client = new Client({
    connectionString: previewConnection(),
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN READ ONLY");
    const result = await client.query(`
      SELECT current_setting('server_version_num') AS postgres_version_number,
        to_regclass('public.turas_environment') IS NOT NULL AS marker_present,
        to_regclass('public.turas_migrations') IS NOT NULL AS ledger_present,
        (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_installed,
        (SELECT default_version FROM pg_available_extensions WHERE name = 'vector') AS vector_available,
        (SELECT count(*)::integer FROM pg_tables WHERE schemaname = 'public') AS public_table_count
    `);
    const row = result.rows[0];
    const summary = {
      reachable: true,
      postgresVersionNumber: row.postgres_version_number,
      markerPresent: row.marker_present,
      ledgerPresent: row.ledger_present,
      vectorInstalled: row.vector_installed,
      vectorAvailable: row.vector_available,
      publicTableCount: row.public_table_count,
    };
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    summary.publicTableNames = tables.rows.map((table) => table.tablename);
    if (row.marker_present) {
      const marker = await client.query(
        "SELECT environment_id, schema_version FROM turas_environment LIMIT 2",
      );
      summary.markerRows = marker.rowCount;
      summary.markerMatchesConfiguration = marker.rowCount === 1 &&
        marker.rows[0].environment_id === process.env.TURAS_ENVIRONMENT_ID;
      summary.schemaVersion = marker.rowCount === 1 ? marker.rows[0].schema_version : null;
    }
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.log(JSON.stringify({ reachable: false, code: error?.code ?? "inspection_failed" }));
    process.exitCode = 1;
  } finally {
    if (connected) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    try { await client.end(); } catch {}
  }
}

main().catch(() => {
  console.log(JSON.stringify({ reachable: false, code: "configuration_invalid" }));
  process.exitCode = 1;
});
