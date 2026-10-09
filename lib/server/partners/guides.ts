import {projectPartnerGuide} from "./projection";
export {projectPartnerGuide} from "./projection";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { partnerContractVersion,partnerGuideDraftCommandSchema,partnerGuideContentSchema,partnerPageQuery,type PartnerGuideContent,partnerId,type PartnerAvailability } from "../../contracts/partners";
import { z } from "zod";
import { readEngagement } from "../engagements/read";
import { partnerAuthorityDigest,readPartnerCursor,issuePartnerCursor } from "./cursors";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { partnerCommand,partnerRead } from "./commands";
import { lockPartnerActor,isPartnerReviewer,requireGuideAuthor,type PartnerActor } from "./policy";
import { expectPartnerVersion,partnerHash,partnerTransaction } from "./repository";
import { partnerSourceFence,lockPartnerSourceUnion,partnerSourcePassages,persistPartnerSources,type PartnerGuideScope } from "./sources";
export type GuideRow={id:string;customer_id:string;engagement_id:string;plan_id:string;workload_id:string|null;creator_membership_id:string;disposition:"active"|"retired";version:string;working_revision_id:string|null;published_revision_id:string|null};
export type GuideRevision={id:string;guide_id:string;revision_number:string;author_membership_id:string;accepted_plan_revision_id:string;baseline_id:string;content_digest:string;source_digest:string;created_at:Date;review_state:"draft"|"submitted"|"published"|"rejected";generation:string;invalidated_at:Date|null;content:PartnerGuideContent|null};
export async function loadPartnerGuide(db:PoolClient,actor:PartnerActor,id:string,lock?:"share"|"update"):Promise<GuideRow>{
 const row=(await db.query<GuideRow>(`SELECT * FROM partner_guides WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 ${lock==="update"?"FOR UPDATE":lock==="share"?"FOR SHARE":""}`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return row;
}
export async function partnerGuideScope(actor:PartnerActor,id:string){if(!partnerId.safeParse(id).success)throw hiddenRecord();return partnerTransaction(async db=>{await lockPartnerActor(db,actor);const guide=await loadPartnerGuide(db,actor,id);await lockPartnerActor(db,actor,guide.customer_id);if(actor.kind==="partner"&&!guide.published_revision_id)throw hiddenRecord();return guide;});}
export async function loadPartnerGuideRevision(db:PoolClient,guide:GuideRow,id:string):Promise<GuideRevision>{
 const row=(await db.query<GuideRevision>(`SELECT r.*,s.review_state,s.generation,s.invalidated_at,p.content FROM partner_guide_revisions r JOIN partner_guide_revision_states s ON s.revision_id=r.id LEFT JOIN partner_guide_payloads p ON p.revision_id=r.id WHERE r.id=$1 AND r.guide_id=$2`,[id,guide.id])).rows[0];if(!row)throw hiddenRecord();return row;
}
export const revisionScope=(guide:GuideRow,revision:GuideRevision):PartnerGuideScope=>({customerId:guide.customer_id,engagementId:guide.engagement_id,workloadId:guide.workload_id,acceptedRevisionId:revision.accepted_plan_revision_id,baselineId:revision.baseline_id});
export async function guideAvailability(db:PoolClient,actor:PartnerActor,guide:GuideRow,revision:GuideRevision):Promise<PartnerAvailability>{
 if(guide.disposition==="retired")return "retired";if(!revision.content)return "purged";if(revision.invalidated_at||!partnerGuideContentSchema.safeParse(revision.content).success)return "source_unavailable";
 const current=(await db.query("SELECT e.active_baseline_id,p.accepted_revision_id FROM engagements e JOIN delivery_plans p ON p.id=e.plan_id WHERE e.id=$1 AND e.workspace_id=$2",[guide.engagement_id,actor.workspaceId])).rows[0];
 if(current?.active_baseline_id!==revision.baseline_id||current?.accepted_revision_id!==revision.accepted_plan_revision_id)return "obsolete";
 try{await partnerSourceFence(db,actor,revisionScope(guide,revision),revision.content.sources,revision.review_state==="published");const currentState=(await db.query("SELECT invalidated_at FROM partner_guide_revision_states WHERE revision_id=$1",[revision.id])).rows[0];return currentState?.invalidated_at?"source_unavailable":"eligible";}
 catch(error){if(error instanceof HttpFailure&&[404,409,422].includes(error.status))return "source_unavailable";throw error;}
}
export async function readPartnerGuide(actor:PartnerActor,id:string,revisionId?:string){
 if(!partnerId.safeParse(id).success||revisionId&&!partnerId.safeParse(revisionId).success)throw hiddenRecord();return partnerRead(actor,undefined,db=>projectPartnerGuide(db,actor,id,revisionId));
}
export async function listPartnerGuides(actor:PartnerActor,raw:unknown){
 const input=partnerPageQuery.extend({customerId:partnerId,engagementId:partnerId}).parse(raw);
 return partnerRead(actor,input.customerId,async db=>{
  const engagement=(await db.query("SELECT id FROM engagements WHERE id=$1 AND customer_id=$2 AND workspace_id=$3 AND environment_id=$4 AND audience='delivery'",[input.engagementId,input.customerId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];if(!engagement)throw hiddenRecord();
  const scope=partnerHash({kind:"guides",customerId:input.customerId,engagementId:input.engagementId,limit:input.limit,search:input.search}),authority=await partnerAuthorityDigest(db,actor,input.customerId),after=await readPartnerCursor(db,actor,input.cursor,scope,authority);
  const rows=(await db.query("SELECT id FROM partner_guides WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND engagement_id=$4 AND ($5::boolean OR published_revision_id IS NOT NULL) AND ($6::uuid IS NULL OR id>$6) ORDER BY id LIMIT $7",[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,input.engagementId,actor.kind==="internal",after?.id??null,input.limit+1])).rows;
  const scanned=rows.slice(0,input.limit),sets=[];for(const row of scanned){const guide=await loadPartnerGuide(db,actor,row.id),id=actor.kind==="partner"?guide.published_revision_id:guide.working_revision_id??guide.published_revision_id;if(id){const revision=await loadPartnerGuideRevision(db,guide,id);if(revision.content)sets.push({scope:revisionScope(guide,revision),refs:revision.content.sources});}}await lockPartnerSourceUnion(db,actor,sets,true);
  const items=[];for(const row of scanned){const view=await projectPartnerGuide(db,actor,row.id);if(input.search&&(!view.content||!view.content.title.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())))continue;items.push({guideId:view.guideId,revisionId:view.revisionId,version:view.version,title:view.content?.title??"Guide unavailable",reviewState:view.reviewState,availability:view.availability,href:`/partners/guides/${view.guideId}`});}
  const engagementDetail=await readEngagement(actor,input.engagementId,db);
  const hasMore=rows.length>input.limit,nextCursor=hasMore?await issuePartnerCursor(db,actor,scope,authority,{id:scanned.at(-1)!.id}):null;return {contractVersion:partnerContractVersion,items,hasMore,nextCursor,canAuthor:actor.kind==="internal"&&getServerConfig().TURAS_013_DISABLED!=="1",newWorkDisabled:getServerConfig().TURAS_013_DISABLED==="1",customerId:input.customerId,engagementId:input.engagementId,acceptedRevisionId:engagementDetail.acceptedRevisionId,baselineId:engagementDetail.activeBaselineId,baselineEligible:engagementDetail.contentAvailability==="readable"&&!engagementDetail.reviewRequired};
 });
}
async function appendRevision(db:PoolClient,actor:PartnerActor,guide:GuideRow,acceptedRevisionId:string,baselineId:string,content:PartnerGuideContent,sourceDigest:string,dependencies:Parameters<typeof persistPartnerSources>[3]){
 const id=randomUUID(),number=Number((await db.query("SELECT COALESCE(max(revision_number),0)+1 AS number FROM partner_guide_revisions WHERE guide_id=$1",[guide.id])).rows[0].number);
 await db.query(`INSERT INTO partner_guide_revisions(id,guide_id,revision_number,author_membership_id,accepted_plan_revision_id,baseline_id,content_digest,source_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,guide.id,number,actor.membershipId,acceptedRevisionId,baselineId,partnerHash(content),sourceDigest]);
 await db.query("INSERT INTO partner_guide_payloads(revision_id,content) VALUES($1,$2)",[id,JSON.stringify(content)]);await db.query("INSERT INTO partner_guide_revision_states(revision_id) VALUES($1)",[id]);await persistPartnerSources(db,id,content.sources,dependencies);
 if(guide.working_revision_id&&guide.working_revision_id!==guide.published_revision_id)await db.query("UPDATE partner_guide_revision_states SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '90 days') WHERE revision_id=$1",[guide.working_revision_id]);
 await db.query("UPDATE partner_guides SET working_revision_id=$1 WHERE id=$2",[id,guide.id]);return id;
}
export async function writePartnerGuide(actor:PartnerActor,raw:unknown){
 requireGuideAuthor(actor);const input=partnerGuideDraftCommandSchema.parse(raw),scoped=input.action==="guide.create"?null:await partnerGuideScope(actor,input.guideId),customerId=input.action==="guide.create"?input.customerId:scoped!.customer_id;
 return partnerCommand(actor,input,{customerId},async db=>{
  if(input.action==="guide.create"){
   const engagement=(await db.query("SELECT plan_id,workload_id FROM engagements WHERE id=$1 AND customer_id=$2 AND workspace_id=$3 AND environment_id=$4 AND audience='delivery'",[input.engagementId,customerId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];if(!engagement)throw hiddenRecord();
   const fence=await partnerSourceFence(db,actor,{customerId,engagementId:input.engagementId,workloadId:engagement.workload_id,acceptedRevisionId:input.acceptedRevisionId,baselineId:input.baselineId},input.content.sources);
   const id=randomUUID();await db.query(`INSERT INTO partner_guides(id,environment_id,workspace_id,customer_id,engagement_id,plan_id,workload_id,creator_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,input.engagementId,engagement.plan_id,engagement.workload_id,actor.membershipId]);
   const guide=await loadPartnerGuide(db,actor,id);await appendRevision(db,actor,guide,input.acceptedRevisionId,input.baselineId,input.content,fence.digest,fence.dependencies);return {targetId:id,version:1};
  }
  const initial=await loadPartnerGuide(db,actor,input.guideId);if(initial.disposition!=="active")throw new HttpFailure(409,"guide_retired","This guide is retired");
  const revision=input.action==="guide.submit"?await loadPartnerGuideRevision(db,initial,input.revisionId):null;
  const content=input.action==="guide.revise"?input.content:revision?.content;if(!content)throw new HttpFailure(409,"content_unavailable","Guide content is unavailable");partnerGuideContentSchema.parse(content);
  const scope=input.action==="guide.revise"?{customerId,engagementId:initial.engagement_id,workloadId:initial.workload_id,acceptedRevisionId:input.acceptedRevisionId,baselineId:input.baselineId}:revisionScope(initial,revision!);
  const fence=await partnerSourceFence(db,actor,scope,content.sources),guide=await loadPartnerGuide(db,actor,input.guideId,"update");expectPartnerVersion(guide.version,input.expectedVersion);
  if(input.action==="guide.revise")await appendRevision(db,actor,guide,input.acceptedRevisionId,input.baselineId,content,fence.digest,fence.dependencies);
  else{if(guide.working_revision_id!==input.revisionId||revision!.content_digest!==input.contentDigest||revision!.review_state!=="draft")throw new HttpFailure(409,"guide_changed","Reload the exact guide revision");await db.query("UPDATE partner_guide_revision_states SET review_state='submitted',generation=generation+1 WHERE revision_id=$1",[revision!.id]);}
  await db.query("UPDATE partner_guides SET version=version+1 WHERE id=$1",[guide.id]);return {targetId:guide.id,version:Number(guide.version)+1};
 });
}
