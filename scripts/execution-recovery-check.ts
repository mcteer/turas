import {spawnSync} from "node:child_process";
import {openSync,closeSync} from "node:fs";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {withExecutionEvalEnvironment} from "./execution-eval-environment";
import {executionSourceDigest} from "./execution-source-digest";
import {verifyExecutionTestReport} from "./test-execution";
import {assertDeterministicTestMode} from "../tests/fixtures/runtime";
if(process.argv.length!==3||process.argv[2]!=="--disposable")throw new Error("Owned recovery requires --disposable and takes no overrides");
assertDeterministicTestMode();
// The full deterministic gate separately discovers native and lifecycle suites.
// This gate exercises every case of the actual matched-restore drill.
const suites=["tests/integration/execution-recovery.test.ts"];
await mkdir("local-artifacts/008",{recursive:true,mode:0o700});const directory=await mkdtemp(resolve("local-artifacts/008/recovery-")),sourceDigest=await executionSourceDigest();
await writeFile(resolve(directory,"source.json"),JSON.stringify({sourceDigest,startedAt:new Date().toISOString()}),{flag:"wx",mode:0o600});
const reports:unknown[]=[];
try{
  for(const [index,suite] of suites.entries())await withExecutionEvalEnvironment(async()=>{
    const report=resolve(directory,`suite-${index}.json`),fd=openSync(resolve(directory,`suite-${index}.log`),"wx",0o600);
    closeSync(openSync(report,"wx",0o600));
    let result;try{result=spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run",suite,"--reporter=verbose","--reporter=json",`--outputFile.json=${report}`,"--testTimeout=300000","--hookTimeout=120000","--silent=true"],{env:{...process.env},stdio:["ignore",fd,fd],timeout:1_200_000});}finally{closeSync(fd);}
    if(result.error||result.status!==0)throw new Error("Owned recovery suite failed");
    reports.push(verifyExecutionTestReport(JSON.parse(await readFile(report,"utf8")),[suite]));
  });
  if(await executionSourceDigest()!==sourceDigest)throw new Error("Recovery source changed");
  const passed=reports.reduce<number>((sum,r)=>sum+(r as {passed:number}).passed,0);
  if(passed!==2)throw new Error("Recovery requires both complete matched-restore cases");
  const evidence={gate:"owned-execution-recovery",sourceDigest,suites:suites.length,passed,failed:0,skipped:0,matchedRestore:true,hostedProof:false};
  await writeFile(resolve(directory,"completed.json"),JSON.stringify(evidence,null,2),{flag:"wx",mode:0o600});console.log(JSON.stringify(evidence));
}catch{console.error("Execution recovery failed; inspect private owned reports");process.exitCode=1;}
