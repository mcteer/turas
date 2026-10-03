import {performance} from "node:perf_hooks";
import {mkdir,mkdtemp,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {withExecutionEvalEnvironment} from "./execution-eval-environment";
import {executionSourceDigest} from "./execution-source-digest";
import {assertDeterministicTestMode} from "../tests/fixtures/runtime";
import {seedExecutionBenchmark,executionBenchmarkShape as shape} from "../tests/fixtures/execution/benchmark";
import {readExecutionOverview,readExecutionRecords,previewExecutionCommand,submitExecutionCommand} from "../lib/server/execution/service";
import {readExecutionTime} from "../lib/server/execution/time";
import {readExecutionSummary,readExecutionUtilization} from "../lib/server/execution/summary";
import {readExecutionReceipt} from "../lib/server/execution/commands";
import {closeRuntimePool,getRuntimePool,query} from "../lib/server/db/client";
import {installPoolQueryCounter} from "../lib/server/db/query-counts";
function check(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
async function nextWindow(){const wait=60050-Date.now()%60000;console.log(JSON.stringify({gate:"owned-execution-benchmark",phase:"waiting-for-production-rate-window",milliseconds:wait}));await new Promise(resolve=>setTimeout(resolve,wait));}

if(process.argv.length!==3||process.argv[2]!=="--disposable")throw new Error("Execution benchmark requires --disposable and takes no corpus overrides");
assertDeterministicTestMode();
await mkdir("local-artifacts/008",{recursive:true,mode:0o700});const directory=await mkdtemp(resolve("local-artifacts/008/benchmark-")),sourceDigest=await executionSourceDigest();
await writeFile(resolve(directory,"source.json"),JSON.stringify({sourceDigest,startedAt:new Date().toISOString()}),{flag:"wx",mode:0o600});
try{
  await withExecutionEvalEnvironment(async()=>{
    const f=await seedExecutionBenchmark();
    const keys=["DATABASE_URL","DATABASE_URL_UNPOOLED","TURAS_TEST_DATABASE_URL"] as const,old=keys.map(k=>process.env[k]);
    const runtime=new URL(process.env.DATABASE_URL!);runtime.searchParams.set("options","-c role=turas_runtime");for(const k of keys)process.env[k]=runtime.toString();await closeRuntimePool();
    const counter=installPoolQueryCounter(getRuntimePool()),results:unknown[]=[];
    async function measure<T>(name:string,call:(index:number,client:number,prepared:T)=>Promise<void>,prepare?:((index:number,client:number)=>Promise<T>)){
      const durations:number[]=[],queries:number[]=[],errors:Record<string,number>={};let warmupFailures=0;
      const invoke=async(index:number,client:number,measured:boolean)=>{
        const prepared=await prepare?.(index,client);const started=performance.now(),r=await counter.observe(()=>call(index,client,prepared as T));
        const elapsed=performance.now()-started;if(measured){durations.push(elapsed);queries.push(r.queries);}
        if(!r.ok){const code=r.error&&typeof r.error==="object"&&"code"in r.error&&typeof r.error.code==="string"&&/^[a-z_]{1,60}$/.test(r.error.code)?r.error.code:"correctness_failure";errors[code]=(errors[code]??0)+1;if(!measured){warmupFailures++;throw r.error;}}
      };
      for(let i=0;i<shape.warmups;i++)await invoke(i,i%shape.clients,false);
      await Promise.all(Array.from({length:shape.clients},async(_,client)=>{
        for(let index=shape.warmups+client;index<shape.warmups+shape.samples;index+=shape.clients)await invoke(index,client,true);
      }));
      const value={name,warmups:shape.warmups,samples:durations.length,concurrency:shape.clients,warmupFailures,failures:Object.values(errors).reduce((a,b)=>a+b,0)-warmupFailures,errors,
        p50:percentile(durations,.5),p95:percentile(durations,.95),p99:percentile(durations,.99),queryCounts:{minimum:Math.min(...queries),maximum:Math.max(...queries),total:queries.reduce((a,b)=>a+b,0)}};
      results.push(value);await writeFile(resolve(directory,`${name}.json`),JSON.stringify(value,null,2),{flag:"wx",mode:0o600});
      console.log(JSON.stringify({gate:"owned-execution-benchmark-class",...value}));
      check(!Object.keys(errors).length&&durations.length===shape.samples&&value.p95<=2000,"Execution benchmark class failed");
    }
    try{
      const selected=(i:number,c:number)=>({e:f.engagements[i*5+c],user:f.users[c]});
      await nextWindow();
      await measure("overview",async(i,c)=>{const {e,user}=selected(i,c),v=await readExecutionOverview(user,e.engagementId);check(v.engagementId===e.engagementId&&v.baselineId===e.baselineId&&v.initialized&&!v.reviewRequired&&v.milestones.length===2,"Incorrect complete overview");});
      await measure("records-page",async(i,c)=>{const {e,user}=selected(i,c),v=await readExecutionRecords(user,e.engagementId,{limit:10});check(v.records.length===10&&!!v.nextCursor&&v.records.every(r=>r.content&&!r.reviewRequired),"Incomplete record page");});
      await measure("own-time-page",async(i,c)=>{const {e,user}=selected(i,c),v=await readExecutionTime(user,e.engagementId,{...f.period,limit:20});check(v.entries.length===20&&!!v.nextCursor&&v.entries.every(r=>r.authorMembershipId===user.membershipId&&!r.reviewRequired&&r.note==="PRIVATE_BENCHMARK_TIME_NOTE"),"Incomplete own-time page");});
      // Four contributor read classes use exactly 22 calls per user each (88
      // maximum in a real minute). Privileged classes get fresh real windows.
      await measure("summary",async(i,c)=>{const {e,user}=selected(i,c),v=await readExecutionSummary(user,e.engagementId,f.period);check(v.effort.actualLifetimeMinutes==="5"&&v.effort.actualPeriodMinutes==="5"&&v.effort.forecastMinutes===null&&!v.reviewRequired&&!!v.receipt.id&&!JSON.stringify(v).includes("PRIVATE_BENCHMARK_TIME_NOTE"),"Incorrect governed effort summary");});
      await nextWindow();
      await measure("review-queue",async(i,c)=>{const {e}=selected(i,c),v=await readExecutionRecords(f.reviewer,e.engagementId,{limit:20},true);check(v.records.length===15&&v.nextCursor===null&&v.records.every(r=>r.state==="submitted"&&r.canReview),"Incomplete review queue");});
      await nextWindow();
      await measure("utilization",async(i)=>{const ids=Array.from({length:50},(_,j)=>f.resources[(i*7+j)%500]),v=await readExecutionUtilization(f.reviewer,{...f.period,resourceIds:ids});check(v.resources.length===50&&v.resources.every(r=>r.actualBillableMinutes==="10"&&r.availableMinutes==="480"&&r.percentage==="2.08")&&v.total.actualBillableMinutes==="500"&&v.total.availableMinutes==="24000"&&v.total.percentage==="2.08","Incomplete utilization result");});
      await measure("command-receipt",async(i,c)=>{const r=f.receipts[i*5+c],v=await readExecutionReceipt(r.actor,r.key);check(v.requestKey===r.key&&v.state==="committed"&&v.changed[0].id===r.engagementId,"Incorrect command receipt");});
      await nextWindow();
      let slots=0,windowPromise:Promise<void>=Promise.resolve();
      const reserve=()=>{const current=windowPromise.then(async()=>{if(slots===20){await nextWindow();slots=0;}slots++;});windowPromise=current;return current;};
      await measure("time-review-acknowledgement",async(_i,_c,p:{engagementId:string;entryId:string;command:unknown})=>{
        const v=await submitExecutionCommand(f.reviewer,p.engagementId,p.command);check(v.state==="committed"&&v.changed.length===2&&v.changed[1].version===2&&v.executionGeneration===2&&v.changed[0].id===p.entryId&&v.changed[0].version===3,"New time approval acknowledgement incorrect");
      },async i=>{
        await reserve();const entry=f.candidates[i];
        const candidate={version:"execution-v1",action:"time.approve",expectedVersions:{execution:1},payload:{entries:[{entryId:entry.entryId,revisionId:entry.revisionId,contentDigest:entry.contentDigest,version:2,exceptions:{on_behalf:"Human confirms synthetic historical subject",unplanned:"Human confirms unbooked synthetic work"}}]}};
        const preview=await previewExecutionCommand(f.reviewer,entry.engagementId,candidate);
        return {engagementId:entry.engagementId,entryId:entry.entryId,command:{...candidate,previewDigest:preview.previewDigest,previewExpiresAt:preview.previewExpiresAt,requestKey:randomUUID(),rationale:"Human confirms exact synthetic measured approval"}};
      });
      const verified=(await query("SELECT (SELECT count(*)::int FROM execution_time_decisions WHERE action='approve') AS approvals,(SELECT sum(minutes)::int FROM execution_actual_days) AS actuals")).rows[0];
      check(verified.approvals===5110&&verified.actuals===5110,"Measured new approvals did not each commit exactly once");
      if(await executionSourceDigest()!==sourceDigest)throw new Error("Benchmark source changed");
      const evidence={gate:"owned-execution-benchmark",sourceDigest,dataset:shape,distinctUsers:5,privilegedClientIdentity:"mcteer only, five concurrent clients",productionRatesPreserved:true,pacingExcludedFromRequestLatency:true,results,correctnessFailures:0,hostedProof:false};
      await writeFile(resolve(directory,"completed.json"),JSON.stringify(evidence,null,2),{flag:"wx",mode:0o600});console.log(JSON.stringify(evidence));
    }finally{counter.restore();await closeRuntimePool();keys.forEach((k,i)=>{process.env[k]=old[i];});}
  });
}catch(error){await writeFile(resolve(directory,"failure.json"),JSON.stringify(error instanceof Error?{name:error.name,message:error.message,stack:error.stack,...("constraint" in error?{constraint:error.constraint}:{})}:{failed:true},null,2),{flag:"wx",mode:0o600});const code=error&&typeof error==="object"&&"code"in error&&typeof error.code==="string"&&/^[a-z0-9_]{1,60}$/i.test(error.code)?error.code:"gate_failed";console.error(JSON.stringify({gate:"owned-execution-benchmark",code}));process.exitCode=1;}
