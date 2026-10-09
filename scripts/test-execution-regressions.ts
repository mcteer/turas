import {spawnSync} from "node:child_process";
import {openSync,closeSync,readdirSync} from "node:fs";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {executionSourceDigest} from "./execution-source-digest";
import {verifyStaffingSuiteCoverage} from "./test-staffing";
import {assertDeterministicTestMode} from "../tests/fixtures/runtime";

if(process.argv.length!==2)throw new Error("Execution regressions take no overrides");
assertDeterministicTestMode();
const staffing=verifyStaffingSuiteCoverage();
const earlier=["unit","contracts","integration"].flatMap(group=>readdirSync(resolve("tests",group))
  .filter(name=>name.endsWith(".test.ts")&&!/^(staffing|execution|report|support|expansion|gap|partner)-/.test(name)&&name!=="runtime-restart.test.ts")
  .map(name=>`tests/${group}/${name}`));
const plans=earlier.filter(file=>file.startsWith("tests/integration/plan-"));
await mkdir("local-artifacts/008",{recursive:true,mode:0o700});
const directory=await mkdtemp(resolve("local-artifacts/008/regressions-")),sourceDigest=await executionSourceDigest();
await writeFile(resolve(directory,"source.json"),JSON.stringify({sourceDigest,startedAt:new Date().toISOString()}),{flag:"wx",mode:0o600});
const counts:Record<string,unknown>={};
try{
  // 007 assumes a prepared public scanner/OCR asset source. Provision one inside
  // this owned evidence root so absent app-store configuration cannot silently
  // create clones with no signatures, and never prepare the application store.
  const assets=resolve(directory,"runtime-assets"),assetLog=resolve(directory,"runtime-assets.log");
  await mkdir(assets,{mode:0o700});
  for(const [name,file] of [["earlier","scripts/test-staffing-regressions.ts"],["staffing","scripts/test-staffing.ts"]] as const){
    // The earlier cohort builds/attests its own images. Docker's manifest
    // identity can change on that rebuild, so prepare 007's source afterward.
    if(name==="staffing"){
      const assetFd=openSync(assetLog,"wx",0o600);
      try{
        const prepared=spawnSync(process.execPath,["--import","tsx","scripts/prepare-artifacts.ts"],{
          env:{...process.env,TURAS_ARTIFACT_STORE_ROOT:assets,TURAS_ENVIRONMENT_ID:`test-008-assets-${randomUUID()}`},
          stdio:["ignore",assetFd,assetFd],timeout:600_000});
        if(prepared.error||prepared.status!==0)throw new Error("Owned regression runtime assets unavailable");
      }finally{closeSync(assetFd);}
    }
    const log=resolve(directory,`${name}.log`),fd=openSync(log,"wx",0o600);
    let result;try{result=spawnSync(process.execPath,["--import","tsx",file],{env:{...process.env,TURAS_STAFFING_RUNTIME_ASSET_ROOT:assets},stdio:["ignore",fd,fd],timeout:3_600_000});}finally{closeSync(fd);}
    if(result.error||result.status!==0)throw new Error("Owned regression child failed");
    const lines=(await readFile(log,"utf8")).split("\n").flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const gate=name==="earlier"?"owned-002-006-deterministic-regressions":"owned-staffing";
    const finished=lines.filter(row=>row.gate===gate&&(name==="earlier"?!!row.earlier:!!row.suites));
    if(finished.length!==1)throw new Error("Regression child completion is missing or duplicated");
    const value=finished[0],groups=name==="earlier"?[
      [value.earlier,earlier.length-plans.length],[value.plans,plans.length-1],[value.drafting,1],
    ]:[[value,staffing.length]];
    for(const [row,expected] of groups)if(!row||row.suites!==expected||!Number.isSafeInteger(row.passed)||row.passed<expected||row.failed!==0||row.skipped!==0)
      throw new Error("Regression suite coverage incomplete");
    counts[name]=value;
  }
  if(await executionSourceDigest()!==sourceDigest)throw new Error("Regression source changed");
  const evidence={gate:"owned-execution-regressions",sourceDigest,counts,externalCheckpointExcluded:"tests/integration/runtime-restart.test.ts",ownedRecoveryRequired:true};
  await writeFile(resolve(directory,"completed.json"),JSON.stringify(evidence,null,2),{flag:"wx",mode:0o600});
  console.log(JSON.stringify(evidence));
}catch{console.error("Execution regression gate failed; inspect private owned reports");process.exitCode=1;}
