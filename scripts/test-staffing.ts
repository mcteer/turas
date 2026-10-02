import { spawnSync } from "node:child_process";
import { readdirSync, openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { withStaffingEvalEnvironment } from "./staffing-eval-environment";
import { z } from "zod";

export const STAFFING_SUITES = [
  "tests/unit/staffing-test-manifest.test.ts",
  "tests/unit/staffing-contracts.test.ts",
  "tests/unit/staffing-import-contracts.test.ts",
  "tests/unit/staffing-store.test.ts",
  "tests/unit/staffing-client-commands.test.ts",
  "tests/unit/staffing-demand-contracts.test.ts",
  "tests/unit/staffing-allocation-contracts.test.ts",
  "tests/unit/staffing-allocation-ledger.test.ts",
  "tests/unit/staffing-matching.test.ts",
  "tests/unit/staffing-matching-contracts.test.ts",
  "tests/unit/staffing-telemetry.test.ts",
  "tests/unit/staffing-calendar.test.ts",
  "tests/unit/staffing-calendar-contracts.test.ts",
  "tests/unit/staffing-calendar-resolution.test.ts",
  "tests/unit/staffing-maintenance-scheduler.test.ts",
  "tests/unit/staffing-freshness.test.ts",
  "tests/unit/staffing-economics.test.ts",
  "tests/unit/staffing-finance-contracts.test.ts",
  "tests/unit/staffing-model-budget.test.ts",
  "tests/unit/staffing-review.test.ts",
  "tests/unit/staffing-dependencies.test.ts",
  "tests/unit/staffing-tool-contracts.test.ts",
  "tests/unit/staffing-agent-catalog.test.ts",
  "tests/unit/staffing-query-counts.test.ts",
  "tests/unit/staffing-live-stream.test.ts",
  "tests/unit/staffing-live-provider.test.ts",
  "tests/unit/staffing-live-cancellation.test.ts",
  "tests/unit/staffing-ui-report.test.ts",
  "tests/unit/staffing-eval-copy.test.ts",
  "tests/contracts/staffing-policy.test.ts",
  "tests/contracts/staffing-command-api.test.ts",
  "tests/contracts/staffing-projections.test.ts",
  "tests/contracts/staffing-import-api.test.ts",
  "tests/contracts/staffing-demand-api.test.ts",
  "tests/contracts/staffing-allocation-api.test.ts",
  "tests/contracts/staffing-partner.test.ts",
  "tests/contracts/staffing-finance-api.test.ts",
  "tests/integration/staffing-environment.test.ts",
  "tests/integration/staffing-schema.test.ts",
  "tests/integration/staffing-imports.test.ts",
  "tests/integration/staffing-competencies.test.ts",
  "tests/integration/staffing-matching.test.ts",
  "tests/integration/staffing-decisions.test.ts",
  "tests/integration/staffing-lifecycle.test.ts",
  "tests/integration/staffing-economics.test.ts",
  "tests/integration/staffing-operations.test.ts",
  "tests/integration/staffing-advisory.test.ts",
  "tests/integration/staffing-native.test.ts",
  "tests/integration/staffing-telemetry.test.ts",
  "tests/integration/staffing-recovery.test.ts",
  "tests/integration/staffing-journey.test.ts",
] as const;

export function verifyStaffingSuiteCoverage(
  root = process.cwd(), expected: readonly string[] = STAFFING_SUITES,
): string[] {
  const actual = ["unit", "contracts", "integration"].flatMap((group) =>
    readdirSync(resolve(root, "tests", group)).filter((name) =>
      /^staffing-.*\.test\.ts$/.test(name)).map((name) => `tests/${group}/${name}`)).sort();
  const planned = new Set(expected);
  if (planned.size !== expected.length) throw new Error("Duplicate staffing suite manifest entry");
  if (actual.some((name) => !planned.has(name))) throw new Error("Orphaned staffing test suite");
  if (expected.some((name) => !actual.includes(name))) throw new Error("Missing planned staffing test suite");
  return actual;
}

/** Exit code alone cannot establish execution of every required suite. */
export function verifyStaffingTestReport(raw: unknown, suites: readonly string[]) {
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
    throw new Error("Staffing report requires every selected suite and passing assertion");
  }
  return { suites: found.size, passed: assertions, failed: 0, skipped: 0 };
}

