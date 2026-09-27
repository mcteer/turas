import { mkdir, writeFile } from "node:fs/promises";
import dataset from "../evals/fixtures/002-capability-honesty.json";
import { runBehaviorCase, type BehaviorCase, type BehaviorResult } from "../evals/driver";

if (process.argv.slice(2).join(" ") !== "--live") {
  throw new Error("Behavior evaluation requires the explicit --live flag");
}
if (dataset.cases.length !== 6 || dataset.cases.some((item) => !item.id || !item.required)) {
  throw new Error("Versioned behavior dataset is incomplete");
}
const results: BehaviorResult[] = [];
await mkdir("local-artifacts", { recursive: true });
const path = `local-artifacts/behavior-eval-${Date.now()}.json`;
const persist = () => writeFile(path, JSON.stringify({ datasetVersion: dataset.version,
  rubric: dataset.rubric, results }, null, 2));
for (const item of dataset.cases as BehaviorCase[]) {
  for (const run of [1, 2]) {
    if (results.length >= 12) throw new Error("Behavior evaluation turn cap exceeded");
    const result = await runBehaviorCase(item, run);
    results.push(result);
    await persist();
    console.log(JSON.stringify({ caseId: result.caseId, run, terminal: result.terminal,
      outputTokens: result.outputTokens, hardGates: result.hardGates }));
    if (Object.values(result.hardGates).some((value) => !value)) {
      throw new Error(`Hard gate failed: ${item.id} run ${run}`);
    }
  }
}
console.log(`Saved 12 live responses for semantic review: ${path}`);
