import { spawnSync } from "node:child_process";
import { readdirSync, openSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { createExpansionActors } from "../tests/fixtures/expansion/seed";
import { withExpansionEvalEnvironment } from "./expansion-eval-environment";
import { verifyExecutionTestReport } from "./test-execution";
import { featureSourceDigest } from "./execution-source-digest";

export const EXPANSION_SUITES = [
  "tests/unit/expansion-review-verifier.test.ts",
  "tests/unit/expansion-model-budget.test.ts", "tests/unit/expansion-content.test.ts", "tests/unit/expansion-ranking.test.ts", "tests/unit/expansion-cursor.test.ts", "tests/contracts/expansion-http.test.ts", "tests/contracts/expansion-content.test.ts", "tests/contracts/expansion-projection.test.ts", "tests/contracts/expansion-advice.test.ts", "tests/integration/expansion-advice-lifecycle.test.ts", "tests/integration/expansion-suggestions.test.ts", "tests/integration/expansion-native.test.ts", "tests/integration/expansion-advice-preparation.test.ts", "tests/integration/expansion-advice-storage.test.ts", "tests/integration/expansion-foundation.test.ts", "tests/integration/expansion-authoring.test.ts", "tests/integration/expansion-owner-decisions.test.ts", "tests/integration/expansion-qualification.test.ts", "tests/integration/expansion-ranking.test.ts", "tests/integration/expansion-related.test.ts", "tests/integration/expansion-links.test.ts", "tests/integration/expansion-retention.test.ts", "tests/integration/expansion-decision-races.test.ts",
] as const;

export function verifyExpansionSuiteCoverage(root = process.cwd(), expected: readonly string[] = EXPANSION_SUITES) {
  const discovered = ["unit", "contracts", "integration"].flatMap(group =>
    readdirSync(resolve(root, "tests", group)).filter(name => /^expansion-.*\.test\.ts$/.test(name))
      .map(name => `tests/${group}/${name}`)).sort();
  if (!expected.length || new Set(expected).size !== expected.length ||
    discovered.length !== expected.length || discovered.some(name => !expected.includes(name)))
    throw new Error("Expansion suite coverage is missing, duplicated or orphaned");
  return discovered;
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Expansion checks accept no test-path or database overrides");
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Expansion checks require Node 24");
  assertDeterministicTestMode();
  const suites = verifyExpansionSuiteCoverage(), sourceDigest = await featureSourceDigest("011");
  await mkdir(resolve("local-artifacts/011"), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/011/deterministic-"));
  await writeFile(resolve(directory, "source.json"), JSON.stringify({ sourceDigest, suites }), { mode: 0o600 });
  const passed: Array<{ suites: number; passed: number }> = [];
  for (const [index, suite] of suites.entries()) {
    const reportPath = resolve(directory, `suite-${index}.json`), logPath = resolve(directory, `suite-${index}.log`);
    const fd = openSync(logPath, "wx", 0o600);
    async function run() {
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", suite,
        "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`], {
        env: process.env, stdio: ["ignore", fd, fd], timeout: 120_000,
      });
      if (result.error || result.status !== 0) throw new Error(`Expansion suite failed: ${suite}; inspect private evidence`);
      passed.push(verifyExecutionTestReport(JSON.parse(await readFile(reportPath, "utf8")), [suite]));
    }
    try {
      if (suite.startsWith("tests/integration/")) await withExpansionEvalEnvironment(async environment => {
        await createExpansionActors(environment.appRoot);
        await run();
      }, { empty: true, deadlineAt: Date.now() + 180_000 });
      else await run();
    } finally { closeSync(fd); }
  }
  if (await featureSourceDigest("011") !== sourceDigest) throw new Error("Expansion source changed during verification");
  const evidence = { sourceDigest, suites: passed.length, passed: passed.reduce((sum, report) => sum + report.passed, 0),
    failed: 0, skipped: 0, completedAt: new Date().toISOString() };
  await writeFile(resolve(directory, "summary.json"), JSON.stringify(evidence), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error instanceof Error ? error.message : "Expansion check failed"); process.exitCode = 1; });
