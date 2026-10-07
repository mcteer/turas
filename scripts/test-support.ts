import { spawnSync } from "node:child_process";
import { readdirSync, openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { verifyExecutionTestReport } from "./test-execution";
import { featureSourceDigest } from "./execution-source-digest";

export const SUPPORT_SUITES = [
  "tests/unit/support-environment.test.ts", "tests/unit/support-policy.test.ts",
  "tests/unit/support-readiness.test.ts", "tests/unit/support-command-identity.test.ts",
  "tests/unit/support-ordering.test.ts",
  "tests/unit/support-owner-batch.test.ts",
  "tests/unit/support-evaluation.test.ts",
  "tests/unit/support-review.test.ts",
  "tests/unit/support-model-budget.test.ts",
  "tests/unit/support-release-preflight.test.ts",
  "tests/contracts/support-schema.test.ts", "tests/contracts/support-command-schema.test.ts",
  "tests/contracts/support-http.test.ts",
  "tests/contracts/support-escalation.test.ts",
  "tests/contracts/support-advice.test.ts",
  "tests/integration/support-advice-preparation.test.ts",
  "tests/integration/support-lifecycle.test.ts",
  "tests/integration/support-schema.test.ts", "tests/integration/support-policy.test.ts",
  "tests/integration/support-sources.test.ts", "tests/integration/support-readiness.test.ts",
  "tests/integration/support-actions.test.ts",
  "tests/integration/support-http.test.ts",
] as const;

export function verifySupportSuiteCoverage(root = process.cwd(), expected: readonly string[] = SUPPORT_SUITES) {
  const discovered = ["unit", "contracts", "integration"].flatMap(group =>
    readdirSync(resolve(root, "tests", group)).filter(name => /^support-.*\.test\.ts$/.test(name))
      .map(name => `tests/${group}/${name}`)).sort();
  if (!expected.length || new Set(expected).size !== expected.length ||
    discovered.length !== expected.length || discovered.some(name => !expected.includes(name)))
    throw new Error("Support suite coverage is missing, duplicated or orphaned");
  return discovered;
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Support checks accept no test-path or database overrides");
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Support checks require Node 24");
  assertDeterministicTestMode();
  const suites = verifySupportSuiteCoverage(), sourceDigest = await featureSourceDigest("010");
  await mkdir(resolve("local-artifacts/010"), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/010/deterministic-"));
  await writeFile(resolve(directory, "source.json"), JSON.stringify({ sourceDigest, suites }), { mode: 0o600 });
  const passed: Array<{ suites: number; passed: number }> = [];
  for (const [index, suite] of suites.entries()) {
    const reportPath = resolve(directory, `suite-${index}.json`), logPath = resolve(directory, `suite-${index}.log`);
    const fd = openSync(logPath, "wx", 0o600);
    async function run() {
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", suite,
        "--reporter=json", `--outputFile=${reportPath}`], {
        env: process.env, stdio: ["ignore", fd, fd], timeout: 120_000,
      });
      if (result.error || result.status !== 0) throw new Error(`Support suite failed: ${suite}; inspect private evidence`);
      passed.push(verifyExecutionTestReport(JSON.parse(await readFile(reportPath, "utf8")), [suite]));
    }
    try {
      if (suite.startsWith("tests/integration/")) await withSupportEvalEnvironment(async environment => {
        await createSupportActors(environment.appRoot);
        await run();
      }, { empty: true, deadlineAt: Date.now() + 180_000 });
      else await run();
    } finally { closeSync(fd); }
  }
  if (await featureSourceDigest("010") !== sourceDigest) throw new Error("Support source changed during verification");
  const evidence = { sourceDigest, suites: passed.length, passed: passed.reduce((sum, report) => sum + report.passed, 0),
    failed: 0, skipped: 0, completedAt: new Date().toISOString() };
  await writeFile(resolve(directory, "summary.json"), JSON.stringify(evidence), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error instanceof Error ? error.message : "Support check failed"); process.exitCode = 1; });
