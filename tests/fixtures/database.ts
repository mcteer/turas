import { Pool, type PoolClient } from "pg";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requireTestDatabaseUrl(environment: Record<string, string | undefined> = process.env): string {
  const raw = environment.TURAS_TEST_DATABASE_URL;
  const marker = environment.TURAS_TEST_ENVIRONMENT_ID;
  if (!raw || !marker?.startsWith("test-")) {
    throw new Error("An isolated test database and test environment marker are required");
  }
  if (raw === environment.DATABASE_URL || raw === environment.DATABASE_URL_UNPOOLED) {
    throw new Error("Test database must differ from configured application databases");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid test database URL");
  }
  if (!/^turas_test(?:_|$)/.test(url.pathname.slice(1))) {
    throw new Error("Tests require a turas_test database");
  }
  if (localHosts.has(url.hostname)) return raw;

  const preview = environment.NEON_PREVIEW_DB;
  const production = environment.NEON_PROD_DB;
  if (!preview || !production) {
    throw new Error("Neon test database requires explicit Preview and Production references");
  }
  const selectedPreview = new URL(preview);
  const selectedProduction = new URL(production);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Unsupported test database protocol");
  }
  if (!url.hostname.endsWith(".neon.tech") ||
      url.hostname !== selectedPreview.hostname.replace("-pooler.", ".") ||
      url.port !== selectedPreview.port ||
      url.username !== selectedPreview.username ||
      url.password !== selectedPreview.password ||
      url.hostname === selectedProduction.hostname ||
      url.pathname === selectedPreview.pathname) {
    throw new Error("Tests require a separate database in the selected Neon Preview branch");
  }
  return raw;
}

export async function withTestDatabase<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireTestDatabaseUrl(), max: 2 });
  try {
    const client = await pool.connect();
    try {
      return await run(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
