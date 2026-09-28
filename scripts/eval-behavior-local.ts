import { mkdir, writeFile } from "node:fs/promises";
import dataset002 from "../evals/fixtures/002-capability-honesty.json";
import dataset003 from "../evals/fixtures/003-context-governance.json";
import dataset004 from "../evals/fixtures/004-artifact-governance.json";
import { runBehaviorCase, seedPartnerArtifactExcerpt,
  type BehaviorCase, type BehaviorResult } from "../evals/driver";
import { withArtifactEvalEnvironment } from "./artifact-eval-environment";

const args = process.argv.slice(2);
const feature = args.length === 1 && args[0] === "--live" ? "002" :
  (args.length === 3 || args.length === 5) && args[0] === "--feature" &&
    ["003","004"].includes(args[1]) && args[2] === "--live" &&
    (args.length === 3 || args[3] === "--case") ? args[1] as "003" | "004" : null;
if (!feature) throw new Error("Use --live or --feature 003|004 --live for a bounded local evaluation");
const dataset = feature === "003" ? dataset003 : feature === "004" ? dataset004 : dataset002;
const caseFilter = args.length === 5 ? args[4] : null;
const expectedCases = feature === "004" ? 8 : 6;
if (dataset.cases.length !== expectedCases || dataset.cases.some((item) => !item.id || !item.required)) {
  throw new Error("Versioned behavior dataset is incomplete");
}
const selectedCases = caseFilter ? dataset.cases.filter((item) => item.id === caseFilter) : dataset.cases;
if (selectedCases.length !== (caseFilter ? 1 : expectedCases)) throw new Error("Unknown behavior case");
const results: BehaviorResult[] = [];
let completedSteps = 0;
await mkdir("local-artifacts", { recursive: true });
const path = `local-artifacts/behavior-eval-${feature}-${caseFilter ?? "full"}-${Date.now()}.json`;
const persist = () => writeFile(path, JSON.stringify({ feature, caseFilter,
  datasetVersion: dataset.version,
  rubric: dataset.rubric, results }, null, 2));
const evaluate = async () => {
const evaluationStarted = Date.now();
if (feature === "004" && selectedCases.some((item) => item.id === "partner-reviewed-excerpt")) {
  await seedPartnerArtifactExcerpt();
}
for (const item of selectedCases as BehaviorCase[]) {
  for (const run of feature === "004" ? [1] : [1, 2]) {
    if (results.length >= (feature === "004" ? 8 : 14) ||
        (feature === "003" && completedSteps >= 14) ||
        (feature === "004" && (completedSteps >= 16 || Date.now()-evaluationStarted >= 20*60_000))) {
      throw new Error("Behavior evaluation model-step cap exceeded");
    }
    const result = await runBehaviorCase(item, run, feature);
    completedSteps += result.modelSteps;
    results.push(result);
    await persist();
    console.log(JSON.stringify({ caseId: result.caseId, run, terminal: result.terminal,
      outputTokens: result.outputTokens,maxStepOutputTokens: result.maxStepOutputTokens,
      staleHistoryStatus: result.staleHistoryStatus,staleSendStatus: result.staleSendStatus,
      modelSteps: result.modelSteps,
      completedSteps, durationMs: result.durationMs, hardGates: result.hardGates }));
    if (feature === "003" && completedSteps > 14) {
      throw new Error(`Behavior evaluation exceeded 14 completed model steps (${completedSteps})`);
    }
    if (feature === "004" && (completedSteps > 16 ||
        (result.maxStepOutputTokens ?? 1_201) > 1_200 ||
        result.durationMs > 120_000 || Date.now()-evaluationStarted > 20*60_000)) {
      throw new Error(`004 behavior evaluation exceeded a bounded runtime or output limit: ${item.id}`);
    }
    if (Object.values(result.hardGates).some((value) => !value)) {
      throw new Error(`Hard gate failed: ${item.id} run ${run}`);
    }
  }
}
};
if (feature === "004") await withArtifactEvalEnvironment(evaluate);
else await evaluate();
console.log(`Saved ${results.length} live responses for semantic review: ${path}`);
