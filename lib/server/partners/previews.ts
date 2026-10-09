import {partnerGuidePreview} from "./projection";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { partnerGuideReviewSchema,partnerGuideReviewCommandSchema,partnerContractVersion,type PartnerGuideReviewInput } from "../../contracts/partners";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { partnerCommand,partnerRead } from "./commands";
import { requirePartnerReviewer,type PartnerActor } from "./policy";
import { partnerAuthorityDigest } from "./cursors";
import { partnerHash,expectPartnerVersion } from "./repository";
import { partnerGuideScope,loadPartnerGuide,loadPartnerGuideRevision,guideAvailability,revisionScope } from "./guides";
import { partnerSourceFence,partnerSourcePassages } from "./sources";
const stale=()=>new HttpFailure(409,"preview_changed","Review changed; prepare a new preview");
function proposal(input:PartnerGuideReviewInput){const {requestId,...rest}=input;void requestId;return rest;}
async function bindGuideReview(db:PoolClient,actor:PartnerActor,input:PartnerGuideReviewInput){
 const guide=await loadPartnerGuide(db,actor,input.guideId),revision=await loadPartnerGuideRevision(db,guide,input.revisionId);expectPartnerVersion(guide.version,input.expectedVersion);
 if(guide.disposition!=="active"||revision.content_digest!==input.contentDigest)throw stale();
 if(input.action!=="guide.retire"&&(guide.working_revision_id!==revision.id||revision.review_state!=="submitted"))throw stale();
 if(revision.author_membership_id===actor.membershipId&&!input.selfReview)throw new HttpFailure(422,"self_review_required","Acknowledge review of your own authored content");
 const availability=input.action==="guide.retire"?"retired":await guideAvailability(db,actor,guide,revision);
 let sourceDigest=revision.source_digest;
 if(input.action==="guide.publish"){
  if(!revision.content||availability!=="eligible")throw new HttpFailure(409,"source_unavailable","Guide evidence is unavailable");
  sourceDigest=(await partnerSourceFence(db,actor,revisionScope(guide,revision),revision.content.sources,true)).digest;if(sourceDigest!==revision.source_digest)throw stale();
 }
 const locked=await loadPartnerGuide(db,actor,input.guideId,"update");expectPartnerVersion(locked.version,input.expectedVersion);
 const binding={proposal:proposal(input),authority:await partnerAuthorityDigest(db,actor,guide.customer_id),sessionId:actor.sessionId,guideVersion:Number(guide.version),revisionGeneration:Number(revision.generation),sourceDigest,availability,baselineId:revision.baseline_id,acceptedRevisionId:revision.accepted_plan_revision_id};
 return {binding,guide,revision,availability};
}
export async function previewPartnerGuide(actor:PartnerActor,raw:unknown){
 requirePartnerReviewer(actor);const input=partnerGuideReviewSchema.parse(raw),scope=await partnerGuideScope(actor,input.guideId);
 const receipt=await partnerCommand(actor,{...input,action:"preview."+input.action},{customerId:scope.customer_id},async db=>{
  const reviewed=await bindGuideReview(db,actor,input),id=randomUUID();await db.query(`INSERT INTO partner_review_previews(id,environment_id,workspace_id,actor_membership_id,session_id,customer_id,action,input_digest,binding_digest,binding) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.sessionId,scope.customer_id,input.action,partnerHash(proposal(input)),partnerHash(reviewed.binding),JSON.stringify(reviewed.binding)]);return {targetId:id,version:1};
 });
 return partnerRead(actor,scope.customer_id,async db=>{
  const preview=(await db.query("SELECT expires_at FROM partner_review_previews WHERE id=$1 AND actor_membership_id=$2 AND session_id=$3",[receipt.targetId,actor.membershipId,actor.sessionId])).rows[0];if(!preview||preview.expires_at.getTime()<=Date.now())throw new HttpFailure(410,"preview_expired","Prepare a new review preview");
  const reviewed=await bindGuideReview(db,actor,input),citations=reviewed.availability==="eligible"?await partnerSourcePassages(db,actor,revisionScope(reviewed.guide,reviewed.revision),reviewed.revision.content!.sources):[];return partnerGuidePreview({citations,requestId:receipt.requestId,previewId:receipt.targetId!,expiresAt:preview.expires_at.toISOString(),guideId:scope.id,version:Number(reviewed.guide.version),revisionId:reviewed.revision.id,availability:reviewed.availability,content:reviewed.availability==="eligible"?reviewed.revision.content:null});
 });
}
export async function decidePartnerGuide(actor:PartnerActor,raw:unknown){
 requirePartnerReviewer(actor);const input=partnerGuideReviewCommandSchema.parse(raw),scope=await partnerGuideScope(actor,input.guideId);
 return partnerCommand(actor,input,{customerId:scope.customer_id},async db=>{
  const preview=(await db.query("SELECT * FROM partner_review_previews WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND actor_membership_id=$4 AND session_id=$5",[input.previewId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.sessionId])).rows[0];if(!preview)throw stale();if(preview.expires_at.getTime()<=Date.now())throw new HttpFailure(410,"preview_expired","Prepare a new review preview");
  const {previewId,...reviewInput}=input;void previewId;const reviewed=await bindGuideReview(db,actor,reviewInput);if(preview.action!==input.action||preview.input_digest!==partnerHash(proposal(reviewInput))||preview.binding_digest!==partnerHash(reviewed.binding))throw stale();
  const decisionId=randomUUID(),action=input.action.slice(6);await db.query(`INSERT INTO partner_review_decisions(id,environment_id,workspace_id,guide_id,guide_revision_id,action,reviewer_membership_id,content_digest,binding_digest,self_review) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[decisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,scope.id,input.revisionId,action,actor.membershipId,input.contentDigest,preview.binding_digest,input.selfReview]);
  await db.query("INSERT INTO partner_decision_payloads(decision_id,content) VALUES($1,$2)",[decisionId,JSON.stringify({rationale:input.rationale})]);
  if(action==="publish"){
   if(reviewed.guide.published_revision_id&&reviewed.guide.published_revision_id!==input.revisionId)await db.query("UPDATE partner_guide_revision_states SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '90 days') WHERE revision_id=$1",[reviewed.guide.published_revision_id]);
   await db.query("UPDATE partner_guide_revision_states SET review_state='published',generation=generation+1 WHERE revision_id=$1",[input.revisionId]);await db.query("UPDATE partner_guides SET published_revision_id=$1,version=version+1 WHERE id=$2",[input.revisionId,scope.id]);
  }else if(action==="reject"){await db.query("UPDATE partner_guide_revision_states SET review_state='rejected',generation=generation+1 WHERE revision_id=$1",[input.revisionId]);await db.query("UPDATE partner_guides SET version=version+1 WHERE id=$1",[scope.id]);}
  else{await db.query("UPDATE partner_guides SET disposition='retired',version=version+1 WHERE id=$1",[scope.id]);await db.query("UPDATE partner_guide_revision_states SET invalidated_at=COALESCE(invalidated_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '24 hours'),generation=generation+1 WHERE revision_id IN(SELECT id FROM partner_guide_revisions WHERE guide_id=$1)",[scope.id]);}
  return {targetId:scope.id,version:Number(reviewed.guide.version)+1};
 });
}
