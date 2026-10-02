import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Client } from "pg";
import { withPlanEvalEnvironment, type PlanEvalEnvironment } from "./plan-eval-environment";
import { ownedEvalTimeout } from "./eval-deadline";
import { copyOwnedEvalFiles } from "./eval-owned-copy";

export type StaffingEvalEnvironment = PlanEvalEnvironment & {
  workforceRoot: string;
  workflowRoot: string;
  upgrade: () => Promise<void>;
  prepareRuntime: () => Promise<void>;
};

export function requireOwnedStaffingClone(
  environment: Record<string, string | undefined> = process.env,
): string {
  const url = environment.DATABASE_URL;
  if (!url || url !== environment.DATABASE_URL_UNPOOLED ||
      url !== environment.TURAS_TEST_DATABASE_URL ||
      environment.TURAS_ENVIRONMENT_ID !== environment.TURAS_TEST_ENVIRONMENT_ID ||
      !environment.TURAS_ENVIRONMENT_ID?.startsWith("test-")) {
    throw new Error("007 checks require the owned disposable clone");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid owned clone identity"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !/^\/turas_test_007_eval_[a-f0-9]{12}$/.test(parsed.pathname)) {
    throw new Error("007 checks require the owned disposable clone");
  }
  return url;
}

export async function verifyStaffingStoreOwnership(
  root: string, ownerRoot: string, environmentId: string, ownerToken: string,
): Promise<void> {
  const canonicalOwner = await realpath(ownerRoot);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("Workforce store ownership invalid; cleanup refused");
  }
  const canonicalRoot = await realpath(root);
  const within = relative(canonicalOwner, canonicalRoot);
  if (!within || within === ".." || within.startsWith(`..${sep}`)) {
    throw new Error("Workforce store outside owned environment; cleanup refused");
  }
  const markerPath = join(canonicalRoot, ".turas-workforce-store.json");
  const markerStat = await lstat(markerPath);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || (markerStat.mode & 0o077) !== 0) {
    throw new Error("Workforce store marker invalid; cleanup refused");
  }
  const marker: unknown = JSON.parse(await readFile(markerPath, "utf8"));
  if (!marker || typeof marker !== "object" ||
      !("environmentId" in marker) || marker.environmentId !== environmentId ||
      !("ownerToken" in marker) || marker.ownerToken !== ownerToken) {
    throw new Error("Workforce store marker changed; cleanup refused");
  }
}

/** Only the existing marked test source may be cloned. No app/DB URL CLI override. */
export async function withStaffingEvalEnvironment<T>(
  run: (environment: StaffingEvalEnvironment) => Promise<T>,
  options: { empty?: boolean; sourceDatabaseUrl?: string; initialSchemaVersion?: 31; deadlineAt?: number } = {},
): Promise<T> {
  let workforceRoot = "";
  const ownerToken = randomUUID();
  const repositoryRoot = process.cwd();
  const runtimeAssetRoot = process.env.TURAS_STAFFING_RUNTIME_ASSET_ROOT ??
    process.env.TURAS_TEST_ARTIFACT_STORE_ROOT ?? process.env.TURAS_ARTIFACT_STORE_ROOT;
  return withPlanEvalEnvironment(async (environment) => {
    requireOwnedStaffingClone();
    return run({ ...environment, workforceRoot,
      workflowRoot: join(environment.appRoot, ".eve", ".workflow-data"),
      prepareRuntime: async () => {
        const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-staffing.ts"], {
          cwd: repositoryRoot, env: process.env, stdio: "inherit", timeout: ownedEvalTimeout(options.deadlineAt,600_000), killSignal: "SIGKILL",
        });
        if (result.error || result.status !== 0) throw new Error("Owned workforce preparation failed");
        ownedEvalTimeout(options.deadlineAt,1);
      },
      upgrade: async () => {
        const selected = requireOwnedStaffingClone();
        if (new URL(selected).pathname !== `/${environment.databaseName}`) {
          throw new Error("Staffing upgrade target changed");
        }
        copyOwnedEvalFiles(join(repositoryRoot, "migrations"), join(environment.appRoot, "migrations"),
          { deadlineAt: options.deadlineAt });
        for (const file of ["scripts/db-migrate.ts", "scripts/db-roles.ts"]) {
          const result = spawnSync(process.execPath, ["--experimental-strip-types", file], {
            cwd: environment.appRoot, env: process.env, encoding: "utf8", timeout: ownedEvalTimeout(options.deadlineAt,120_000), killSignal: "SIGKILL",
          });
          if (result.error || result.status !== 0) throw new Error("Owned staffing upgrade failed");
        }
      },
    });
  }, {
    ...options,
    feature: "007",
    prepare: async ({ appRoot, storeRoot, environmentId }) => {
      // The configured store is read-only here. Copy public runtime assets only,
      // never customer originals/staged files into a disposable clone.
      if (!process.env.TURAS_TEST_ARTIFACT_STORE_ROOT && runtimeAssetRoot) {
        for (const component of ["signatures", "assets", "runtime-images.json"]) {
          copyOwnedEvalFiles(join(runtimeAssetRoot, component), join(storeRoot, component),
            { deadlineAt: options.deadlineAt, allowMissing: true });
        }
      }
      if (options.initialSchemaVersion === 31) {
        if (!options.empty) throw new Error("Schema-031 fixture requires an empty owned clone");
        const directory = join(appRoot, "migrations");
        const manifest: { version: number; migrations: { file: string; sha256: string }[] } =
          JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
        manifest.migrations = manifest.migrations.filter((entry) => Number(entry.file.slice(0, 3)) <= 31);
        for (const file of await readdir(directory)) {
          if (/^\d{3}-.*\.cjs$/.test(file) && Number(file.slice(0, 3)) > 31) await rm(join(directory, file));
        }
        await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
      }
      workforceRoot = join(dirname(appRoot), "workforce");
      await mkdir(workforceRoot, { mode: 0o700 });
      await writeFile(join(workforceRoot, ".turas-workforce-store.json"),
        JSON.stringify({ environmentId, ownerToken }), { mode: 0o600 });
      await verifyStaffingStoreOwnership(workforceRoot, dirname(appRoot), environmentId, ownerToken);
      return { TURAS_WORKFORCE_STORE_ROOT: workforceRoot };
    },
    cleanupGuard: async ({ appRoot, databaseUrl, databaseName, environmentId }) => {
      if (!/^turas_test_007_eval_[a-f0-9]{12}$/.test(databaseName) ||
          new URL(databaseUrl).pathname !== `/${databaseName}`) {
        throw new Error("Owned staffing database identity changed; cleanup refused");
      }
      await verifyStaffingStoreOwnership(workforceRoot, resolve(appRoot, ".."),
        environmentId, ownerToken);
      const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
      await client.connect();
      try {
        const exists = await client.query<{ present: boolean }>(
          "SELECT to_regclass('public.turas_environment') IS NOT NULL AS present");
        if (exists.rows[0]?.present) {
          const marker = await client.query<{ environment_id: string }>(
            "SELECT environment_id FROM turas_environment");
          if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== environmentId) {
            throw new Error("Staffing database marker changed; cleanup refused");
          }
        }
      } finally { await client.end(); }
    },
  });
}
