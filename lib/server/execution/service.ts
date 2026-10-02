import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { lockExecutionActor,isExecutionReviewer,type ExecutionActor } from "./policy";
import { executeExecutionCommand,executionTransaction } from "./commands";
import { executionCustomer,chargeExecutionRate } from "./locks";
import { executionBaseline,verifyBaseline,setupExecution } from "./baselines";
import { saveRecord,submitRecord } from "./records";
import { reviewRecord,recordReviewInputs } from "./review";
import { decideMilestone,milestoneReviewInputs } from "./milestones";
import { executionPreviewSchema,executionListSchema,executionId } from "./schema";
import { projectExecutionRecord,type ExecutionRecordMetadata } from "./projection";
import { executionRevisionEligible } from "./sources";
import { createExecutionPreview,executionCursor,readExecutionCursor } from "./previews";

export async function submitExecutionCommand(actor:ExecutionActor,engagementId:string,raw:unknown) {
  if (!executionId.safeParse(engagementId).success) throw new HttpFailure(400,'invalid_input','Invalid engagement identity');
  return executeExecutionCommand(actor,engagementId,raw,async(db,command,customerId)=>{
    switch(command.action) {
      case 'setup': return setupExecution(db,actor,customerId,engagementId,command);
      case 'record.create':case 'record.revise': return saveRecord(db,actor,customerId,engagementId,command);
      case 'record.submit': return submitRecord(db,actor,customerId,engagementId,command);
      case 'record.accept':case 'record.reject':case 'record.retract': return reviewRecord(db,actor,customerId,engagementId,command);
      case 'milestone.decide': return decideMilestone(db,actor,customerId,engagementId,command);
    }
  });
}
async function readAuthority(db:PoolClient,actor:ExecutionActor,engagementId:string) {
  const customerId=await executionCustomer(db,actor,engagementId);
  await lockExecutionActor(db,actor,customerId,'read');
  await chargeExecutionRate(db,actor,'read');return customerId;
}
export async function previewExecutionCommand(actor:ExecutionActor,engagementId:string,raw:unknown) {
  const parsed=executionPreviewSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400,'invalid_input','Invalid review preview');
  const command=parsed.data;
  return executionTransaction(async db=>{
    const customerId=await executionCustomer(db,actor,engagementId);
    const owner='revisionId' in command.payload ? (await db.query('SELECT owner_membership_id FROM execution_record_revisions WHERE id=$1 AND engagement_id=$2',[command.payload.revisionId,engagementId])).rows[0]?.owner_membership_id:undefined;
    await lockExecutionActor(db,actor,customerId,'review',false,owner??undefined);
    await chargeExecutionRate(db,actor,'read');
    const context=command.action==='milestone.decide'?await milestoneReviewInputs(db,actor,customerId,engagementId,command):await recordReviewInputs(db,actor,customerId,engagementId,command);
    return {...createExecutionPreview(actor,context.inputs),expectedVersions:command.expectedVersions};
  });
}
export async function readExecutionOverview(actor:ExecutionActor,engagementId:string) {
  return executionTransaction(async db=>{
    const customerId=await readAuthority(db,actor,engagementId);
    const engagement=(await db.query<{active_baseline_id:string}>('SELECT active_baseline_id FROM engagements WHERE id=$1',[engagementId])).rows[0];
    if (!engagement?.active_baseline_id) throw hiddenRecord();
    const baseline=await executionBaseline(db,actor,customerId,engagementId,engagement.active_baseline_id);
    let baselineEligible=true;
    try { await verifyBaseline(db,actor,customerId,baseline,true); }
    catch(error) { if (error instanceof HttpFailure && [403,404,409].includes(error.status)) baselineEligible=false; else throw error; }
    const head=(await db.query<{id:string;current_baseline_id:string;version:string;generation:string;state:string}>(`SELECT id,current_baseline_id,version,generation,state FROM execution_workspaces
      WHERE engagement_id=$1 AND workspace_id=$2 AND environment_id=$3`,[engagementId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    const mismatch=!!head&&head.current_baseline_id!==baseline.id;
    const milestones=head?(await db.query<{id:string;milestone_key:string;baseline_id:string;state:string;version:string;evidence_revision_ids:string[]}>(`SELECT h.id,h.milestone_key,h.baseline_id,h.state,h.version,COALESCE(e.evidence_revision_ids,'{}') AS evidence_revision_ids
      FROM execution_milestone_heads h LEFT JOIN execution_milestone_events e ON e.id=h.current_event_id WHERE h.engagement_id=$1 AND h.baseline_id=$2 ORDER BY h.milestone_key`,[engagementId,head.current_baseline_id])).rows:[];
    const projected=[];
    for(const milestone of milestones) {
      let reviewRequired=!baselineEligible||mismatch;
      for(const revisionId of milestone.evidence_revision_ids) {
        const accepted=(await db.query('SELECT 1 FROM execution_records WHERE accepted_revision_id=$1 AND engagement_id=$2',[revisionId,engagementId])).rowCount;
        if(!accepted||!await executionRevisionEligible(db,actor,customerId,engagementId,revisionId,actor.kind==='partner'?'delivery':'internal',true)) reviewRequired=true;
      }
      const proposal=(await db.query<{revision_id:string;owner_membership_id:string|null;content:{plannedDate:string|null;unknownPlannedDateReason:string|null;unknownOwnerReason:string|null}}>(`SELECT v.id AS revision_id,v.owner_membership_id,p.content FROM execution_records r
        JOIN execution_record_revisions v ON v.id=r.accepted_revision_id JOIN execution_record_payloads p ON p.revision_id=v.id
        JOIN execution_review_decisions d ON d.revision_id=v.id AND d.action='accept'
        WHERE r.engagement_id=$1 AND r.baseline_id=$2 AND p.content->>'subtype'='milestone_plan' AND p.content->>'milestoneKey'=$3
          AND (v.audience='delivery' OR $4='internal') ORDER BY d.created_at DESC,d.id DESC LIMIT 1`,[engagementId,milestone.baseline_id,milestone.milestone_key,actor.kind])).rows[0];
      const proposalEligible=proposal?await executionRevisionEligible(db,actor,customerId,engagementId,proposal.revision_id,actor.kind==='partner'?'delivery':'internal',true):false;
      if(proposal&&!proposalEligible)reviewRequired=true;
      const owner=proposalEligible&&proposal?.owner_membership_id?(await db.query('SELECT p.display_name FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.id=$1',[proposal.owner_membership_id])).rows[0]?.display_name:null;
      projected.push({id:milestone.id,key:milestone.milestone_key,baselineId:milestone.baseline_id,version:Number(milestone.version),
        hasReviewedPlan:!!proposal,plannedDate:proposalEligible?proposal!.content.plannedDate:null,unknownPlannedDateReason:proposalEligible?proposal!.content.unknownPlannedDateReason:null,
        ownerLabel:owner??null,unknownOwnerReason:proposalEligible?proposal!.content.unknownOwnerReason:'Owner not yet assigned',
        state:reviewRequired?'review_required':milestone.state,recordedState:milestone.state,reviewRequired});
    }
    const payload=baselineEligible?(await db.query<{content:{milestones:Array<{key:string;title:string;exitEvidence:string;customerValidation:string;dependencies:string[];plannedDate:string|null;plannedDateUnknownReason:string|null}>;workPackages:Array<{key:string;title:string}>}}>('SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1',[baseline.id])).rows[0]?.content:null;
    return {engagementId,customerId,audience:baseline.audience,initialized:!!head,id:head?.id??null,version:Number(head?.version??0),generation:Number(head?.generation??0),
      baselineId:baseline.id,baselineRevisionId:baseline.revision_id,boundBaselineId:head?.current_baseline_id??null,baselineVersion:Number(baseline.baseline_number),planVersion:Number(baseline.aggregate_version),
      state:!baselineEligible||mismatch?'review_required':head?.state??'not_initialized',reviewRequired:!baselineEligible||mismatch,
      milestones:projected.map(m=>({...m,exitEvidence:payload?.milestones.find(i=>i.key===m.key)?.exitEvidence??null,customerValidation:payload?.milestones.find(i=>i.key===m.key)?.customerValidation??null,dependencies:payload?.milestones.find(i=>i.key===m.key)?.dependencies??[],plannedDate:m.hasReviewedPlan?m.plannedDate:payload?.milestones.find(i=>i.key===m.key)?.plannedDate??null,unknownPlannedDateReason:m.hasReviewedPlan?m.unknownPlannedDateReason??(m.reviewRequired?'Reviewed planned date unavailable':null):payload?.milestones.find(i=>i.key===m.key)?.plannedDateUnknownReason??'Planned date unavailable',title:payload?.milestones.find(i=>i.key===m.key)?.title??'Review required'})),
      workPackages:payload?.workPackages.map(p=>({key:p.key,title:p.title}))??[],
      capabilities:{setup:actor.kind==='internal',contribute:true,review:isExecutionReviewer(actor),advice:actor.kind==='internal',utilization:isExecutionReviewer(actor)},
      writesDisabled:process.env.TURAS_008_DISABLED==='1'};
  });
}
const listInput=z.object({...executionListSchema.shape,kind:z.enum(['activity','raid','decision','scope_change','effort_budget','estimate','handoff','closeout','outcome']).optional(),
  state:z.enum(['draft','submitted','accepted','rejected','superseded','retracted']).optional(),recordId:executionId.optional()}).strict();
export async function readExecutionRecords(actor:ExecutionActor,engagementId:string,raw:unknown,review=false) {
  const parsed=listInput.safeParse(raw);if(!parsed.success)throw new HttpFailure(400,'invalid_input','Invalid record filters');
  const input=parsed.data;
  return executionTransaction(async db=>{
    const customerId=await readAuthority(db,actor,engagementId);
    if(review&&!isExecutionReviewer(actor))throw new HttpFailure(403,'forbidden','Review access required');
    const head=(await db.query<{current_baseline_id:string;generation:string}>('SELECT current_baseline_id,generation FROM execution_workspaces WHERE engagement_id=$1',[engagementId])).rows[0];
    if(!head)throw hiddenRecord();
    const scope={environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,member:actor.membershipId,session:actor.sessionId,engagementId,
      baseline:head.current_baseline_id,generation:Number(head.generation),kind:input.kind??null,state:review?'submitted':input.state??null,recordId:input.recordId??null};
    const cursor=readExecutionCursor(input.cursor,scope);
    const rows=(await db.query<ExecutionRecordMetadata&{created_at:Date}>(`SELECT r.id,r.author_membership_id,r.current_revision_id,r.accepted_revision_id,r.version,r.state,r.kind,r.baseline_id,r.created_at
      FROM execution_records r JOIN execution_record_revisions v ON v.id=CASE WHEN r.author_membership_id=$5 OR $6 THEN r.current_revision_id ELSE r.accepted_revision_id END
      WHERE r.engagement_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3 AND r.customer_id=$4
        AND (v.audience='delivery' OR $7='internal') AND ($8::text IS NULL OR r.kind=$8)
        AND ($9::text IS NULL OR CASE WHEN r.author_membership_id=$5 OR $6 THEN r.state ELSE 'accepted' END=$9)
        AND ($10::uuid IS NULL OR r.id=$10) AND ($11::timestamptz IS NULL OR (r.created_at,r.id)>($11,$12::uuid))
      ORDER BY r.created_at,r.id LIMIT $13`,[engagementId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,isExecutionReviewer(actor),actor.kind,
        input.kind??null,review?'submitted':input.state??null,input.recordId??null,cursor?.lastAt??null,cursor?.lastId??null,input.limit+1])).rows;
    const selected=rows.slice(0,input.limit),records=[];
    for(const row of selected){const record=await projectExecutionRecord(db,actor,customerId,engagementId,row);if(record)records.push(record);}
    const last=selected.at(-1);
    return {records,generation:Number(head.generation),nextCursor:rows.length>input.limit&&last?executionCursor(scope,last.created_at.toISOString(),last.id):null};
  });
}

export async function readExecutionOwners(actor:ExecutionActor,engagementId:string) {
  return executionTransaction(async db=>{
    const customerId=await readAuthority(db,actor,engagementId);
    const rows=(await db.query<{id:string;display_name:string}>(`SELECT m.id,p.display_name FROM memberships m JOIN principals p ON p.id=m.principal_id
      LEFT JOIN partner_organizations o ON o.id=m.partner_org_id WHERE m.workspace_id=$1 AND m.active AND p.active
      AND (m.kind='internal' OR (o.active AND EXISTS(SELECT 1 FROM customer_grants g WHERE g.membership_id=m.id AND g.customer_id=$2 AND g.state='active')))
      ORDER BY p.display_name,m.id LIMIT 51`,[actor.workspaceId,customerId])).rows;
    if(rows.length>50)throw new HttpFailure(422,'scope_too_large','Narrow the eligible owner selection');
    return {owners:rows.map(r=>({id:r.id,label:r.display_name}))};
  });
}

export async function readExecutionHistory(actor:ExecutionActor,engagementId:string,raw:unknown) {
  const parsed=z.object({recordId:executionId,...executionListSchema.shape}).strict().safeParse(raw);
  if(!parsed.success)throw new HttpFailure(400,'invalid_input','Invalid history filters');
  const input=parsed.data;
  return executionTransaction(async db=>{
    const customerId=await readAuthority(db,actor,engagementId);
    const record=(await db.query<ExecutionRecordMetadata>('SELECT * FROM execution_records WHERE id=$1 AND engagement_id=$2 AND workspace_id=$3 AND environment_id=$4',
      [input.recordId,engagementId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if(!record)throw hiddenRecord();
    const privileged=record.author_membership_id===actor.membershipId||isExecutionReviewer(actor);
    if(!privileged&&!record.accepted_revision_id)throw hiddenRecord();
    const head=(await db.query('SELECT generation,current_baseline_id FROM execution_workspaces WHERE engagement_id=$1',[engagementId])).rows[0];
    const scope={environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,member:actor.membershipId,session:actor.sessionId,engagementId,recordId:record.id,
      version:Number(record.version),generation:Number(head.generation),baseline:head.current_baseline_id};
    const cursor=readExecutionCursor(input.cursor,scope);
    const revisions=(await db.query<{id:string;created_at:Date;accepted:boolean;last_action:string|null}>(`SELECT v.id,v.created_at,
      EXISTS(SELECT 1 FROM execution_review_decisions d WHERE d.revision_id=v.id AND d.action='accept') AS accepted,
      (SELECT action FROM execution_review_decisions d WHERE d.revision_id=v.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_action
      FROM execution_record_revisions v WHERE v.record_id=$1 AND (v.audience='delivery' OR $2='internal')
        AND ($3 OR EXISTS(SELECT 1 FROM execution_review_decisions d WHERE d.revision_id=v.id AND d.action='accept'))
        AND ($4::timestamptz IS NULL OR (v.created_at,v.id)>($4,$5::uuid)) ORDER BY v.created_at,v.id LIMIT $6`,
      [record.id,actor.kind,privileged,cursor?.lastAt??null,cursor?.lastId??null,input.limit+1])).rows;
    if(!privileged&&!revisions.length)throw hiddenRecord();
    const selected=revisions.slice(0,input.limit),history=[];
    for(const revision of selected){
      const state=revision.id===record.accepted_revision_id?'accepted':revision.id===record.current_revision_id?record.state:revision.accepted?'superseded':revision.last_action==='reject'?'rejected':'draft';
      const projected=await projectExecutionRecord(db,actor,customerId,engagementId,{...record,current_revision_id:revision.id,accepted_revision_id:privileged?record.accepted_revision_id:revision.id,state});
      if(projected)history.push({...projected,canRevise:false,canSubmit:false,canReview:false,canRetract:false,state,currentAccepted:revision.id===record.accepted_revision_id});
    }
    const last=selected.at(-1);return {revisions:history,generation:Number(head.generation),nextCursor:revisions.length>input.limit&&last?executionCursor(scope,last.created_at.toISOString(),last.id):null};
  });
}
