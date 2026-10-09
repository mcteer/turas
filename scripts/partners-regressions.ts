import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {withPartnerEnvironment} from "./partners-environment";
import {withPlanEvalEnvironment} from "./plan-eval-environment";
import {withExecutionEvalEnvironment} from "./execution-eval-environment";
import {withSupportEvalEnvironment} from "./support-eval-environment";
import {withReportsLocalEnvironment} from "./reports-local-environment";
import {featureSourceDigest} from "./execution-source-digest";
import {verifyPartnerTestReport,runPartnerProcess} from "./test-partners";
import {capturePartnerProcess as gapNodeProcess} from "./test-partners";
import {executionUiDiscovery,verifyExecutionUiReport} from "./execution-ui-report";
import {partnerUiProjects} from "./partners-ui-check";
import {withPartnerDatabase} from "../tests/fixtures/partners/environment";
import {partnerTestActors} from "../tests/fixtures/partners/seed";
const required=["tests/integration/grant-concurrency.test.ts","tests/integration/profile-partner-access.test.ts","tests/integration/retrieval-fences.test.ts","tests/integration/knowledge-publication.test.ts","tests/integration/plan-authoring.test.ts","tests/integration/plan-acceptance.test.ts","tests/contracts/execution-policy.test.ts","tests/contracts/execution-time-api.test.ts","tests/integration/support-policy.test.ts","tests/contracts/conversations.test.ts","tests/integration/conversation-delivery.test.ts","tests/ui/profile-partner.spec.ts","tests/ui/conversation-archive.spec.ts"];
async function main(){
 if(process.argv.length!==2)throw Error("Partner regressions accept no overrides");const manifest=JSON.parse(await readFile("scripts/partners-regression-suites.json","utf8")) as string[];if(JSON.stringify([...manifest].sort())!==JSON.stringify([...required].sort()))throw Error("Exact partner regression manifest required");for(const file of manifest)await readFile(file);
 const sourceDigest=await featureSourceDigest("013");await mkdir("local-artifacts/013",{recursive:true,mode:0o700});const directory=await mkdtemp(resolve("local-artifacts/013/regressions-")),results:unknown[]=[];let ownerSignal:AbortSignal;
 async function cohort(name:string,files:string[]){const report=join(directory,name+".json");await runPartnerProcess(["node_modules/vitest/vitest.mjs","run",...files,"--reporter=json","--outputFile="+report,"--testTimeout=120000","--hookTimeout=120000"],{timeoutMs:360000,signal:ownerSignal,env:{...process.env,TURAS_APP_ORIGIN:name==="conversation-delivery"?"http://127.0.0.1:3000":process.env.TURAS_APP_ORIGIN,TURAS_PARTNERS_OWNED:"0",TURAS_GAPS_REGRESSION_KIND:name.startsWith("execution")?"execution":name==="support"?"support":""}});const passed=verifyPartnerTestReport(JSON.parse(await readFile(report,"utf8")),files);results.push({name,files,passed,failed:0,skipped:0});console.log(JSON.stringify({name,passed,failed:0,skipped:0}));}
 await withPartnerEnvironment(async environment=>{ownerSignal=environment.signal;
  const test=new URL(process.env.DATABASE_URL_UNPOOLED!);test.searchParams.set("application_name","partner-regressions");process.env.TURAS_TEST_DATABASE_URL=test.toString();
  for(const file of manifest.filter(f=>!f.includes("/plan-")&&!f.includes("/execution-")&&!f.includes("/support-")&&!f.endsWith(".spec.ts")))await cohort(file.split("/").at(-1)!.replace(".test.ts",""),[file]);
  await withReportsLocalEnvironment(async()=>{
   await withPlanEvalEnvironment(()=>cohort("plans",manifest.filter(f=>f.includes("/plan-"))));
   for(const [index,file] of manifest.filter(f=>f.includes("/execution-")).entries())await withExecutionEvalEnvironment(()=>cohort("execution-"+index,[file]));
   await withSupportEvalEnvironment(()=>cohort("support",manifest.filter(f=>f.includes("/support-"))));
  });
  await environment.startProduction();process.env.TURAS_UI_BASE_URL=environment.origin;process.env.TURAS_PARTNERS_UI_FIXTURE_READY="1";const warm=await withPartnerDatabase(partnerTestActors);for(const path of ["/login","/s","/customers/00000000-0000-4000-8000-000000000240","/customers/00000000-0000-4000-8000-000000000241","/api/conversations","/api/customers/00000000-0000-4000-8000-000000000240/profile","/api/customers/00000000-0000-4000-8000-000000000240/submissions"]){const response=await fetch(environment.origin+path,{headers:{cookie:`turas_session=${warm.author.token}`},redirect:"manual",signal:AbortSignal.timeout(90000)});await response.text();if(response.status>=500)throw Error("Regression route compilation failed");}const files=manifest.filter(f=>f.endsWith(".spec.ts"));
  for(const project of partnerUiProjects){const args=["node_modules/@playwright/test/cli.js","test",...files,"--project="+project,"--reporter=json","--forbid-only","--retries=0"],discovery=await gapNodeProcess([...args,"--list"],60000,environment.signal);if(discovery.error||discovery.status!==0)throw Error("Regression UI discovery failed");const expected=executionUiDiscovery(JSON.parse(discovery.stdout),files,project),run=await gapNodeProcess([...args,"--output="+join(directory,project)],300000,environment.signal);await writeFile(join(directory,project+".json"),run.stdout,{mode:0o600});if(run.error||run.status!==0)throw Error("Regression UI failed: "+project);const passed=verifyExecutionUiReport(JSON.parse(run.stdout),expected).expected;results.push({name:project,files,passed,failed:0,skipped:0});}
 },{deadlineMs:1500000});if(await featureSourceDigest("013")!==sourceDigest)throw Error("Regression source changed");const summary={sourceDigest,manifest,results,hostedProof:false};await writeFile(join(directory,"completed.json"),JSON.stringify(summary),{mode:0o600});console.log(JSON.stringify(summary));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Partner regressions failed");process.exitCode=1;});
