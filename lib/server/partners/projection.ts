import type {PoolClient} from "pg";
import {getServerConfig} from "../config";
import {partnerContractVersion,partnerGuideContentSchema,partnerAttemptContentSchema,partnerSourceSchema,type PartnerSource,type PartnerAttemptContent} from "../../contracts/partners";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import {lockPartnerActor,isPartnerReviewer,type PartnerActor} from "./policy";
import {expectPartnerVersion} from "./repository";
import {loadPartnerGuide,loadPartnerGuideRevision,guideAvailability,revisionScope} from "./guides";
import {loadPartnerAssignment,assignmentContext,lockPartnerAssignmentSources,type AssignmentRow} from "./assignments";
import {partnerSourceFence,partnerSourcePassages} from "./sources";
import {calculatePartnerProgress} from "./progress";
import type { EngagementDetail } from "../engagements/read";
export function partnerCustomerCard(row:{id:string;display_name:string}){return {customerId:row.id,displayName:row.display_name,href:`/partners/customers/${row.id}`};}
export function partnerEngagementCard(row:EngagementDetail){
 return {engagementId:row.engagementId,customerId:row.customerId,planId:row.planId,workloadId:row.workloadId,
  title:row.title,availability:row.contentAvailability,reviewRequired:row.reviewRequired,acceptedRevisionId:row.acceptedRevisionId,
  baselineId:row.activeBaselineId,baselineNumber:row.baselineNumber,acceptedAt:row.acceptedAt,
  links:{plan:`/customers/${row.customerId}/plans/${row.planId}`,execution:`/customers/${row.customerId}/engagements/${row.engagementId}/execution`,support:`/customers/${row.customerId}/support`}};
}

export async function projectPartnerGuide(db:PoolClient,actor:PartnerActor,id:string,revisionId?:string){
  const scoped=await loadPartnerGuide(db,actor,id);await lockPartnerActor(db,actor,scoped.customer_id);if(actor.kind==="partner"&&!scoped.published_revision_id)throw hiddenRecord();
  const guide=await loadPartnerGuide(db,actor,id),selected=actor.kind==="partner"?guide.published_revision_id:revisionId??guide.working_revision_id??guide.published_revision_id;
  if(!selected||actor.kind==="partner"&&revisionId&&revisionId!==selected)throw hiddenRecord();const revision=await loadPartnerGuideRevision(db,guide,selected),availability=await guideAvailability(db,actor,guide,revision);
  const locked=await loadPartnerGuide(db,actor,id,"share");expectPartnerVersion(locked.version,Number(guide.version));
  const decisions=(await db.query("SELECT id,action,created_at,minimized FROM partner_review_decisions WHERE guide_id=$1 AND guide_revision_id=$2 AND assignment_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 50",[id,selected])).rows;
  const history=[];for(const decision of decisions){const payload=availability==="eligible"&&!decision.minimized?(await db.query("SELECT content FROM partner_decision_payloads WHERE decision_id=$1",[decision.id])).rows[0]?.content:null;history.push({decisionId:decision.id,action:decision.action,decidedAt:decision.created_at?.toISOString()??null,rationale:payload?.rationale??null});}
  const citations=availability==="eligible"?await partnerSourcePassages(db,actor,revisionScope(guide,revision),revision.content!.sources):[];
  return {citations,contractVersion:partnerContractVersion,guideId:id,customerId:guide.customer_id,engagementId:guide.engagement_id,planId:guide.plan_id,version:Number(guide.version),disposition:guide.disposition,revisionId:selected,revisionNumber:Number(revision.revision_number),contentDigest:revision.content_digest,reviewState:revision.review_state,publishedRevisionId:guide.published_revision_id,baselineId:revision.baseline_id,acceptedRevisionId:revision.accepted_plan_revision_id,availability,content:availability==="eligible"?revision.content:null,newWorkDisabled:getServerConfig().TURAS_013_DISABLED==="1",canAuthor:actor.kind==="internal"&&guide.disposition==="active"&&getServerConfig().TURAS_013_DISABLED!=="1",canReview:isPartnerReviewer(actor)&&guide.disposition==="active",createdAt:revision.created_at.toISOString(),history};
}

