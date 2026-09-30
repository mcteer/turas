import { spawnSync } from "node:child_process";
import { withPlanEvalEnvironment } from "./plan-eval-environment";

const suites = [
  "tests/contracts/plan-content.test.ts",
  "tests/contracts/plans-api.test.ts",
  "tests/contracts/plan-drafting.test.ts",
  "tests/contracts/plan-decisions.test.ts",
  "tests/contracts/plan-revisions.test.ts",
  "tests/integration/plan-foundation.test.ts",
  "tests/integration/plan-authoring.test.ts",
  "tests/integration/plan-context.test.ts",
  "tests/integration/plan-drafting.test.ts",
  "tests/integration/plan-acceptance.test.ts",
  "tests/integration/plan-lifecycle.test.ts",
  "tests/unit/plan-design.test.ts",
  "tests/unit/plan-model-budget.test.ts",
  "tests/unit/plan-diff.test.ts",
  "tests/unit/plan-telemetry.test.ts",
];

if (process.argv.length !== 2) throw new Error("test:plans takes no database or test-path overrides");
await withPlanEvalEnvironment(async () => {
  const result = spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run",
    "--reporter=verbose","--silent=true",...suites],{
    env:{...process.env,CI:process.env.CI ?? ""},
    stdio:"inherit",timeout:900_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error("006 disposable plan checks failed");
  }
});
