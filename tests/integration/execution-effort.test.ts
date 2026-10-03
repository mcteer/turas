import {it,expect} from "vitest";
import {readExecutionSummary,readExecutionUtilization} from "../../lib/server/execution/summary";
import {timeFixture,draftTime,submitTime,timeCandidate,decideTime,timeCommand} from "../fixtures/execution/time";
import {registerBase,saveRegister,submitRegister,reviewRegister} from "../fixtures/execution/registers";
import {readExecutionOverview,submitExecutionCommand} from "../../lib/server/execution/service";
import {readExecutionTime} from "../../lib/server/execution/time";
import {withTransaction} from "../../lib/server/db/client";
import {createProfileTestSession} from "../fixtures/profiles";
it("uses only reviewed effort, keeps pending corrections out, invalidates both packages after a move, and restricts utilization",async()=>{
  const f=await timeFixture({calendar:true});let time=await submitTime(f,await draftTime(f));await decideTime(f,await timeCandidate(f,[time],"time.approve",{unplanned:"Human confirms work without booking"}));
  for(const [key,budget,remaining] of [["proof",120,30],["readiness",0,0]] as const){
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...registerBase(),kind:"effort_budget",workPackageKey:key,minutes:budget})));
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...registerBase(),kind:"estimate",workPackageKey:key,minutes:remaining,asOf:new Date().toISOString(),explicitZero:remaining===0})));
  }
  let summary=await readExecutionSummary(f.author,f.engagementId,f.period);
  expect(summary.effort).toMatchObject({actualLifetimeMinutes:"60",actualPeriodMinutes:"60",remainingMinutes:"30",budgetMinutes:"120",forecastMinutes:"90",varianceMinutes:"-30",plannedPeriodMinutes:"0",tentativePeriodMinutes:"0"});
  expect(summary.receipt.inputDigest).toMatch(/^[a-f0-9]{64}$/);expect(summary.receipt.formulaVersion).toBe("execution-effort-v1");
  expect(JSON.stringify(summary)).not.toContain("PRIVATE_TIME_NOTE_SENTINEL");expect(JSON.stringify(summary)).not.toContain(f.resourceId);
  const partner=await withTransaction(db=>createProfileTestSession(db,"partner"));
  expect((await readExecutionSummary(partner,f.engagementId,f.period)).effort.actualLifetimeMinutes).toBe("60");
  for(const actor of [f.author,partner])await expect(readExecutionUtilization(actor,{resourceIds:[f.resourceId],...f.period})).rejects.toMatchObject({status:403});
  const utilization=await readExecutionUtilization(f.reviewer,{resourceIds:[f.resourceId],...f.period});
  expect(utilization.resources[0]).toMatchObject({actualBillableMinutes:"60",availableMinutes:"480",percentage:"12.50",state:"complete"});
  await expect(readExecutionUtilization(f.reviewer,{resourceIds:[f.resourceId,f.resourceId],...f.period})).rejects.toMatchObject({status:400});
  time=(await readExecutionTime(f.author,f.engagementId,f.period)).entries[0];const view=await readExecutionOverview(f.author,f.engagementId);
  await submitExecutionCommand(f.author,f.engagementId,timeCommand("time.revise",{execution:view.version,time:time.version},{entryId:time.id,time:{...f.time,minutes:45,workPackageKey:"readiness"}}));
  time=await submitTime(f,(await readExecutionTime(f.author,f.engagementId,f.period)).entries[0]);
  expect((await readExecutionSummary(f.author,f.engagementId,f.period)).effort.forecastMinutes).toBe("90");
  await decideTime(f,await timeCandidate(f,[time],"time.approve",{unplanned:"Human verifies the moved package and corrected quantity"}));
  summary=await readExecutionSummary(f.author,f.engagementId,f.period);
  expect(summary.effort).toMatchObject({actualLifetimeMinutes:"45",remainingMinutes:null,forecastMinutes:null,varianceMinutes:null});
  expect(summary.effort.missingEstimates).toEqual([{key:"proof",reason:"actuals_after_estimate"},{key:"readiness",reason:"actuals_after_estimate"}]);
  await withTransaction(async db=>expect((await db.query("SELECT work_package_key,generation::text FROM execution_actual_package_heads WHERE engagement_id=$1 ORDER BY work_package_key",[f.engagementId])).rows).toEqual([{work_package_key:"proof",generation:"2"},{work_package_key:"readiness",generation:"1"}]));
},180000);

it("keeps concurrent summary snapshots and ordinary reads in the same lock order",async()=>{
  const {registerFixture}=await import("../fixtures/execution/registers");
  const f=await registerFixture(),date=new Date().toISOString().slice(0,10);
  const results=await Promise.all(Array.from({length:10},(_,i)=>i%2?readExecutionOverview(f.reviewer,f.engagementId):readExecutionSummary(f.reviewer,f.engagementId,{from:date,to:date})));
  expect(results).toHaveLength(10);expect(results.every(result=>result.engagementId===f.engagementId)).toBe(true);
},30000);