export async function projectPartnerAssignment(db:PoolClient,actor:PartnerActor,a:AssignmentRow){
 a=await loadPartnerAssignment(db,actor,a.id);await lockPartnerActor(db,actor,a.customer_id,a.membership_id,false,true);
 await lockPartnerAssignmentSources(db,actor,a);
 const {guide,revision,availability}=await assignmentContext(db,actor,a),verified=new Set<string>(),checkpoints=[];
 if(revision.content)for(const cp of revision.content.checkpoints){
  const rows=(await db.query(`SELECT t.id AS attempt_id,t.attempt_number,t.state,r.id AS revision_id,r.content_digest,r.created_at,r.author_membership_id,s.invalidated_at,p.content FROM partner_checkpoint_attempts t JOIN partner_checkpoint_revisions r ON r.id=t.head_revision_id JOIN partner_checkpoint_revision_states s ON s.revision_id=r.id LEFT JOIN partner_checkpoint_payloads p ON p.revision_id=r.id WHERE t.assignment_id=$1 AND t.checkpoint_id=$2 ORDER BY t.attempt_number DESC LIMIT 21`,[a.id,cp.id])).rows,attempts=[];
  for(const row of rows.slice(0,20)){const attempt=await projectPartnerAttempt(db,actor,revisionScope(guide,revision),row,availability,row===rows[0]);if(row.state==="verified"&&attempt.content)verified.add(cp.id);attempts.push(attempt);}
  checkpoints.push({checkpointId:cp.id,title:availability==="eligible"?cp.title:null,criterion:availability==="eligible"?cp.criterion:null,required:cp.required,prerequisiteIds:cp.prerequisiteIds,attempts,hasMore:rows.length>20});
 }
 const graph=new Map((revision.content?.checkpoints??[]).map(cp=>[cp.id,cp])),currentCredit=(id:string):boolean=>verified.has(id)&&graph.get(id)!.prerequisiteIds.every(currentCredit);
 for(const checkpoint of checkpoints)for(const attempt of checkpoint.attempts)if(attempt.state==="verified"&&attempt.currentCredit&&!currentCredit(checkpoint.checkpointId)){attempt.currentCredit=false;attempt.availability="prerequisite_unavailable";}
 const locked=await loadPartnerAssignment(db,actor,a.id);expectPartnerVersion(locked.version,Number(a.version));
 return {contractVersion:partnerContractVersion,assignmentId:a.id,customerId:a.customer_id,engagementId:guide.engagement_id,guideId:a.guide_id,currentPublishedRevisionId:guide.published_revision_id,canManage:isPartnerReviewer(actor),newWorkDisabled:getServerConfig().TURAS_013_DISABLED==="1",revisionId:a.guide_revision_id,membershipId:a.membership_id,version:Number(a.version),state:a.state,availability,title:availability==="eligible"?revision.content?.title??null:null,guideContent:availability==="eligible"?revision.content:null,progress:calculatePartnerProgress(availability,revision.content?.checkpoints??[],verified),checkpoints,predecessorId:a.predecessor_id,successorId:a.successor_id,canAuthor:actor.kind==="partner"&&actor.membershipId===a.membership_id&&availability==="eligible"&&getServerConfig().TURAS_013_DISABLED!=="1",canReview:isPartnerReviewer(actor)&&availability==="eligible"&&getServerConfig().TURAS_013_DISABLED!=="1"};
}

export async function projectPartnerAttempt(db:PoolClient,actor:PartnerActor,scope:Parameters<typeof partnerSourceFence>[2],row:{attempt_id:string;attempt_number:string;state:string;revision_id:string;content_digest:string;created_at:Date|null;author_membership_id:string|null;invalidated_at:Date|null;content:PartnerAttemptContent|null;revision_number?:string;head_revision_id?:string},availability:string,allowBody=true){
 const parsed=partnerAttemptContentSchema.safeParse(row.content);let content:PartnerAttemptContent|null=availability==="eligible"&&allowBody&&!row.invalidated_at&&parsed.success?parsed.data:null;
 if(content)try{await partnerSourceFence(db,actor,scope,content.sources,row.state==="verified"&&(!row.head_revision_id||row.head_revision_id===row.revision_id));if((await db.query("SELECT invalidated_at FROM partner_checkpoint_revision_states WHERE revision_id=$1",[row.revision_id])).rows[0]?.invalidated_at)content=null;}catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;content=null;}
 const decision=(await db.query("SELECT d.id,d.action,d.created_at,d.minimized,p.content FROM partner_review_decisions d LEFT JOIN partner_decision_payloads p ON p.decision_id=d.id WHERE checkpoint_revision_id=$1",[row.revision_id])).rows[0];
 return {attemptId:row.attempt_id,attemptNumber:Number(row.attempt_number),revisionId:row.revision_id,revisionNumber:row.revision_number?Number(row.revision_number):null,contentDigest:row.content_digest,currentCredit:Boolean(content&&row.state==="verified"&&(!row.head_revision_id||row.head_revision_id===row.revision_id)),state:row.head_revision_id&&row.head_revision_id!==row.revision_id?"superseded_draft":row.state,availability:content?"eligible":!allowBody?"history_not_loaded":"source_unavailable",content,createdAt:content?row.created_at?.toISOString()??null:null,authorMembershipId:content?row.author_membership_id:null,decision:decision?{decisionId:decision.id,action:decision.action,decidedAt:decision.minimized?null:decision.created_at?.toISOString()??null,rationale:content&&!decision.minimized?decision.content?.rationale??null:null}:null};
}

export function partnerEvidenceItem(reference:PartnerSource,text:string){return {reference:partnerSourceSchema.parse(reference),text:Array.from(text).slice(0,2000).join("")};}
export function partnerGuidePreview(row:{requestId:string;previewId:string;expiresAt:string;guideId:string;version:number;revisionId:string;availability:string;content:import("../../contracts/partners").PartnerGuideContent|null;citations:Array<{sourceId:string;text:string}>}){return {contractVersion:partnerContractVersion,requestId:row.requestId,previewId:row.previewId,expiresAt:row.expiresAt,guideId:row.guideId,version:row.version,revisionId:row.revisionId,availability:row.availability,content:row.content?partnerGuideContentSchema.parse(row.content):null,citations:row.citations.map(c=>({sourceId:c.sourceId,text:c.text}))};}
export function partnerAssignmentPreview(row:{requestId:string;previewId:string;expiresAt:string;action:string;guideId:string;revisionId:string;membershipId:string;version:number}){return {contractVersion:partnerContractVersion,requestId:row.requestId,previewId:row.previewId,expiresAt:row.expiresAt,action:row.action,guideId:row.guideId,revisionId:row.revisionId,membershipId:row.membershipId,version:row.version};}
export function partnerCheckpointPreview(row:{requestId:string;previewId:string;expiresAt:string;assignmentId:string;version:number;content:PartnerAttemptContent|null;citations:Array<{sourceId:string;text:string}>}){return {contractVersion:partnerContractVersion,requestId:row.requestId,previewId:row.previewId,expiresAt:row.expiresAt,assignmentId:row.assignmentId,version:row.version,content:row.content?partnerAttemptContentSchema.parse(row.content):null,citations:row.citations.map(c=>({sourceId:c.sourceId,text:c.text}))};}
