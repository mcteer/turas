import { spawnSync } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { withStaffingEvalEnvironment } from "./staffing-eval-environment";
import { verifyStaffingTestReport } from "./test-staffing";

if (process.argv.length !== 3 || process.argv[2] !== "--disposable") throw new Error("Recovery requires --disposable; no database overrides are supported");
assertDeterministicTestMode();
const root = resolve("local-artifacts/007");
await mkdir(root, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve(root, "recovery-"));
const report = resolve(directory, "recovery-current.json"), log = resolve(directory, "recovery-current.log");
closeSync(openSync(report, "w", 0o600));
try {
  await withStaffingEvalEnvironment(async environment => {
    await environment.prepareRuntime();
    const fd = openSync(log, "w", 0o600);
    let result;
    try {
      result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run",
        "tests/integration/staffing-recovery.test.ts", "tests/integration/staffing-native.test.ts",
        "--reporter=json", `--outputFile=${report}`, "--testTimeout=240000", "--hookTimeout=120000", "--silent=true"],
      { env: { ...process.env }, stdio: ["ignore", fd, fd], timeout: 1_200_000 });
    } finally { closeSync(fd); }
    if (result.error || result.status !== 0) throw new Error("Owned recovery execution failed");
    const counts = verifyStaffingTestReport(JSON.parse(await readFile(report, "utf8")),
      ["tests/integration/staffing-recovery.test.ts", "tests/integration/staffing-native.test.ts"]);
    if (counts.passed !== 8) throw new Error("Recovery requires all eight native/lease/cleanup cases with no skipped checks");
    console.log(JSON.stringify({ gate: "owned-staffing-recovery", ...counts,
      database: "same owned database; client reconnection", services: "Next/eve/maintenance supervisor", hostedProof: false }));
  });
} catch (error) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code) ? error.code : "gate_failed";
  console.error(JSON.stringify({ gate: "owned-staffing-recovery", errorCode: code }));
  console.error("007 recovery gate failed; inspect private owned reports and test-source readiness");
  process.exitCode = 1;
}
