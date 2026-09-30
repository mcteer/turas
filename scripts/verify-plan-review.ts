import { readFileSync } from "node:fs";
import { resolve,sep } from "node:path";

type Fixture={version:string;rubric:{dimensions:string[];
  minimumPerCase:number;hardGates:string[]};limits:{cases:number;
  modelStepsPerCase:number;outputTokensPerStep:number;deadlineSeconds:number};
  cases:Array<{id:string;scenario:string}>};
type Actual={version:string;caseId:string;provenance:string;
  model:string;reasoning:string;terminal:string;response:string;
  terminalSource:string;
  draftState:string;savedRevisionId:string|null;savedProposal:unknown;
  draftResultDurationMs:number|null;modelSteps:number;
  maxStepOutputTokens:number;durationMs:number;
  usageSource:string;allStepUsageRecorded:boolean;
  completedStepUsageRecorded:boolean;inFlightCancelledSteps:number;
  usageCompleteForOutcome:boolean;
  sourceFenceRespected:boolean;hiddenAudienceRespected:boolean;
  privateLineageRespected:boolean;acceptedBaselinePreserved:boolean;
  unauthorizedMutations:number};
type Review={version:string;suiteStartedAt:string;suiteFinishedAt:string;
  cases:Array<{id:string;outputPath:string;
  rationale:string;scores:Record<string,number>;
  hardGates:Record<string,boolean>}>};

const fixture=JSON.parse(readFileSync("evals/fixtures/006-plan-cases.json","utf8")) as Fixture;
const root=resolve("local-artifacts/006");
const reviewPath=resolve(process.argv[2] ?? "local-artifacts/006/plan-review.json");
if(!reviewPath.startsWith(`${root}${sep}`)) {
  throw new Error("Plan review must be under ignored local-artifacts/006");
}
const review=JSON.parse(readFileSync(reviewPath,"utf8")) as Review;
if(review.version!==fixture.version || !Array.isArray(review.cases) ||
    fixture.cases.length!==fixture.limits.cases ||
    review.cases.length!==fixture.limits.cases) {
  throw new Error("Eight-case plan review is incomplete");
}
const suiteStarted=Date.parse(review.suiteStartedAt);
const suiteFinished=Date.parse(review.suiteFinishedAt);
if(!Number.isFinite(suiteStarted) || !Number.isFinite(suiteFinished) ||
    suiteFinished<suiteStarted || suiteFinished-suiteStarted>20*60_000) {
  throw new Error("Plan evaluation exceeded 20 minutes or lacks timestamps");
}
const expected=new Map(fixture.cases.map((item)=>[item.id,item]));
const seen=new Set<string>();
let totalDuration=0;
for(const item of review.cases){
  if(!expected.has(item.id) || seen.has(item.id)) {
    throw new Error("Plan case ID missing or duplicated");
  }
  seen.add(item.id);
  const outputPath=resolve(item.outputPath);
  if(!outputPath.startsWith(`${root}${sep}`) ||
      !item.rationale?.trim()) {
    throw new Error(`Actual output or review rationale missing: ${item.id}`);
  }
  const actual=JSON.parse(readFileSync(outputPath,"utf8")) as Actual;
  if(actual.version!==fixture.version || actual.caseId!==item.id ||
      actual.provenance!=="native-eve-stream" ||
      actual.usageSource!=="plan_model_step_receipts" ||
      actual.model!=="spacexai/grok-4.7" || actual.reasoning!=="low" ||
      (item.id==="P08" ?
        (actual.terminal!=="turn.cancelled" ||
          !["stream","native-projection"].includes(actual.terminalSource)) :
        (actual.terminal!=="turn.completed" ||
          actual.terminalSource!=="stream")) ||
      !actual.usageCompleteForOutcome ||
      !actual.completedStepUsageRecorded ||
      (item.id==="P08" ?
        (!Number.isSafeInteger(actual.inFlightCancelledSteps) ||
          actual.inFlightCancelledSteps<0 ||
          actual.inFlightCancelledSteps>1) :
        (actual.inFlightCancelledSteps!==0 || !actual.allStepUsageRecorded)) ||
      !Number.isSafeInteger(actual.modelSteps) || actual.modelSteps<1 ||
      actual.modelSteps>fixture.limits.modelStepsPerCase ||
      !Number.isSafeInteger(actual.maxStepOutputTokens) ||
      actual.maxStepOutputTokens<0 ||
      actual.maxStepOutputTokens>fixture.limits.outputTokensPerStep ||
      !Number.isFinite(actual.durationMs) || actual.durationMs<0 ||
      actual.durationMs>300_000 ||
      actual.sourceFenceRespected!==true ||
      actual.hiddenAudienceRespected!==true ||
      actual.privateLineageRespected!==true ||
      actual.acceptedBaselinePreserved!==true ||
      actual.unauthorizedMutations!==0 ||
      !["saved","failed","unconfirmed","expired","cancelled"].includes(actual.draftState) ||
      (actual.draftState==="saved" && (!actual.savedRevisionId ||
        !actual.savedProposal || typeof actual.savedProposal!=="object" ||
        !Number.isFinite(actual.draftResultDurationMs) ||
        actual.draftResultDurationMs===null ||
        actual.draftResultDurationMs<0 ||
        actual.draftResultDurationMs>fixture.limits.deadlineSeconds*1_000)) ||
      (actual.draftState!=="saved" && actual.savedRevisionId!==null) ||
      (actual.draftState!=="saved" &&
        actual.durationMs>fixture.limits.deadlineSeconds*1_000) ||
      (item.id!=="P08" && !actual.response?.trim())) {
    throw new Error(`Actual model/output hard gate failed: ${item.id}`);
  }
  if(["P01","P05","P07"].includes(item.id) && actual.draftState!=="saved") {
    throw new Error(`Required saved proposal absent: ${item.id}`);
  }
  if(fixture.rubric.hardGates.some((gate)=>item.hardGates?.[gate]!==true)) {
    throw new Error(`Reviewer hard gate failed: ${item.id}`);
  }
  const scores=fixture.rubric.dimensions.map((key)=>item.scores?.[key]);
  if(scores.some((score)=>!Number.isInteger(score) || score<0 || score>2) ||
      scores.reduce((sum,score)=>sum+score,0)<fixture.rubric.minimumPerCase) {
    throw new Error(`Reviewer rubric failed: ${item.id}`);
  }
  totalDuration+=actual.durationMs;
}
if(totalDuration>20*60_000)throw new Error("Plan model turns exceeded 20 minutes");
console.log(JSON.stringify({review:fixture.version,cases:seen.size,
  actualOutputs:true,hardGates:"passed",totalTurnSeconds:
    Math.round(totalDuration/1_000)}));