async function main(): Promise<void> {
  const foundation = process.argv.length === 3 && process.argv[2] === "--foundation";
  if (!foundation && process.argv.length !== 2) throw new Error("test:staffing takes no DB or test-path overrides");
  assertDeterministicTestMode();
  const suites = foundation ? STAFFING_SUITES.filter(name => [
    "staffing-test-manifest.test.ts", "staffing-contracts.test.ts", "staffing-policy.test.ts",
    "staffing-command-api.test.ts", "staffing-environment.test.ts", "staffing-schema.test.ts",
  ].some(suffix => name.endsWith(suffix))) : verifyStaffingSuiteCoverage();
  const root = resolve("local-artifacts/007");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve(root, foundation ? "foundation-" : "deterministic-"));
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
      console.log(JSON.stringify({ gate: "owned-staffing", suite, phase: "started" }));
      await withStaffingEvalEnvironment(async environment => {
        if (!foundation) await environment.prepareRuntime();
        const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run",
          "--reporter=verbose", "--reporter=json", `--outputFile.json=${suiteReportPath}`, "--silent=true", "--testTimeout=120000", "--hookTimeout=120000", suite], {
          env: { ...process.env, CI: process.env.CI ?? "" }, stdio: ["ignore", fd, fd], timeout: 1_200_000,
        });
        if (result.error || result.status !== 0) {
          // Publish only authored test identities and code locations. The full
          // assertion output can include private records and stays in the local log.
          const failed = await readFile(suiteReportPath, "utf8").then(text => JSON.parse(text)).catch(() => null);
          const failures = (failed?.testResults ?? []).flatMap((file: { assertionResults?: { title: string; status: string; failureMessages?: string[] }[]; message?: string }) => {
            const assertions = (file.assertionResults ?? []).filter(test => test.status === "failed");
            return assertions.map(test => ({ title: test.title, locations: [...new Set(
              [...(test.failureMessages ?? []).join("\n").matchAll(/(?:tests|scripts|lib)\/[a-zA-Z0-9_./-]+\.[cm]?[jt]sx?:\d+:\d+/g)].map(match => match[0]))] }));
          });
          console.error(JSON.stringify({ gate: "owned-staffing", suite, phase: "failed", status: result.status, signal: result.signal, failures }));
          throw new Error(`007 disposable staffing suite failed: ${suite}`);
        }
        const report = JSON.parse(await readFile(suiteReportPath, "utf8"));
        verifyStaffingTestReport(report, [suite]);
        reports.push(report);
      });
    }
    const combined = { success: true,
      numTotalTests: reports.reduce((total, report) => total + report.numTotalTests, 0),
      numPassedTests: reports.reduce((total, report) => total + report.numPassedTests, 0),
      numFailedTests: reports.reduce((total, report) => total + report.numFailedTests, 0),
      numPendingTests: reports.reduce((total, report) => total + report.numPendingTests, 0),
      testResults: reports.flatMap(report => report.testResults) };
    await writeFile(reportPath, JSON.stringify(combined), { flag: "wx", mode: 0o600 });
    await chmod(reportPath, 0o600);
    console.log(JSON.stringify({ gate: foundation ? "owned-staffing-foundation" : "owned-staffing",
      ...verifyStaffingTestReport(combined, suites) }));
  } finally { closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      && ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code) ? error.code : "gate_failed";
    console.error(JSON.stringify({ gate: "owned-staffing", errorCode: code }));
    console.error("007 staffing checks failed; verify suite coverage and owned test configuration");
    process.exitCode = 1;
  });
}
