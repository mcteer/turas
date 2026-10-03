import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { requireOwnedExecutionClone, verifyExecutionStoreOwnership,
  withExecutionEvalEnvironment } from "../../scripts/execution-eval-environment";

describe("008 disposable ownership", () => {
  it("rejects configured or unrelated identities before any connection", () => {
    for (const name of ["turas", "turas_preview_005", "production", "turas_test_007_eval_abcdef123456"]) {
      const url = `postgres://localhost/${name}`;
      expect(() => requireOwnedExecutionClone({ DATABASE_URL: url, DATABASE_URL_UNPOOLED: url,
        TURAS_TEST_DATABASE_URL: url, TURAS_ENVIRONMENT_ID: "test-synthetic",
        TURAS_TEST_ENVIRONMENT_ID: "test-synthetic" })).toThrow();
    }
    const url = "postgres://localhost/turas_test_008_eval_abcdef123456";
    expect(requireOwnedExecutionClone({ DATABASE_URL: url, DATABASE_URL_UNPOOLED: url,
      TURAS_TEST_DATABASE_URL: url, TURAS_ENVIRONMENT_ID: "test-synthetic",
      TURAS_TEST_ENVIRONMENT_ID: "test-synthetic" })).toBe(url);
  });
  it("refuses foreign or public store markers without deleting the sentinel", async () => {
    const root = await mkdtemp(join(tmpdir(), "turas-execution-ownership-"));
    const store = join(root, "workforce");
    try {
      await mkdir(store, { mode: 0o700 });
      await writeFile(join(store, ".turas-workforce-store.json"),
        JSON.stringify({ environmentId: "test-synthetic", ownerToken: "foreign" }), { mode: 0o600 });
      await writeFile(join(store, "sentinel"), "retained synthetic data", { mode: 0o600 });
      await expect(verifyExecutionStoreOwnership(store, root, "test-synthetic", "owned"))
        .rejects.toThrow("cleanup refused");
      expect(await readFile(join(store, "sentinel"), "utf8")).toBe("retained synthetic data");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("cleans only its owned clone after callback failure and restores configured state", async () => {
    requireOwnedExecutionClone();
    const prior = { database: process.env.DATABASE_URL, store: process.env.TURAS_WORKFORCE_STORE_ROOT };
    let clone = "", root = "";
    await expect(withExecutionEvalEnvironment(async env => {
      clone = env.databaseName; root = env.workforceRoot;
      expect(root).not.toBe(prior.store);
      expect(env.workflowRoot).toContain(env.appRoot);
      throw new Error("Synthetic callback failure");
    }, { sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL }))
      .rejects.toThrow("Synthetic callback failure");
    expect(process.env.DATABASE_URL).toBe(prior.database);
    expect(process.env.TURAS_WORKFORCE_STORE_ROOT).toBe(prior.store);
    await expect(readFile(join(root, ".turas-workforce-store.json"))).rejects.toMatchObject({ code: "ENOENT" });
    const client = new Client({ connectionString: prior.database }); await client.connect();
    try { expect((await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [clone])).rowCount).toBe(0); }
    finally { await client.end(); }
  }, 120_000);
});
