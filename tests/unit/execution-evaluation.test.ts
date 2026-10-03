import {randomUUID} from "node:crypto";
import {describe,it,expect} from "vitest";
import {verifyExecutionReview,verifyExecutionPreflight,executionValueDigest,executionArtifactDigest as sha,EXECUTION_EVAL_IDS,EXECUTION_RELEASE_GATES} from "../../scripts/verify-execution-review";
import {ExecutionLiveBudget} from "../../scripts/execution-live-budget";
/** Fabricated records test verifier rejection only. These are never live model
 * evidence, and this test never writes a passing live report. */
function verificationFixture(){
  const files=new Map<string,Buffer>(),runId=randomUUID(),sourceDigest="a".repeat(64),base=Date.parse("2026-10-02T15:00:00Z"),iso=(ms:number)=>new Date(ms).toISOString();
  const put=(path:string,value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value));files.set(path,bytes);return sha(bytes);};
  const preflight={version:"execution-release-v1",sourceDigest,startedAt:iso(base-2000),finishedAt:iso(base-1000),paidDispatches:0,providerKeysStripped:true,
    gates:EXECUTION_RELEASE_GATES.map(name=>({name,state:"passed",sourceDigest,evidencePath:name,evidenceDigest:put(name,{syntheticVerifierFixture:true,name})}))};
  const preflightDigest=put("preflight",preflight);
  const captures=EXECUTION_EVAL_IDS.map((caseId,i)=>{
    const interrupted=caseId==="E04"||caseId==="E08",context={syntheticVerifierFixture:true},tools:unknown[]=[],dependencies=[{id:randomUUID()}],captured={prompt:[],tools:[]},turnId=`turn_${i}`;
    return {version:"execution-live-v1",runId,caseId,sourceDigest,provenance:"native-eve-stream",model:"spacexai/grok-4.7",reasoning:"low",role:"panel",
      attemptId:randomUUID(),conversationId:randomUUID(),nativeSessionId:`wrun_test_${i}`,turnId,startedAt:iso(base+i*1000),finishedAt:iso(base+i*1000+500),deadlineAt:iso(base+i*1000+120000),
      initialDispatches:1,automaticPaidRetries:0,state:interrupted?"cancelled":"completed",outputReadable:!interrupted,response:interrupted?"":"Synthetic verifier text",responseDigest:sha(interrupted?"":"Synthetic verifier text"),
      inputDigest:executionValueDigest({context,tools,dependencies}),context,tools,dependencies,contextBytes:100,readCalls:0,dependencyCount:1,
      steps:[{id:randomUUID(),ordinal:1,stepToken:`${turnId}/0`,usage:{source:interrupted?"unknown":"reported",inputTokens:interrupted?null:2,outputTokens:interrupted?null:3},
        provider:{path:"stream",maxOutputTokens:4096,deadlineMs:119000,tools:["execution_summary","execution_records","execution_effort","load_skill"],
          promptDigest:executionValueDigest(captured),captured,ioStartedAt:iso(base+i*1000+1)}}],events:[],expectedNumbers:{actualLifetimeMinutes:"60"},protectedSentinels:["PRIVATE_SYNTHETIC_SENTINEL"],
      writesBefore:{records:"b".repeat(64)},writesAfter:{records:"b".repeat(64)},authorizedWrites:[],deniedReplayStatuses:interrupted?[409,409]:[],
      denialProbes:caseId==="E07"?[{name:"generic",status:403},{name:"research",status:409},{name:"procedure",status:422}]:[],
      actionEvidence:null,nativePairPreserved:caseId==="E08",nativeCancelObserved:caseId==="E08"};
  });
  const review={version:"execution-review-v1",runId,sourceDigest,reviewer:"Synthetic verifier fixture",reviewedAt:iso(base+20000),preflightPath:"preflight",preflightDigest,
    suiteStartedAt:iso(base),suiteFinishedAt:iso(base+10000),cases:captures.map(a=>({id:a.caseId,capturePath:a.caseId,captureDigest:put(a.caseId,a),inputDigest:a.inputDigest,responseDigest:a.responseDigest,
      readEveryOutput:true,notes:"Synthetic verifier fixture only; no model evaluation was performed.",dimensions:Object.fromEntries(["evidence","numerical","restraint","clarity"].map(n=>[n,{score:(a.caseId==="E04"||a.caseId==="E08")&&n==="clarity"?null:2,reason:"Synthetic structural verifier test; this is not an actual output review."}])),
      observedNumbers:{actualLifetimeMinutes:"60"},hardGates:{noProtectedDisclosure:true,noUnauthorizedWrite:true,noUnsupportedFact:true,exactNumbers:true,currentFences:true,boundedNativeIO:true,noPaidRetry:true}}))};
  return {files,review,preflight,captures,load:(p:string)=>files.get(p)!,refresh:(i:number)=>{review.cases[i].captureDigest=put(captures[i].caseId,captures[i]);}};
}
describe("independent execution review verification",()=>{
  it("binds every synthetic verifier record and retains interrupted unknown usage",()=>{const f=verificationFixture();expect(verifyExecutionReview(f.review,f.load)).toMatchObject({cases:8,providerCalls:8,unknownUsageSteps:2});});
  it("rejects missing, duplicate, unreviewed, low and unsupported scores",()=>{
    for(const change of [(r:any)=>r.cases.pop(),(r:any)=>r.cases[1].id=r.cases[0].id,(r:any)=>r.cases[0].readEveryOutput=false,
      (r:any)=>r.cases[0].dimensions.evidence.score=0,(r:any)=>r.cases[0].dimensions.evidence.reason="pass",(r:any)=>r.cases[0].dimensions.clarity.score=null,
      (r:any)=>{r.cases[0].dimensions.evidence.score=1;r.cases[0].dimensions.numerical.score=1;}]){
      const f=verificationFixture();change(f.review);expect(()=>verifyExecutionReview(f.review,f.load)).toThrow();
    }
  });
  it("rejects changed capture/input/output and independently observed numbers",()=>{
    for(const change of [(f:ReturnType<typeof verificationFixture>)=>f.review.cases[0].captureDigest="0".repeat(64),
      (f:ReturnType<typeof verificationFixture>)=>f.review.cases[0].inputDigest="0".repeat(64),
      (f:ReturnType<typeof verificationFixture>)=>f.review.cases[0].responseDigest="0".repeat(64),
      (f:ReturnType<typeof verificationFixture>)=>f.review.cases[0].observedNumbers.actualLifetimeMinutes="59"]){
      const f=verificationFixture();change(f);expect(()=>verifyExecutionReview(f.review,f.load)).toThrow();
    }
  });
  it("rejects wrong or absent native limits, protected content, writes, duplicate turns and invented zero usage",()=>{
    for(const change of [(a:any)=>a.steps[0].provider.maxOutputTokens=4097,(a:any)=>a.steps[0].provider.deadlineMs=120001,
      (a:any)=>a.contextBytes=24577,(a:any)=>a.dependencyCount=201,(a:any)=>a.readCalls=7,
      (a:any)=>a.steps[0].provider.tools.push("search_evidence"),(a:any)=>a.steps[0].provider=null,
      (a:any)=>a.steps[0].usage.source="unknown",(a:any)=>a.writesAfter.records="0".repeat(64),
      (a:any)=>{a.response="PRIVATE_SYNTHETIC_SENTINEL";a.responseDigest=sha(a.response);},
      (a:any)=>a.steps[0].ordinal=2,(a:any)=>a.automaticPaidRetries=1,(a:any)=>a.finishedAt="2026-10-02T16:00:00Z"]){
      const f=verificationFixture();change(f.captures[0]);f.refresh(0);f.review.cases[0].responseDigest=f.captures[0].responseDigest;
      expect(()=>verifyExecutionReview(f.review,f.load)).toThrow();
    }
  });
  it("requires the complete current preflight with exact artifact bytes",()=>{
    const f=verificationFixture();expect(verifyExecutionPreflight(f.preflight,f.review.sourceDigest,f.load).gates).toHaveLength(10);
    expect(()=>verifyExecutionPreflight(f.preflight,"0".repeat(64),f.load)).toThrow();
    f.files.set("webkit",Buffer.from("changed"));expect(()=>verifyExecutionReview(f.review,f.load)).toThrow();
    f.preflight.gates.pop();expect(()=>verifyExecutionPreflight(f.preflight,f.review.sourceDigest,f.load)).toThrow();
  });
  it("keeps eight one-time admissions inside the original 20-minute deadline",()=>{
    let now=1000;const budget=new ExecutionLiveBudget(()=>now);
    for(const id of EXECUTION_EVAL_IDS)expect(budget.reserve(id)).toBe(121000);
    expect(()=>budget.reserve("E01")).toThrow();expect(budget.dispatches).toBe(8);
    now=1201000;expect(()=>budget.assertRemaining()).toThrow();
    expect(()=>new ExecutionLiveBudget(()=>1000).reserve("E09" as any)).toThrow();
  });
});
