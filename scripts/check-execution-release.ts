import {spawnSync} from "node:child_process";
import {openSync,closeSync} from "node:fs";
import {mkdir,mkdtemp,writeFile,readFile,lstat,realpath} from "node:fs/promises";
import {resolve,join} from "node:path";
import {z} from "zod";
import {executionSourceDigest} from "./execution-source-digest";
import {EXECUTION_RELEASE_GATES,executionPreflightSchema,executionArtifactDigest as digest,readPrivateExecutionArtifact,verifyExecutionPreflight} from "./verify-execution-review";
import {verifyExecutionSuiteCoverage} from "./test-execution";
const resume=process.argv.length===3&&process.argv[2]==="--resume";
if(!resume&&process.argv.length!==2)throw new Error("Execution release check takes only --resume; no gate or command overrides");
const sourceDigest=await executionSourceDigest(),pointer=resolve("local-artifacts/008/release-in-progress.json");
const environment:NodeJS.ProcessEnv={...process.env,TURAS_ALLOW_LIVE_MODEL_TESTS:"0",NODE_ENV:"test"};
for(const key of Object.keys(environment))if(/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|OIDC_TOKEN)$/.test(key))environment[key]="";
for(const key of ["AI_GATEWAY_API_KEY","OPENAI_API_KEY","ANTHROPIC_API_KEY","XAI_API_KEY","CONTEXT_API_KEY"])environment[key]="";
const partial=executionPreflightSchema.extend({gates:z.array(executionPreflightSchema.shape.gates.element).max(10),directory:z.string()});
await mkdir("local-artifacts/008",{recursive:true,mode:0o700});
const prior=resume?partial.parse(JSON.parse(readPrivateExecutionArtifact(pointer).toString())):null;
if(prior&&(prior.sourceDigest!==sourceDigest||prior.gates.some((g,i)=>g.name!==EXECUTION_RELEASE_GATES[i]||g.sourceDigest!==sourceDigest||digest(readPrivateExecutionArtifact(g.evidencePath))!==g.evidenceDigest)))throw new Error("Recorded release gates changed; a new full preflight is required");
const directory=prior?.directory??await mkdtemp(resolve("local-artifacts/008/release-")),startedAt=prior?.startedAt??new Date().toISOString(),gates=prior?.gates??[];
const privateRoot=await realpath(resolve("local-artifacts/008")),directoryStat=await lstat(directory);
if(await realpath(directory)!==resolve(directory)||!resolve(directory).startsWith(privateRoot+"/release-")||!/^release-[A-Za-z0-9]+$/.test(directory.split("/").at(-1)!)||!directoryStat.isDirectory()||directoryStat.isSymbolicLink()||(directoryStat.mode&0o077)!==0)throw new Error("Owned release evidence directory required");
const commands:Record<typeof EXECUTION_RELEASE_GATES[number],string[][]>={
  deterministic:[[process.execPath,"--import","tsx","scripts/test-execution.ts"]],
  regressions:[[process.execPath,"--import","tsx","scripts/test-execution-regressions.ts"]],
  webkit:[[process.execPath,"--import","tsx","scripts/check-execution-ui.ts"]],
  benchmark:[[process.execPath,"--import","tsx","scripts/benchmark-execution.ts","--disposable"]],
  recovery:[[process.execPath,"--import","tsx","scripts/execution-recovery-check.ts","--disposable"]],
  typecheck:[[process.execPath,"node_modules/typescript/bin/tsc"],[process.execPath,"node_modules/typescript/bin/tsc","-p","tsconfig.execution.json"]],
  "eve-build":[["npm","run","build:eve:check"]],"web-build":[["npm","run","build:web:check"]],docs:[["npm","run","check:docs"]],diff:[["git","diff","--check"]],
};
let active="preflight";
try{
  for(const name of EXECUTION_RELEASE_GATES.slice(gates.length)){
    active=name;if(await executionSourceDigest()!==sourceDigest)throw new Error("Release source changed");
    const path=join(directory,`${name}-${Date.now()}.log`),fd=openSync(path,"wx",0o600);
    console.log(JSON.stringify({gate:"execution-release",phase:name,state:"started",sourceDigest}));
    try{for(const [command,...args] of commands[name]){const result=spawnSync(command,args,{env:{...environment,NODE_ENV:name.endsWith("build")?"production":"test"},stdio:["ignore",fd,fd],timeout:5_400_000});if(result.error||result.status!==0)throw new Error("Release child failed");}}finally{closeSync(fd);}
    const bytes=await readFile(path),rows=bytes.toString().split("\n").flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const count=verifyExecutionSuiteCoverage().length;
    if(name==="deterministic"&&!rows.some(r=>r.gate==="owned-execution"&&r.sourceDigest===sourceDigest&&r.suites===count&&r.failed===0&&r.skipped===0&&r.passed>=count))throw new Error("Incomplete deterministic gate");
    if(name==="regressions"&&!rows.some(r=>r.gate==="owned-execution-regressions"&&r.sourceDigest===sourceDigest))throw new Error("Incomplete regression gate");
    if(name==="webkit"&&!rows.some(r=>r.gate==="complete-execution"&&r.projects===4&&r.suites===5&&r.counts.expected>0&&!r.counts.unexpected&&!r.counts.skipped&&!r.counts.flaky))throw new Error("Incomplete WebKit gate");
    if(name==="benchmark"&&!rows.some(r=>r.gate==="owned-execution-benchmark"&&r.sourceDigest===sourceDigest&&r.results?.length===8&&r.correctnessFailures===0))throw new Error("Incomplete benchmark gate");
    if(name==="recovery"&&!rows.some(r=>r.gate==="owned-execution-recovery"&&r.sourceDigest===sourceDigest&&r.passed===2&&r.matchedRestore))throw new Error("Incomplete recovery gate");
    if(await executionSourceDigest()!==sourceDigest)throw new Error("Release source changed during gate");
    gates.push({name,state:"passed",sourceDigest,evidencePath:path,evidenceDigest:digest(bytes)});
    await writeFile(pointer,JSON.stringify({version:"execution-release-v1",sourceDigest,startedAt,finishedAt:new Date().toISOString(),paidDispatches:0,providerKeysStripped:true,directory,gates},null,2),{mode:0o600});
    console.log(JSON.stringify({gate:"execution-release",phase:name,state:"passed"}));
  }
  const complete={version:"execution-release-v1",sourceDigest,startedAt,finishedAt:new Date().toISOString(),paidDispatches:0,providerKeysStripped:true,gates};
  verifyExecutionPreflight(complete,sourceDigest,readPrivateExecutionArtifact);
  await writeFile(join(directory,"completed.json"),JSON.stringify(complete,null,2),{flag:"wx",mode:0o600});
  await writeFile(resolve("local-artifacts/008/release-preflight.json"),JSON.stringify(complete,null,2),{mode:0o600});
  console.log(JSON.stringify({gate:"execution-release",state:"passed",sourceDigest,gates:gates.length,paidDispatches:0}));
}catch{console.error(JSON.stringify({gate:"execution-release",phase:active,state:"failed",paidDispatches:0}));process.exitCode=1;}
