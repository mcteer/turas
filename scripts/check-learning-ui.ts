import { readFile,readdir,mkdir,mkdtemp,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withLearningEnvironment } from "./learning-environment";
import { withLearningDatabase } from "../tests/fixtures/learning/environment";
import { seedLearningPublicPractice } from "../tests/fixtures/learning/setup";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { featureSourceDigest } from "./execution-source-digest";
import {capturePartnerProcess as gapNodeProcess} from "./test-partners";
import { executionUiDiscovery,verifyExecutionUiReport } from "./execution-ui-report";
export const learningUiProjects=["webkit-desktop-light","webkit-desktop-dark","webkit-mobile-light","webkit-mobile-dark"] as const;
export function verifyLearningUiFiles(actual:readonly string[],manifest:readonly string[]){if(manifest.length!==5||new Set(manifest).size!==5||JSON.stringify([...actual].sort())!==JSON.stringify([...manifest].sort()))throw Error("Learning UI requires all five journey files");}
export async function checkLearningUi(){
 const development=process.argv[2]==="--development",manifest=(JSON.parse(await readFile("scripts/learning-suites.json","utf8")) as {ui:string[]}).ui;
 if(process.argv.length!==2&&!development)throw Error("Learning UI accepts no acceptance filters");
 const files=development?process.argv.slice(3):manifest;
 if(!development)verifyLearningUiFiles((await readdir("tests/ui")).filter(f=>/^learning-.*\.spec\.ts$/.test(f)).map(f=>"tests/ui/"+f),manifest);
 if(!files.length||files.some(f=>!manifest.includes(f)))throw Error("Invalid development journeys");
 const digest=await featureSourceDigest("014");await mkdir("local-artifacts/014",{recursive:true,mode:0o700});const directory=await mkdtemp(resolve("local-artifacts/014/ui-"));let passed=0;
 await withLearningEnvironment(async environment=>{
 process.env.TURAS_014_PRICE_CONTRACT=JSON.stringify({version:"learning-price-v1",modelId:"spacexai/grok-4.7",inputMicroUsdPerMillion:"8000000",outputMicroUsdPerMillion:"24000000",providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:"https://ai-gateway.vercel.sh/v1/models",outputContractSource:"https://vercel.com/ai-gateway/models/grok-4.7",pricingCaptureDigest:"a".repeat(64),outputContractCaptureDigest:"b".repeat(64),verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
 await withLearningDatabase(async db=>{await seedLearningPublicPractice(db);await db.query("UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1",[DEMO_IDS.workspace]);});
 await environment.startProduction();process.env.TURAS_UI_BASE_URL=environment.origin;process.env.TURAS_LEARNING_UI_FIXTURE_READY="1";
  const routes=(await readdir("app",{recursive:true})).filter(f=>f.includes("learning")&&/(?:route\.ts|page\.tsx)$/.test(f));
  for(const file of routes){const path="/"+file.replace(/\([^/]+\)\//g,"").replace(/\/(?:route\.ts|page\.tsx)$/,"").replace(/\[[^/]+\]/g,"00000000-0000-4000-8000-000000000000");const response=await fetch(environment.origin+path,{redirect:"manual",signal:AbortSignal.timeout(90000)});await response.text();if(response.status>=500)throw Error("Owned learning route compilation failed");}
  for(const project of learningUiProjects){const args=["node_modules/@playwright/test/cli.js","test",...files,"--project="+project,"--reporter=json","--forbid-only","--retries=0"];
   const discovery=await gapNodeProcess([...args,"--list"],60000,environment.signal);if(discovery.status!==0||discovery.error)throw Error("Learning UI discovery failed");const cases=executionUiDiscovery(JSON.parse(discovery.stdout),files,project);
   const run=await gapNodeProcess([...args,"--output="+resolve(directory,project)],600000,environment.signal);await writeFile(resolve(directory,project+".json"),run.stdout,{mode:0o600});await writeFile(resolve(directory,project+".log"),run.stderr,{mode:0o600});
   if(run.status!==0||run.error){
    // Never echo assertion messages, DOM snapshots, request bodies or prose.
    const locations:Array<{file:string;line:number;column:number;status:string;signatures:string[]}>=[];
    try{const report=JSON.parse(run.stdout);const visit=(suite:{suites?:unknown[];specs?:Array<{tests?:Array<{results?:Array<{status:string;error?:{message?:string;stack?:string}}>}>}>})=>{for(const spec of suite.specs??[])for(const test of spec.tests??[])for(const result of test.results??[])if(!["passed","skipped"].includes(result.status)){const error=result.error,match=error?.stack?.match(/tests\/ui\/(learning-[a-z-]+\.spec\.ts):(\d+):(\d+)/),message=error?.message??"";locations.push({file:match?.[1]??"unknown",line:Number(match?.[2]??0),column:Number(match?.[3]??0),status:["failed","timedOut","interrupted"].includes(result.status)?result.status:"unknown",signatures:["Timeout","toBeFocused","toBeVisible","toEqual","ECONNREFUSED","Execution context was destroyed","Fast Refresh","503","429"].filter(signature=>message.includes(signature))});}for(const child of suite.suites??[])visit(child as Parameters<typeof visit>[0]);};for(const suite of report.suites??[])visit(suite);}catch{}
    console.error(JSON.stringify({project,failedLocations:locations.slice(0,20),processFailure:Boolean(run.error)}));throw Error("Learning UI failed: "+project);
   }passed+=verifyExecutionUiReport(JSON.parse(run.stdout),cases).expected;console.log(JSON.stringify({project,passed:cases.length,skipped:0}));}
 },{deadlineMs:2580000});
 if(await featureSourceDigest("014")!==digest)throw Error("Learning UI source changed");const summary={sourceDigest:digest,journeys:files.length,projects:4,passed,failed:0,skipped:0,acceptance:!development};await writeFile(resolve(directory,"summary.json"),JSON.stringify(summary),{mode:0o600});console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkLearningUi().catch(error=>{console.error(error instanceof Error?error.message:"Learning UI failed");process.exitCode=1;});
