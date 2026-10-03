import { readdirSync, openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { withStaffingEvalEnvironment } from "./staffing-eval-environment";
import { withPlanEvalEnvironment } from "./plan-eval-environment";
import { verifyStaffingTestReport } from "./test-staffing";

if (process.argv.length !== 2) throw new Error("Owned regression gate takes no overrides");
assertDeterministicTestMode();
const suites = ["unit", "contracts", "integration"].flatMap(group => readdirSync(resolve("tests", group))
  // This legacy case requires an externally prepared native conversation and
  // would otherwise silently skip. Owned staffing recovery is a separate gate.
  .filter(name => name.endsWith(".test.ts") && !name.startsWith("staffing-") && !name.startsWith("execution-") && name !== "runtime-restart.test.ts")
  .map(name => `tests/${group}/${name}`));
const plans = suites.filter(file => file.startsWith("tests/integration/plan-"));
const earlier = suites.filter(file => !plans.includes(file));
await mkdir("local-artifacts/007", { recursive: true, mode: 0o700 });
const root = await mkdtemp(resolve("local-artifacts/007/regressions-"));

async function runSubset(name: string, files: string[], environment: NodeJS.ProcessEnv) {
  const report = resolve(root, `${name}.json`), log = resolve(root, `${name}.log`);
  closeSync(openSync(report, "wx", 0o600));
  const fd = openSync(log, "wx", 0o600);
  let result;
  try {
    result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...files,
      "--reporter=verbose", "--reporter=json", `--outputFile.json=${report}`, "--silent=true",
      "--testTimeout=120000", "--hookTimeout=120000"],
    { env: environment, stdio: ["ignore", fd, fd], timeout: 1_200_000 });
  } finally { closeSync(fd); }
  if (result.error || result.status !== 0) return null;
  await chmod(report, 0o600);
  return verifyStaffingTestReport(JSON.parse(await readFile(report, "utf8")), files);
}
try {
  await withStaffingEvalEnvironment(async environment => {
    // The scanner tag may have been rebuilt by another owned feature gate.
    // Attest fresh images/assets inside this owned store rather than borrowing
    // a stale shared 004 manifest or changing the configured application store.
    const artifacts = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-artifacts.ts"], {
      env: process.env, stdio: "inherit", timeout: 600_000,
    });
    if (artifacts.error || artifacts.status !== 0) throw new Error("Owned regression artifact preparation failed");
    await environment.prepareRuntime();
    const appDatabase = process.env.DATABASE_URL_UNPOOLED;
    const sourceDatabaseUrl = process.env.TURAS_TEST_SOURCE_DATABASE_URL;
    if (!appDatabase || !sourceDatabaseUrl) throw new Error("Owned regression pair unavailable");
    // 002–005 fixtures need a separate test clone. 006 cases require the app
    // and test URL to be the same name-guarded 006 clone; isolate the native
    // drafting file from the other plan suites' shared synthetic send window.
    let earlierResult: Awaited<ReturnType<typeof runSubset>> = null;
    let planResult: Awaited<ReturnType<typeof runSubset>> = null;
    await withPlanEvalEnvironment(async testEnvironment => {
      const testDatabase = process.env.DATABASE_URL_UNPOOLED;
      if (!testDatabase || testDatabase === appDatabase || testEnvironment.databaseName === environment.databaseName)
        throw new Error("Owned regression databases are not distinct");
      const runtimeDatabase = new URL(appDatabase);
      runtimeDatabase.searchParams.set("options", "-c role=turas_runtime");
      const base = { ...process.env, TURAS_APP_ORIGIN: "http://127.0.0.1:3000" };
      earlierResult = await runSubset("earlier", earlier, { ...base, DATABASE_URL: runtimeDatabase.toString(),
        DATABASE_URL_UNPOOLED: appDatabase, TURAS_TEST_DATABASE_URL: testDatabase, TURAS_OWNED_REGRESSION_SETUP: "1",
        TURAS_TEST_ARTIFACT_STORE_ROOT: environment.storeRoot });
      planResult = await runSubset("plans", plans.filter(file => !file.endsWith("/plan-drafting.test.ts")),
        { ...base, DATABASE_URL: testDatabase, DATABASE_URL_UNPOOLED: testDatabase,
          TURAS_TEST_DATABASE_URL: testDatabase, TURAS_OWNED_REGRESSION_SETUP: "0" });
    }, { sourceDatabaseUrl, feature: "006" });
    const draftingResult = await withPlanEvalEnvironment(async testEnvironment => {
      const selected = process.env.DATABASE_URL_UNPOOLED;
      if (!selected || testEnvironment.databaseName === environment.databaseName || selected === appDatabase)
        throw new Error("Owned plan drafting clone unavailable");
      return runSubset("plan-drafting", plans.filter(file => file.endsWith("/plan-drafting.test.ts")),
        { ...process.env, DATABASE_URL: selected, DATABASE_URL_UNPOOLED: selected,
          TURAS_TEST_DATABASE_URL: selected, TURAS_OWNED_REGRESSION_SETUP: "0", TURAS_APP_ORIGIN: "http://127.0.0.1:3000" });
    }, { sourceDatabaseUrl, feature: "006" });
    if (!earlierResult || !planResult || !draftingResult) throw new Error("Owned regression execution failed");
    console.log(JSON.stringify({ gate: "owned-002-006-deterministic-regressions",
      earlier: earlierResult, plans: planResult, drafting: draftingResult,
      separateRecoveryRequired: true, externalCheckpointExcluded: "tests/integration/runtime-restart.test.ts" }));
  });
} catch {
  console.error("Owned 002–006 regression gate failed; inspect private reports locally");
  process.exitCode = 1;
}
