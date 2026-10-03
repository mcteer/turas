import {randomUUID} from "node:crypto";
import {withTransaction} from "../../../lib/server/db/client";
import {createExecutionBaseline} from "./baseline";
import {submitExecutionCommand,previewExecutionCommand,readExecutionOverview,readExecutionRecords} from "../../../lib/server/execution/service";
import {submitPlanCommand} from "../../../lib/server/plans/commands";
import {createPlanReviewPreview,decidePlan} from "../../../lib/server/plans/decisions";
import type {ExecutionActor} from "../../../lib/server/execution/policy";
import type {PlanDraftContent} from "../../../lib/contracts/plan-content";
export const executionCommand=(action:string,expectedVersions:Record<string,number>,payload:unknown)=>({version:"execution-v1",action,requestKey:randomUUID(),expectedVersions,payload});
export async function registerFixture(){
  const f=await withTransaction(db=>createExecutionBaseline(db));
  await submitExecutionCommand(f.author,f.engagementId,executionCommand("setup",{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}));
  return f;
}
export type RegisterFixture=Awaited<ReturnType<typeof registerFixture>>;
export const registerBase=()=>({title:"Synthetic delivery concern",narrative:"Observed delivery context remains attributed to this reviewed record.",audience:"delivery",
  eventDate:new Date().toISOString().slice(0,10),timezone:"UTC",workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,
  unknownOwnerReason:"Owner not assigned",references:[]});
export const raidRecord=()=>({...registerBase(),kind:"raid",raidType:"risk",status:"open",severity:"high",impact:"May delay handoff",
  reviewDate:null,unknownDateReason:"Review date not known",acceptedExceptionRationale:null});
export const decisionRecord=()=>({...registerBase(),kind:"decision",decisionDate:new Date().toISOString().slice(0,10),decider:"Named synthetic delivery reviewer",
  rationale:"Human compared the alternatives"});
export const scopeRecord=(baselineId:string)=>({...registerBase(),kind:"scope_change",state:"proposed",oldBaselineId:baselineId,replacementBaselineId:null,
  impact:"A revised work package needs planning review"});
export async function saveRegister(f:Pick<RegisterFixture,"engagementId"|"baselineId"|"author">,record:unknown,prior?:{id:string;version:number},actor:ExecutionActor=f.author){
  const view=await readExecutionOverview(actor,f.engagementId);
  const result=await submitExecutionCommand(actor,f.engagementId,executionCommand(prior?"record.revise":"record.create",
    prior?{execution:view.version,record:prior.version}:{execution:view.version},prior?{recordId:prior.id,record}:{baselineId:f.baselineId,record}));
  return (await readExecutionRecords(actor,f.engagementId,{recordId:result.changed[0].id})).records[0];
}
export async function submitRegister(f:Pick<RegisterFixture,"engagementId"|"author">,record:{id:string;revisionId:string;contentDigest:string;version:number},actor:ExecutionActor=f.author){
  const view=await readExecutionOverview(actor,f.engagementId);
  await submitExecutionCommand(actor,f.engagementId,executionCommand("record.submit",{execution:view.version,record:record.version},
    {recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}));
  return (await readExecutionRecords(actor,f.engagementId,{recordId:record.id})).records[0];
}
export async function reviewRegister(f:Pick<RegisterFixture,"engagementId"|"reviewer">,record:{id:string;revisionId:string;contentDigest:string;version:number},action="record.accept"){
  const view=await readExecutionOverview(f.reviewer,f.engagementId);
  const candidate={version:"execution-v1",action,expectedVersions:{execution:view.version,record:record.version},
    payload:{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}};
  const proof=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  return submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...proof,requestKey:randomUUID(),rationale:"Human reviewed exact register inputs"});
}
export async function replaceBaseline(f:{author:ExecutionActor;reviewer:ExecutionActor;created:{planId:string};engagementId:string},content:PlanDraftContent){
  return withTransaction(async db=>{
    const head=(await db.query("SELECT aggregate_version,accepted_revision_id,working_revision_id FROM delivery_plans WHERE id=$1",[f.created.planId])).rows[0];
    const saved=await submitPlanCommand(f.author,{action:"save",requestKey:randomUUID(),planId:f.created.planId,
      expectedAggregateVersion:Number(head.aggregate_version),parentRevisionId:head.working_revision_id,
      baseAcceptedRevisionId:head.accepted_revision_id,changeReason:"Human plans a scope replacement",content},db);
    const submitted=await submitPlanCommand(f.author,{action:"submit",requestKey:randomUUID(),planId:f.created.planId,expectedAggregateVersion:saved.aggregateVersion,
      revisionId:saved.revisionId,contentDigest:saved.contentDigest},db);
    const proof=await createPlanReviewPreview(f.reviewer,f.created.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
      revisionId:saved.revisionId,contentDigest:saved.contentDigest},db);
    return decidePlan(f.reviewer,f.created.planId,{action:"accept",requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
      revisionId:saved.revisionId,contentDigest:saved.contentDigest,reviewPreviewId:proof.previewId,engagementId:f.engagementId,
      deliverySuitabilityConfirmed:true,rationale:"Human approves the replacement through 006"},db);
  });
}
