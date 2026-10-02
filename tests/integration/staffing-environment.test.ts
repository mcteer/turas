import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { requireOwnedStaffingClone, verifyStaffingStoreOwnership,
  withStaffingEvalEnvironment } from "../../scripts/staffing-eval-environment";

describe("007 disposable ownership", () => {
  it("rejects app, Preview, Production and unrelated database identities before connection", () => {
    for (const name of ["turas", "turas_preview_005", "production", "turas_test_006_eval_abcdef123456"]) {
      const url = `postgres://localhost/${name}`;
      expect(() => requireOwnedStaffingClone({ DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url, TURAS_TEST_DATABASE_URL: url,
        TURAS_ENVIRONMENT_ID: "test-synthetic", TURAS_TEST_ENVIRONMENT_ID: "test-synthetic" })).toThrow();
    }
    expect(() => requireTestDatabaseUrl({ TURAS_TEST_DATABASE_URL: "postgres://localhost/turas_test",
      DATABASE_URL: "postgres://localhost/turas_test", TURAS_TEST_ENVIRONMENT_ID: "test-synthetic" })).toThrow();
    const url = "postgres://localhost/turas_test_007_eval_abcdef123456";
    expect(requireOwnedStaffingClone({ DATABASE_URL: url, DATABASE_URL_UNPOOLED: url,
      TURAS_TEST_DATABASE_URL: url, TURAS_ENVIRONMENT_ID: "test-synthetic",
      TURAS_TEST_ENVIRONMENT_ID: "test-synthetic" })).toBe(url);
  });

  it("refuses foreign store markers without deleting their content", async () => {
    const root = await mkdtemp(join(tmpdir(), "turas-staffing-ownership-"));
    const store = join(root, "workforce");
    try {
      await mkdir(store, { mode: 0o700 });
      await writeFile(join(store, ".turas-workforce-store.json"),
        JSON.stringify({ environmentId: "test-synthetic", ownerToken: "foreign" }), { mode: 0o600 });
      await writeFile(join(store, "sentinel"), "synthetic retained data", { mode: 0o600 });
      await expect(verifyStaffingStoreOwnership(store, root, "test-synthetic", "owned"))
        .rejects.toThrow("cleanup refused");
      expect(await readFile(join(store, "sentinel"), "utf8")).toBe("synthetic retained data");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("cleans only an owned clone after a failed callback and restores selected state", async () => {
    requireOwnedStaffingClone();
    const old = { database: process.env.DATABASE_URL, store: process.env.TURAS_WORKFORCE_STORE_ROOT };
    let clone = "";
    let root = "";
    await expect(withStaffingEvalEnvironment(async (environment) => {
      clone = environment.databaseName;
      root = environment.workforceRoot;
      expect(root).not.toBe(old.store);
      expect(environment.workflowRoot).toContain(environment.appRoot);
      throw new Error("Synthetic callback failure");
    }, { sourceDatabaseUrl: process.env.TURAS_TEST_SOURCE_DATABASE_URL }))
      .rejects.toThrow("Synthetic callback failure");
    expect(process.env.DATABASE_URL).toBe(old.database);
    expect(process.env.TURAS_WORKFORCE_STORE_ROOT).toBe(old.store);
    await expect(readFile(join(root, ".turas-workforce-store.json"))).rejects.toMatchObject({ code: "ENOENT" });
    const client = new Client({ connectionString: old.database });
    await client.connect();
    try {
      expect((await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [clone])).rowCount).toBe(0);
    } finally { await client.end(); }
  }, 120_000);
});
