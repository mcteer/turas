import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
import {createAllocatedExecutionJourney} from "../fixtures/execution/journey";
import {saveRegister,submitRegister,reviewRegister,registerBase} from "../fixtures/execution/registers";
import {handoffRecord,referenceTo,outcomeRecord,waiveMilestones} from "../fixtures/execution/handoff";
import {readExecutionOverview,submitExecutionCommand,previewExecutionCommand} from "../../lib/server/execution/service";
import {readExecutionTime} from "../../lib/server/execution/time";
import {readExecutionSummary,readExecutionUtilization} from "../../lib/server/execution/summary";
import {submitProfileCommand} from "../../lib/server/profiles/service";
import {withTransaction} from "../../lib/server/db/client";
it("carries governed artifact review, accepted plan, confirmed staffing and approved work through evidenced closeout without changing source domains",async()=>{
  const journey=await createAllocatedExecutionJourney(),f={...journey,author:journey.actors.author,reviewer:journey.actors.reviewer};
  const command=(action:string,expectedVersions:Record<string,number>,payload:unknown)=>({version:"execution-v1",action,requestKey:randomUUID(),expectedVersions,payload});
  let view=await readExecutionOverview(f.author,f.engagementId);
  const created=await submitExecutionCommand(f.author,f.engagementId,command("time.create",{execution:view.version},{time:{baselineId:f.baselineId,resourceId:f.resource.resourceId,workPackageKey:"proof",serviceDate:f.date,
    timezone:"UTC",minutes:90,billable:true,activityRevisionId:f.activity.revisionId,allocationRevisionId:f.allocationRevisionId,note:"PRIVATE_JOURNEY_TIME_NOTE",onBehalfRationale:null}}));
  const period={from:f.date,to:f.date};let entry=(await readExecutionTime(f.author,f.engagementId,{...period,entryId:created.changed[0].id})).entries[0];view=await readExecutionOverview(f.author,f.engagementId);
  await submitExecutionCommand(f.author,f.engagementId,command("time.submit",{execution:view.version,time:entry.version},{entryId:entry.id,revisionId:entry.revisionId,contentDigest:entry.contentDigest}));
  entry=(await readExecutionTime(f.reviewer,f.engagementId,{...period,entryId:entry.id})).entries[0];view=await readExecutionOverview(f.reviewer,f.engagementId);
  const candidate={version:"execution-v1",action:"time.approve",expectedVersions:{execution:view.version},payload:{entries:[{entryId:entry.id,revisionId:entry.revisionId,contentDigest:entry.contentDigest,version:entry.version,exceptions:{}}]}};
  const proof=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,previewDigest:proof.previewDigest,previewExpiresAt:proof.previewExpiresAt,requestKey:randomUUID(),rationale:"Human verifies observed work against exact confirmed staffing"});
  for(const [key,minutes,remaining] of [["proof",120,30],["readiness",60,0]] as const){
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...registerBase(),kind:"effort_budget",workPackageKey:key,minutes})));
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...registerBase(),kind:"estimate",workPackageKey:key,minutes:remaining,asOf:new Date().toISOString(),explicitZero:remaining===0})));
  }
  const before=await withTransaction(async db=>({plan:(await db.query("SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1",[f.accepted.planId])).rows[0],allocation:(await db.query("SELECT aggregate_version,state,confirmed_revision_id FROM staffing_allocations WHERE id=$1",[f.allocation.allocationId])).rows[0]}));
  const reference=referenceTo(f.activity),handoff={...handoffRecord(reference),acknowledgement:{state:"recorded",eventDate:f.date,evidenceReferenceIds:[reference.id]}};
  const accepted=await submitRegister(f,await saveRegister(f,handoff));await reviewRegister(f,accepted);await waiveMilestones(f);
  await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...outcomeRecord(),status:"observed",measure:"Synthetic response time",unit:"ms",currentValue:"112.125",baselineUnknownReason:"No comparable pre-engagement capture",comparisonUnknownReason:"No control workload",measurementStart:f.date,measurementEnd:f.date,limitationReason:"Single synthetic observation",references:[reference]})));
  await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...handoff,kind:"closeout",handoffRevisionId:accepted.revisionId})));
  const summary=await readExecutionSummary(f.actors.partner,f.engagementId,period);
  expect(summary).toMatchObject({state:"closed",effort:{actualLifetimeMinutes:"90",actualPeriodMinutes:"90",remainingMinutes:"30",forecastMinutes:"120",budgetMinutes:"180",varianceMinutes:"-60",plannedPeriodMinutes:"120",tentativePeriodMinutes:"0"}});
  expect(JSON.stringify(summary)).not.toMatch(/PRIVATE_JOURNEY_TIME_NOTE|PRIVATE_EXECUTION_PERSONNEL_ASSESSMENT/);
  expect(summary.status.evidenceAge.some(e=>e.kind==="accepted_profile"&&e.ageDays===0)).toBe(true);
  expect((await readExecutionUtilization(f.reviewer,{resourceIds:[f.resource.resourceId],...period})).total).toMatchObject({actualBillableMinutes:"90",availableMinutes:"480",percentage:"18.75"});
  expect(await withTransaction(async db=>({plan:(await db.query("SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1",[f.accepted.planId])).rows[0],allocation:(await db.query("SELECT aggregate_version,state,confirmed_revision_id FROM staffing_allocations WHERE id=$1",[f.allocation.allocationId])).rows[0]}))).toEqual(before);
  const record=await withTransaction(async db=>(await db.query("SELECT record_id,content_digest FROM profile_revisions WHERE id=$1",[f.artifact.profileRevisionId])).rows[0]);
  const head=await withTransaction(async db=>(await db.query("SELECT version FROM profile_records WHERE id=$1",[record.record_id])).rows[0]);
  await withTransaction(db=>submitProfileCommand(f.reviewer,f.customerId,{action:"retract_revision",requestKey:randomUUID(),revisionId:f.artifact.profileRevisionId,expectedRecordVersion:Number(head.version),rationale:"Human withdraws the source claim after closeout"},db));
  const stale=await readExecutionSummary(f.reviewer,f.engagementId,period);expect(stale.state).toBe("review_required");expect(stale.effort.actualLifetimeMinutes).toBe("90");expect(stale.effort.forecastMinutes).toBeNull();
},240000);
