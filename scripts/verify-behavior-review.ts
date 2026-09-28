import { readFileSync } from "node:fs";
import dataset002 from "../evals/fixtures/002-capability-honesty.json";
import dataset003 from "../evals/fixtures/003-context-governance.json";
import type { BehaviorResult } from "../evals/driver";

const args = process.argv.slice(2);
const feature = args.length === 3 && args[0] === "--feature" && args[1] === "003" ? "003" : "002";
const path = feature === "003" ? args[2] : args[0];
if (!path || args.length !== (feature === "003" ? 3 : 1) ||
    !path.startsWith("local-artifacts/")) {
  throw new Error("Use a local-artifacts/behavior-eval-<timestamp>.json review file");
}
const dataset = feature === "003" ? dataset003 : dataset002;
const review = JSON.parse(readFileSync(path, "utf8")) as {
  feature?: string; datasetVersion: number; results: BehaviorResult[];
};
if (review.datasetVersion !== dataset.version || review.results.length !== 12 ||
    (feature === "003" && review.feature !== "003")) {
  throw new Error("Behavior review dataset or run count mismatch");
}
if (feature === "003") {
  const steps = review.results.map((result) => result.modelSteps);
  if (steps.some((value) => !Number.isInteger(value) || value < 1) ||
      steps.reduce((total, value) => total + value, 0) > 14) {
    throw new Error("Behavior review lacks a valid 14-model-step runtime count");
  }
}
for (const item of dataset.cases) {
  for (const run of [1, 2]) {
    const matches = review.results.filter((result) => result.caseId === item.id && result.run === run);
    if (matches.length !== 1 || matches[0].semanticScore !== 1 ||
        !matches[0].rationale?.trim() || !matches[0].response.trim() ||
        Object.values(matches[0].hardGates).some((value) => !value)) {
      throw new Error(`Behavior review failed: ${item.id} run ${run}`);
    }
  }
}
console.log("12 of 12 semantic reviews and hard gates passed");
