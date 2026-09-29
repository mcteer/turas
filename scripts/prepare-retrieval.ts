import { execFileSync } from "node:child_process";
import { Pool } from "pg";

// Readiness only: this command never connects to a database or performs DDL.
export const vectorImage = "pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f";

function docker(...args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  }).trim();
}

async function checkDisposableDatabase(): Promise<void> {
  const url = process.env.TURAS_TEST_DATABASE_URL;
  const environment = process.env.TURAS_TEST_ENVIRONMENT_ID;
  if (!url || !environment?.startsWith("test-") ||
      url === process.env.DATABASE_URL || url === process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("An explicitly identified disposable test database and test environment are required");
  }
  const target = new URL(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
      !target.pathname.slice(1).startsWith("turas_test")) {
    throw new Error("Disposable retrieval check requires a local turas_test database");
  }
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
  try {
    const result = await pool.query<{ environment_id: string; vector_version: string | null }>(
      `SELECT e.environment_id,
        (SELECT default_version FROM pg_available_extensions WHERE name='vector') AS vector_version
        FROM turas_environment e LIMIT 1`);
    if (result.rowCount !== 1 || result.rows[0]?.environment_id !== environment ||
        result.rows[0]?.vector_version !== "0.8.6") {
      throw new Error("Disposable database marker or pgvector prerequisite does not match");
    }
    console.log("Disposable PostgreSQL marker and pgvector availability verified; no schema changed.");
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--offline")) docker("pull", vectorImage);
  const result = docker(
    "run", "--rm", "--network", "none", "--entrypoint", "sh", vectorImage,
    "-c", "pg_config --version; cat \"$(pg_config --sharedir)/extension/vector.control\"",
  );
  if (!result.includes("PostgreSQL 17.") || !result.includes("default_version = '0.8.6'")) {
    throw new Error("Pinned image is not PostgreSQL 17 with pgvector 0.8.6");
  }
  console.log("Pinned PostgreSQL 17 / pgvector 0.8.6 image ready; no database changed.");
  if (process.argv.includes("--check-disposable-db")) await checkDisposableDatabase();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Retrieval prerequisite check failed");
  process.exitCode = 1;
});
