import { spawnSync } from "node:child_process";
import { readdirSync, openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { withExecutionEvalEnvironment } from "./execution-eval-environment";
import { z } from "zod";
import { executionSourceDigest } from "./execution-source-digest";

export const EXECUTION_SUITES = [
  "tests/integration/execution-recovery.test.ts",
  "tests/integration/execution-native-evaluation.test.ts",
  "tests/integration/execution-telemetry.test.ts",
  "tests/integration/execution-eval-fixtures.test.ts",
  "tests/unit/execution-evaluation.test.ts",
  "tests/unit/execution-tool-contracts.test.ts",
  "tests/contracts/execution-advice-api.test.ts",
  "tests/integration/execution-native.test.ts",
  "tests/integration/execution-lifecycle.test.ts",
  "tests/unit/execution-calculations.test.ts",
  "tests/contracts/execution-summary-api.test.ts",
  "tests/integration/execution-handoff.test.ts",
  "tests/integration/execution-effort.test.ts",
  "tests/integration/execution-utilization.test.ts",
  "tests/integration/execution-journey.test.ts",
  "tests/unit/execution-test-manifest.test.ts",
  "tests/unit/execution-contracts.test.ts",
  "tests/unit/execution-client.test.ts",
  "tests/unit/execution-projection.test.ts",
  "tests/contracts/execution-policy.test.ts",
  "tests/contracts/execution-time-api.test.ts",
  "tests/integration/execution-time.test.ts",
  "tests/integration/execution-time-races.test.ts",
  "tests/contracts/execution-register-api.test.ts",
  "tests/integration/execution-reconciliation.test.ts",
  "tests/contracts/execution-record-api.test.ts",
  "tests/contracts/execution-command-api.test.ts",
  "tests/integration/execution-schema.test.ts",
  "tests/integration/execution-records.test.ts",
  "tests/integration/execution-milestones.test.ts",
  "tests/integration/execution-environment.test.ts",
] as const;

export function verifyExecutionSuiteCoverage(
  root = process.cwd(), expected: readonly string[] = EXECUTION_SUITES,
): string[] {
  const actual = ["unit", "contracts", "integration"].flatMap((group) =>
    readdirSync(resolve(root, "tests", group)).filter((name) =>
      /^execution-.*\.test\.ts$/.test(name)).map((name) => `tests/${group}/${name}`)).sort();
  const planned = new Set(expected);
  if (planned.size !== expected.length) throw new Error("Duplicate execution suite manifest entry");
  if (actual.some((name) => !planned.has(name))) throw new Error("Orphaned execution test suite");
  if (expected.some((name) => !actual.includes(name))) throw new Error("Missing planned execution test suite");
  return actual;
}

/** Exit code alone cannot establish execution of every required suite. */
export function verifyExecutionTestReport(raw: unknown, suites: readonly string[]) {
  const count = z.number().int().nonnegative().max(10_000);
  const report = z.object({ success: z.literal(true), numTotalTests: count, numPassedTests: count,
    numFailedTests: z.literal(0), numPendingTests: z.literal(0),
    testResults: z.array(z.object({ name: z.string(), status: z.literal("passed"),
      assertionResults: z.array(z.object({ status: z.literal("passed") })).min(1) })).min(1) }).parse(raw);
  const expected = new Set(suites.map(path => resolve(path)));
  const found = new Set(report.testResults.map(result => resolve(result.name)));
  const assertions = report.testResults.reduce((total, result) => total + result.assertionResults.length, 0);
  if (expected.size !== suites.length || found.size !== report.testResults.length || found.size !== expected.size ||
    [...expected].some(path => !found.has(path)) || report.numTotalTests !== assertions || report.numPassedTests !== assertions) {
    throw new Error("Execution report requires every selected suite and passing assertion");
  }
  return { suites: found.size, passed: assertions, failed: 0, skipped: 0 };
}

async function main(): Promise<void> {
  const recoveryOnly = process.argv.length === 3 && process.argv[2] === "--recovery";
  const captureOnly = process.argv.length === 3 && process.argv[2] === "--capture";
  const evaluationOnly = process.argv.length === 3 && process.argv[2] === "--evaluation";
  const lifecycleOnly = process.argv.length === 3 && process.argv[2] === "--lifecycle";
  const nativeOnly = process.argv.length === 3 && process.argv[2] === "--native";
  const adviceContracts = process.argv.length === 3 && process.argv[2] === "--advice-contracts";
  const adviceOnly = process.argv.length === 3 && process.argv[2] === "--advice";
  const forecastOnly = process.argv.length === 3 && process.argv[2] === "--forecast";
  const timeOnly = process.argv.length === 3 && process.argv[2] === "--time";
  const registersOnly = process.argv.length === 3 && process.argv[2] === "--registers";
  const recordsOnly = process.argv.length === 3 && process.argv[2] === "--records";
  const schemaOnly = process.argv.length === 3 && process.argv[2] === "--foundation-schema";
  const foundation = schemaOnly || (process.argv.length === 3 && process.argv[2] === "--foundation");
  if (!recoveryOnly && !captureOnly && !evaluationOnly && !lifecycleOnly && !foundation && !recordsOnly && !timeOnly && !registersOnly && !forecastOnly && !adviceOnly && !adviceContracts && !nativeOnly && process.argv.length !== 2) throw new Error("test:execution takes no DB or test-path overrides");
  assertDeterministicTestMode();
  verifyExecutionSuiteCoverage();
  const suites = recoveryOnly ? EXECUTION_SUITES.filter(name=>name.endsWith("execution-recovery.test.ts")) : captureOnly ? EXECUTION_SUITES.filter(name=>name.endsWith("execution-native-evaluation.test.ts")) : evaluationOnly ? EXECUTION_SUITES.filter(name=>/execution-(evaluation|eval-fixtures|telemetry)\.test\.ts$/.test(name)) : lifecycleOnly ? EXECUTION_SUITES.filter(name=>name.endsWith("execution-lifecycle.test.ts")) : nativeOnly ? EXECUTION_SUITES.filter(name => name.endsWith("execution-native.test.ts")) : adviceContracts ? EXECUTION_SUITES.filter(name => /execution-(advice-api|tool-contracts)\.test\.ts$/.test(name)) : adviceOnly ? EXECUTION_SUITES.filter(name => /execution-(advice-api|tool-contracts|native|native-evaluation|lifecycle|evaluation|eval-fixtures|telemetry)\.test\.ts$/.test(name)) : forecastOnly ? EXECUTION_SUITES.filter(name => /execution-(calculations|summary-api|handoff|effort|utilization|journey)\.test\.ts$/.test(name)) : registersOnly ? EXECUTION_SUITES.filter(name => /execution-(register-api|reconciliation)\.test\.ts$/.test(name)) : timeOnly ? EXECUTION_SUITES.filter(name => /execution-time(-api|-races)?\.test\.ts$/.test(name)) : recordsOnly ? EXECUTION_SUITES.filter(name => /execution-(records|milestones|record-api|client)\.(test|spec)\.ts$/.test(name)) : schemaOnly ? EXECUTION_SUITES.filter(name => name.endsWith("execution-schema.test.ts")) : foundation ? EXECUTION_SUITES.filter(name => [
    "execution-test-manifest.test.ts", "execution-contracts.test.ts", "execution-projection.test.ts", "execution-policy.test.ts",
    "execution-command-api.test.ts", "execution-environment.test.ts", "execution-schema.test.ts",
  ].some(suffix => name.endsWith(suffix))) : verifyExecutionSuiteCoverage();
  const root = resolve("local-artifacts/008");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve(root, foundation ? "foundation-" : "deterministic-"));
  const sourceDigest = await executionSourceDigest();
  await writeFile(resolve(directory, "source.json"), JSON.stringify({ sourceDigest, suites, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  const reportPath = resolve(directory, "result.json"), logPath = resolve(directory, "result.log");
  const fd = openSync(logPath, "wx", 0o600);
  const reports: Array<{ success: boolean; numTotalTests: number; numPassedTests: number;
    numFailedTests: number; numPendingTests: number; testResults: unknown[] }> = [];
  try {
    // Database history is intentionally immutable. A separate owned clone per
    // file keeps one file's synthetic actor, grant and ledger fixtures from
    // changing another file's assertions or admission window.
    for (const [index, suite] of suites.entries()) {
      const suiteReportPath = resolve(directory, `suite-${index}.json`);
      closeSync(openSync(suiteReportPath, "wx", 0o600));
      await withExecutionEvalEnvironment(async environment => {
        if (!foundation && /execution-journey\.test\.ts$/.test(suite)) await environment.prepareRuntime();
        const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run",
          "--reporter=verbose", "--reporter=json", `--outputFile.json=${suiteReportPath}`, "--silent=true", "--testTimeout=120000", "--hookTimeout=120000", ...(nativeOnly ? ["--bail=1"] : []), suite], {
          env: { ...process.env, CI: process.env.CI ?? "" }, stdio: ["ignore", fd, fd], timeout: 1_200_000,
        });
        if (result.error || result.status !== 0) {
          const report = await readFile(suiteReportPath, "utf8").catch(() => "");
          const signatures = ["timed out", "timeout", "ECONNREFUSED", "Cannot find module", "expected", "environment marker", "statement timeout"];
          console.error(JSON.stringify({gate:"owned-execution-suite-failure",suite,status:result.status,
            signatures:signatures.filter(value=>report.toLowerCase().includes(value.toLowerCase()))}));
          throw new Error(`008 disposable execution suite failed: ${suite}`);
        }
        const report = JSON.parse(await readFile(suiteReportPath, "utf8"));
        verifyExecutionTestReport(report, [suite]);
        reports.push(report);
      });
    }
    if (await executionSourceDigest() !== sourceDigest) throw new Error("Execution source changed during the recorded run");
    const combined = { success: true,
      numTotalTests: reports.reduce((total, report) => total + report.numTotalTests, 0),
      numPassedTests: reports.reduce((total, report) => total + report.numPassedTests, 0),
      numFailedTests: reports.reduce((total, report) => total + report.numFailedTests, 0),
      numPendingTests: reports.reduce((total, report) => total + report.numPendingTests, 0),
      testResults: reports.flatMap(report => report.testResults) };
    await writeFile(reportPath, JSON.stringify(combined), { flag: "wx", mode: 0o600 });
    await chmod(reportPath, 0o600);
    console.log(JSON.stringify({ gate: foundation ? "owned-execution-foundation" : "owned-execution", sourceDigest,
      ...verifyExecutionTestReport(combined, suites) }));
  } finally { closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      && ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code) ? error.code : "gate_failed";
    console.error(JSON.stringify({ gate: "owned-execution", errorCode: code }));
    console.error("008 execution checks failed; verify suite coverage and owned test configuration");
    process.exitCode = 1;
  });
}
