import { readFileSync } from "node:fs";
import dataset from "../evals/fixtures/002-capability-honesty.json";
import type { BehaviorResult } from "../evals/driver";

const path = process.argv[2];
if (!path || process.argv.length !== 3 || !path.startsWith("local-artifacts/")) {
  throw new Error("Use a local-artifacts/behavior-eval-<timestamp>.json review file");
}
const review = JSON.parse(readFileSync(path, "utf8")) as {
  datasetVersion: number; results: BehaviorResult[];
};
if (review.datasetVersion !== dataset.version || review.results.length !== 12) {
  throw new Error("Behavior review dataset or run count mismatch");
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
