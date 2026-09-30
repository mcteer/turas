import { spawnSync } from "node:child_process";
import { mkdir,writeFile } from "node:fs/promises";
import { withPlanEvalEnvironment } from "./plan-eval-environment";

const specs=["tests/ui/plans-authoring.spec.ts","tests/ui/plans-review.spec.ts",
  "tests/ui/plans-drafting.spec.ts","tests/ui/plans-revisions.spec.ts",
  "tests/ui/plans-sources.spec.ts","tests/ui/plans-trusted-context.spec.ts"];
const projects=["webkit-desktop-light","webkit-desktop-dark",
  "webkit-mobile-light","webkit-mobile-dark"];
const filter=process.argv.slice(2);
if (filter.length>2 || (filter[0] && !projects.includes(filter[0])) ||
    (filter[1] && !specs.includes(`tests/ui/${filter[1]}.spec.ts`))) {
  throw new Error("Only a named WebKit project and known spec filter are supported");
}
const selectedSpecs=filter[1] ? [`tests/ui/${filter[1]}.spec.ts`]:specs;
await mkdir("local-artifacts/006",{recursive:true,mode:0o700});
await withPlanEvalEnvironment(async(environment)=>{
  await environment.start();
  try {
    const result=spawnSync(process.execPath,
      ["node_modules/@playwright/test/cli.js","test",...selectedSpecs,
        ...(filter[0] ? [`--project=${filter[0]}`]:[])],{
        env:{...process.env,TURAS_UI_BASE_URL:environment.origin,
          TURAS_PLAN_FIXTURE_READY:"1",CI:""},encoding:"utf8",
        timeout:900_000,maxBuffer:5_000_000});
    await writeFile("local-artifacts/006/ui-check.log",
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,{mode:0o600});
    if (process.env.TURAS_PLAN_DIAGNOSTICS==="1") {
      await writeFile("local-artifacts/006/ui-diagnostics.log",
        `${environment.diagnosticLines().join("\n")}\n`,{mode:0o600});
    }
    console.log(JSON.stringify({projects:filter[0] ? 1:4,
      specFiles:selectedSpecs.length,exitCode:result.status,
      logPath:"local-artifacts/006/ui-check.log"}));
    if (result.error || result.status!==0) process.exitCode=1;
  } finally {await environment.stop();}
});
