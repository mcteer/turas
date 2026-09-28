import { mkdir, writeFile } from "node:fs/promises";
import dataset002 from "../evals/fixtures/002-capability-honesty.json";
import dataset003 from "../evals/fixtures/003-context-governance.json";
import { runBehaviorCase, type BehaviorCase, type BehaviorResult } from "../evals/driver";

const args = process.argv.slice(2);
const feature = args.length === 1 && args[0] === "--live" ? "002" :
  (args.length === 3 || args.length === 5) && args[0] === "--feature" &&
    args[1] === "003" && args[2] === "--live" &&
    (args.length === 3 || args[3] === "--case") ? "003" : null;
if (!feature) throw new Error("Use --live or --feature 003 --live for a bounded local evaluation");
const dataset = feature === "003" ? dataset003 : dataset002;
const caseFilter = args.length === 5 ? args[4] : null;
if (dataset.cases.length !== 6 || dataset.cases.some((item) => !item.id || !item.required)) {
  throw new Error("Versioned behavior dataset is incomplete");
}
const selectedCases = caseFilter ? dataset.cases.filter((item) => item.id === caseFilter) : dataset.cases;
if (selectedCases.length !== (caseFilter ? 1 : 6)) throw new Error("Unknown behavior case");
const results: BehaviorResult[] = [];
let completedSteps = 0;
await mkdir("local-artifacts", { recursive: true });
const path = `local-artifacts/behavior-eval-${feature}-${caseFilter ?? "full"}-${Date.now()}.json`;
const persist = () => writeFile(path, JSON.stringify({ feature, caseFilter,
  datasetVersion: dataset.version,
  rubric: dataset.rubric, results }, null, 2));
for (const item of selectedCases as BehaviorCase[]) {
  for (const run of [1, 2]) {
    if (results.length >= 14 || (feature === "003" && completedSteps >= 14)) {
      throw new Error("Behavior evaluation model-step cap exceeded");
    }
    const result = await runBehaviorCase(item, run, feature);
    completedSteps += result.modelSteps;
    results.push(result);
    await persist();
    console.log(JSON.stringify({ caseId: result.caseId, run, terminal: result.terminal,
      outputTokens: result.outputTokens, modelSteps: result.modelSteps,
      completedSteps, durationMs: result.durationMs, hardGates: result.hardGates }));
    if (feature === "003" && completedSteps > 14) {
      throw new Error(`Behavior evaluation exceeded 14 completed model steps (${completedSteps})`);
    }
    if (Object.values(result.hardGates).some((value) => !value)) {
      throw new Error(`Hard gate failed: ${item.id} run ${run}`);
    }
  }
}
console.log(`Saved ${results.length} live responses for semantic review: ${path}`);
