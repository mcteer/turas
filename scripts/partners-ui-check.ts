import { readFile,readdir,mkdir,mkdtemp,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withPartnerEnvironment } from "./partners-environment";
import { featureSourceDigest } from "./execution-source-digest";
import {capturePartnerProcess as gapNodeProcess} from "./test-partners";
import { executionUiDiscovery,verifyExecutionUiReport } from "./execution-ui-report";
export const partnerUiProjects=["webkit-desktop-light","webkit-desktop-dark","webkit-mobile-light","webkit-mobile-dark"] as const;
export function verifyPartnerUiFiles(actual:readonly string[],manifest:readonly string[]){if(manifest.length!==5||new Set(manifest).size!==5||JSON.stringify([...actual].sort())!==JSON.stringify([...manifest].sort()))throw Error("Partner UI requires all five journey files");}
export async function checkPartnerUi(){
 const development=process.argv[2]==="--development",manifest=JSON.parse(await readFile("scripts/partners-ui-journeys.json","utf8")) as string[];
 if(process.argv.length!==2&&!development)throw Error("Partner UI accepts no acceptance filters");
 const files=development?process.argv.slice(3):manifest;
 if(!development)verifyPartnerUiFiles((await readdir("tests/ui")).filter(f=>/^partner-.*\.spec\.ts$/.test(f)).map(f=>"tests/ui/"+f),manifest);
 if(!files.length||files.some(f=>!manifest.includes(f)))throw Error("Invalid development journeys");
 const digest=await featureSourceDigest("013");await mkdir("local-artifacts/013",{recursive:true,mode:0o700});const directory=await mkdtemp(resolve("local-artifacts/013/ui-"));let passed=0;
 await withPartnerEnvironment(async environment=>{await environment.start();process.env.TURAS_UI_BASE_URL=environment.origin;process.env.TURAS_PARTNERS_UI_FIXTURE_READY="1";
  const routes=(await readdir("app",{recursive:true})).filter(f=>f.includes("partners")&&/(?:route\.ts|page\.tsx)$/.test(f));
  for(const file of routes){const path="/"+file.replace(/\([^/]+\)\//g,"").replace(/\/(?:route\.ts|page\.tsx)$/,"").replace(/\[[^/]+\]/g,"00000000-0000-4000-8000-000000000000");const response=await fetch(environment.origin+path,{redirect:"manual",signal:AbortSignal.timeout(90000)});await response.text();if(response.status>=500)throw Error("Owned partner route compilation failed");}
  for(const project of partnerUiProjects){const args=["node_modules/@playwright/test/cli.js","test",...files,"--project="+project,"--reporter=json","--forbid-only","--retries=0"];
   const discovery=await gapNodeProcess([...args,"--list"],60000,environment.signal);if(discovery.status!==0||discovery.error)throw Error("Partner UI discovery failed");const cases=executionUiDiscovery(JSON.parse(discovery.stdout),files,project);
   const run=await gapNodeProcess([...args,"--output="+resolve(directory,project)],600000,environment.signal);await writeFile(resolve(directory,project+".json"),run.stdout,{mode:0o600});await writeFile(resolve(directory,project+".log"),run.stderr,{mode:0o600});
   if(run.status!==0||run.error)throw Error("Partner UI failed: "+project);passed+=verifyExecutionUiReport(JSON.parse(run.stdout),cases).expected;console.log(JSON.stringify({project,passed:cases.length,skipped:0}));}
 },{deadlineMs:2580000});
 if(await featureSourceDigest("013")!==digest)throw Error("Partner UI source changed");const summary={sourceDigest:digest,journeys:files.length,projects:4,passed,failed:0,skipped:0,acceptance:!development};await writeFile(resolve(directory,"summary.json"),JSON.stringify(summary),{mode:0o600});console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkPartnerUi().catch(error=>{console.error(error instanceof Error?error.message:"Partner UI failed");process.exitCode=1;});
