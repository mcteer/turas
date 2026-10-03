import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
import {withTransaction} from "../../lib/server/db/client";
import {timeFixture,draftTime,submitTime,timeCandidate,decideTime} from "../fixtures/execution/time";
import {registerFixture,replaceBaseline,saveRegister,submitRegister,reviewRegister,scopeRecord} from "../fixtures/execution/registers";
import {readExecutionOverview,previewExecutionCommand,submitExecutionCommand,readExecutionRecords} from "../../lib/server/execution/service";
import {mapExecutionItem} from "../../lib/server/execution/reconciliation";
import {ingestVerifiedResearch} from "../../lib/server/profiles/research";
import {materializeCurrentProjection} from "../../lib/server/retrieval/projections";
import {submitProfileCommand} from "../../lib/server/profiles/service";
const candidate=async(f:{reviewer:Parameters<typeof readExecutionOverview>[0];engagementId:string;baselineId:string},newBaselineId:string,plan:number,items:unknown[])=>{
  const view=await readExecutionOverview(f.reviewer,f.engagementId);
  return {version:"execution-v1",action:"baseline.reconcile",expectedVersions:{execution:view.version,oldBaseline:1,newBaseline:2,plan},payload:{oldBaselineId:f.baselineId,newBaselineId,items}};
};
const mappings=[{kind:"work_package",oldKey:"proof",newKey:"delivery",disposition:"mapped"},
  {kind:"work_package",oldKey:"readiness",newKey:null,disposition:"retired"},{kind:"work_package",oldKey:null,newKey:"verification",disposition:"added"},
  {kind:"milestone",oldKey:"proof_done",newKey:"delivery_done",disposition:"mapped"},{kind:"milestone",oldKey:"ready",newKey:"ready",disposition:"mapped"}];
it("reconciles complete mappings without moving original actuals or carrying milestone acceptance",async()=>{
  const f=await timeFixture(),time=await submitTime(f,await draftTime(f));await decideTime(f,await timeCandidate(f,[time]));
  let view=await readExecutionOverview(f.reviewer,f.engagementId);
  const waive={version:"execution-v1",action:"milestone.decide",expectedVersions:{execution:view.version,milestone:1},
    payload:{baselineId:f.baselineId,milestoneKey:"proof_done",decision:"waive",evidenceRevisionIds:[]}};
  await submitExecutionCommand(f.reviewer,f.engagementId,{...waive,...await previewExecutionCommand(f.reviewer,f.engagementId,waive),requestKey:randomUUID(),rationale:"Human waives the original criterion"});
  let scope=await submitRegister(f,await saveRegister(f,{...scopeRecord(f.baselineId),state:"approved_for_planning"}));await reviewRegister(f,scope);
  const content=structuredClone(f.content);content.workPackages[0].key="delivery";content.workPackages[1].key="verification";
  content.milestones[0].key="delivery_done";content.milestones[1].dependencies=["delivery_done"];
  const replacement=await replaceBaseline(f,content);
  view=await readExecutionOverview(f.reviewer,f.engagementId);expect(view.reviewRequired).toBe(true);expect(view.boundBaselineId).toBe(f.baselineId);
  scope=(await readExecutionRecords(f.author,f.engagementId,{recordId:scope.id})).records[0];
  await expect(saveRegister(f,{...scopeRecord(f.baselineId),state:"implemented",replacementBaselineId:replacement.baselineId},scope)).rejects.toMatchObject({status:422});
  for(const invalid of [mappings.slice(1),[...mappings,mappings[0]],mappings.map((m,i)=>i===1?{...m,newKey:"delivery",disposition:"mapped"}:m)]){
    await expect(previewExecutionCommand(f.reviewer,f.engagementId,await candidate(f,replacement.baselineId!,replacement.aggregateVersion,invalid))).rejects.toMatchObject({status:422});
  }
  const request=await candidate(f,replacement.baselineId!,replacement.aggregateVersion,mappings),proof=await previewExecutionCommand(f.reviewer,f.engagementId,request);
  await expect(previewExecutionCommand(f.author,f.engagementId,request)).rejects.toMatchObject({status:403});
  const command={...request,...proof,requestKey:randomUUID(),rationale:"Human maps each exact old and new item"};
  const saved=await submitExecutionCommand(f.reviewer,f.engagementId,command);expect(await submitExecutionCommand(f.reviewer,f.engagementId,command)).toEqual(saved);
  view=await readExecutionOverview(f.reviewer,f.engagementId);expect(view.boundBaselineId).toBe(replacement.baselineId);expect(view.reviewRequired).toBe(false);
  expect(view.milestones.every(m=>m.state==="not_started")).toBe(true);
  const actuals=await withTransaction(db=>db.query("SELECT baseline_id,work_package_key,minutes FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId]));
  expect(actuals.rows).toEqual([{baseline_id:f.baselineId,work_package_key:"proof",minutes:60}]);
  expect(await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM execution_reconciliation_items WHERE engagement_id=$1",[f.engagementId])).rows[0].n)).toBe("5");
  const implemented=await submitRegister(f,await saveRegister(f,{...scopeRecord(f.baselineId),state:"implemented",replacementBaselineId:replacement.baselineId},scope));
  await reviewRegister(f,implemented);
  expect((await readExecutionRecords(f.reviewer,f.engagementId,{recordId:scope.id})).records[0].content).toMatchObject({state:"implemented",replacementBaselineId:replacement.baselineId});
  const thirdContent=structuredClone(content);thirdContent.workPackages[0].key="shipped";
  const third=await replaceBaseline(f,thirdContent),current=await readExecutionOverview(f.reviewer,f.engagementId);
  const secondMap={version:"execution-v1",action:"baseline.reconcile",expectedVersions:{execution:current.version,oldBaseline:2,newBaseline:3,plan:third.aggregateVersion},
    payload:{oldBaselineId:replacement.baselineId,newBaselineId:third.baselineId,items:[
      {kind:"work_package",oldKey:"delivery",newKey:"shipped",disposition:"mapped"},{kind:"work_package",oldKey:"verification",newKey:"verification",disposition:"mapped"},
      {kind:"milestone",oldKey:"delivery_done",newKey:"delivery_done",disposition:"mapped"},{kind:"milestone",oldKey:"ready",newKey:"ready",disposition:"mapped"}]}};
  await submitExecutionCommand(f.reviewer,f.engagementId,{...secondMap,...await previewExecutionCommand(f.reviewer,f.engagementId,secondMap),requestKey:randomUUID(),rationale:"Human reviews a second exact mapping"});
  expect(await withTransaction(db=>mapExecutionItem(db,f.reviewer,f.engagementId,f.baselineId,third.baselineId!,"work_package","proof"))).toEqual({state:"mapped",key:"shipped"});
  expect(await withTransaction(db=>mapExecutionItem(db,f.reviewer,f.engagementId,f.baselineId,third.baselineId!,"work_package","readiness"))).toEqual({state:"retired",key:null});
  expect(await withTransaction(async db=>(await db.query("SELECT baseline_id,work_package_key,minutes FROM execution_actual_days WHERE engagement_id=$1",[f.engagementId])).rows)).toEqual(actuals.rows);
});
it("rejects a changed accepted plan head after preview and leaves no mapping or receipt",async()=>{
  const f=await registerFixture(),replacement=await replaceBaseline(f,f.content);
  const identity=[...f.content.workPackages.map(w=>({kind:"work_package",oldKey:w.key,newKey:w.key,disposition:"mapped"})),
    ...f.content.milestones.map(m=>({kind:"milestone",oldKey:m.key,newKey:m.key,disposition:"mapped"}))];
  const request=await candidate(f,replacement.baselineId!,replacement.aggregateVersion,identity),proof=await previewExecutionCommand(f.reviewer,f.engagementId,request);
  await replaceBaseline(f,{...f.content,title:"Later accepted replacement"});
  const requestKey=randomUUID();
  await expect(submitExecutionCommand(f.reviewer,f.engagementId,{...request,...proof,requestKey,rationale:"Stale exact baseline review"})).rejects.toMatchObject({status:409});
  expect(await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM execution_reconciliations WHERE engagement_id=$1",[f.engagementId])).rows[0].n)).toBe("0");
  expect(await withTransaction(async db=>(await db.query("SELECT 1 FROM execution_command_receipts WHERE request_key=$1",[requestKey])).rowCount)).toBe(0);
});

it("fences replacement source withdrawal against concurrent reconciliation with cleanup paused",async()=>{
  const f=await registerFixture();
  const source=await withTransaction(async db=>{
    const result=await ingestVerifiedResearch({workspaceId:f.author.workspaceId,customerId:f.customerId,trustedIdentity:"synthetic-fixture-v1",
      location:`https://example.com/reconcile-${randomUUID()}`,title:"Synthetic planning research",passage:"SYNTHETIC_RECONCILIATION_SOURCE",supportedClaim:"A synthetic platform capability",
      publicationAt:"2026-09-28T12:00:00Z",retrievalAt:"2026-09-29T12:00:00Z",rights:"Synthetic owned source",audience:"delivery",
      qualityInput:{rubricVersion:"evidence-quality-v1",R:3,D:4,C:1,reliabilityRationale:"Named synthetic source",directnessRationale:"Direct synthetic passage",corroborationRationale:"Single source",informationType:"product_capability",dateBasis:"publication"},
      checks:{identity:true,scope:true,integrity:true,content:true,rationale:"Synthetic exact source checked",checkVersion:"research-check-v1"}},db);
    const id=await materializeCurrentProjection(db,"verified_research",result.sourceRevisionId,"delivery");
    const row=(await db.query("SELECT s.source_generation,s.content_digest,p.locators FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.id=$1 LIMIT 1",[id])).rows[0];
    return {id:randomUUID(),kind:"verified_research" as const,sourceRevisionId:result.sourceRevisionId,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0]};
  });
  const next=await replaceBaseline(f,{...f.content,sourceDependencies:[source]});
  const items=[...f.content.workPackages.map(w=>({kind:"work_package",oldKey:w.key,newKey:w.key,disposition:"mapped"})),...f.content.milestones.map(m=>({kind:"milestone",oldKey:m.key,newKey:m.key,disposition:"mapped"}))];
  const request=await candidate(f,next.baselineId!,next.aggregateVersion,items),proof=await previewExecutionCommand(f.reviewer,f.engagementId,request),requestKey=randomUUID();
  const [withdrawal,review]=await Promise.allSettled([
    withTransaction(db=>submitProfileCommand(f.reviewer,f.customerId,{action:"withdraw_source",requestKey:randomUUID(),sourceRevisionId:source.sourceRevisionId,expectedLifecycleVersion:0,rationale:"Human withdraws replacement evidence"},db)),
    submitExecutionCommand(f.reviewer,f.engagementId,{...request,...proof,requestKey,rationale:"Human reviews mapping while source eligibility changes"})]);
  expect(withdrawal.status).toBe("fulfilled");
  if(review.status==="rejected"){
    expect(review.reason).toMatchObject({status:409});
    expect(await withTransaction(async db=>(await db.query("SELECT 1 FROM execution_command_receipts WHERE request_key=$1",[requestKey])).rowCount)).toBe(0);
  }
  const view=await readExecutionOverview(f.reviewer,f.engagementId);expect(view.reviewRequired).toBe(true);
  expect(view.boundBaselineId).toBe(review.status==="fulfilled"?next.baselineId:f.baselineId);
  expect(view.milestones.every(m=>m.state==="review_required")).toBe(true);
});
