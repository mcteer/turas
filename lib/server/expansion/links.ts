import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {getServerConfig} from '../config';
import {currentPlanSourceDigest} from '../plans/sources';
import {supportSelectedEngagements} from '../support/sources';
import {expansionHash} from './commands';
import type {ExpansionDependency} from './dependencies';
import {expansionLinksSchema,type ExpansionLink,type ExpansionSource} from './schema';
import type {ExpansionActor} from './policy';
export async function expansionLinkMetadata(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,selected:readonly string[],raw:readonly ExpansionLink[]){
 const links=expansionLinksSchema.parse(raw),plans=new Map<string,{planId:string;revisionId:string;workloadId:string|null;audience:'internal'|'delivery';digest:string}>(),refs:ExpansionSource[]=[];
 const engagements=await supportSelectedEngagements(db,actor,customerId,workloadId,selected,false,'internal');
 for(const engagement of engagements){
  const row=(await db.query(`SELECT b.*,p.audience FROM milestone_baselines b JOIN delivery_plans p ON p.id=b.plan_id JOIN plan_revision_payloads payload ON payload.revision_id=b.revision_id WHERE b.id=$1 AND b.engagement_id=$2 AND b.environment_id=$3 AND b.workspace_id=$4 AND b.customer_id=$5`,[engagement.active_baseline_id,engagement.id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rows[0];
  if(!row)throw new HttpFailure(409,'source_changed','Selected engagement baseline unavailable');
  refs.push({id:row.id,kind:'milestone_baseline',sourceRevisionId:row.id,generation:Number(row.baseline_number),contentDigest:row.content_digest,engagementId:engagement.id});
  plans.set(row.revision_id,{planId:row.plan_id,revisionId:row.revision_id,workloadId:engagement.workload_id,audience:row.audience,digest:row.content_digest});
 }
 for(const link of links){
  if(link.kind==='plan_revision'){
   const row=(await db.query(`SELECT p.id,p.accepted_revision_id,p.workload_id,p.audience,r.content_digest FROM delivery_plans p JOIN plan_revisions r ON r.plan_id=p.id AND r.id=$2 JOIN plan_revision_payloads payload ON payload.revision_id=r.id WHERE p.id=$1 AND p.environment_id=$3 AND p.workspace_id=$4 AND p.customer_id=$5 AND ($6::uuid IS NULL OR p.workload_id=$6)`,[link.planId,link.revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,workloadId])).rows[0];
   if(!row)throw hiddenRecord();if(row.accepted_revision_id!==link.revisionId)throw new HttpFailure(409,'source_changed','Choose the exact accepted delivery plan revision');
   plans.set(link.revisionId,{planId:row.id,revisionId:link.revisionId,workloadId:row.workload_id,audience:row.audience,digest:row.content_digest});
  }else{
   if(!selected.includes(link.engagementId))throw hiddenRecord();
   const engagement=engagements.find(row=>row.id===link.engagementId);if(!engagement)throw hiddenRecord();
   const row=(await db.query(`SELECT b.*,p.audience FROM milestone_baselines b JOIN delivery_plans p ON p.id=b.plan_id JOIN plan_revision_payloads payload ON payload.revision_id=b.revision_id WHERE b.id=$1 AND b.engagement_id=$2 AND b.environment_id=$3 AND b.workspace_id=$4 AND b.customer_id=$5`,[link.baselineId,link.engagementId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rows[0];
   if(!row)throw hiddenRecord();if(engagement.active_baseline_id!==link.baselineId||link.kind==='milestone_baseline'&&row.revision_id!==link.revisionId||link.kind==='engagement'&&Number(row.baseline_number)!==link.generation)throw new HttpFailure(409,'source_changed','Selected engagement baseline changed');
   plans.set(row.revision_id,{planId:row.plan_id,revisionId:row.revision_id,workloadId:engagement.workload_id,audience:row.audience,digest:row.content_digest});
   refs.push({id:link.baselineId,kind:'milestone_baseline',sourceRevisionId:link.baselineId,generation:Number(row.baseline_number),contentDigest:row.content_digest,engagementId:link.engagementId});
  }
 }
 const planDependencies:ExpansionDependency[]=[];
 for(const plan of plans.values()){
  const originals=(await db.query(`SELECT source_kind,source_revision_id,source_generation,source_digest FROM plan_source_dependencies WHERE revision_id=$1 UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,source_revision_id,source_generation,source_digest FROM plan_private_dependencies WHERE revision_id=$1`,[plan.revisionId])).rows;
  planDependencies.push(...originals.map(row=>({kind:row.source_kind,revisionId:row.source_revision_id,generation:Number(row.source_generation),contentDigest:row.source_digest})));
 }
 return {links,plans:[...plans.values()].sort((a,b)=>a.planId.localeCompare(b.planId)),refs:[...new Map(refs.map(ref=>[`${ref.kind}:${ref.sourceRevisionId}`,ref])).values()],planDependencies};
}
export async function verifyExpansionLinkPlans(db:PoolClient,actor:ExpansionActor,customerId:string,metadata:Awaited<ReturnType<typeof expansionLinkMetadata>>,lock:boolean){
 const identities=[];
 for(const plan of metadata.plans){
  const sourceDigest=await currentPlanSourceDigest(db,actor,plan.revisionId,customerId,plan.workloadId,plan.audience,false,true);
  const row=(await db.query(`SELECT accepted_revision_id FROM delivery_plans WHERE id=$1 ${lock?'FOR SHARE':''}`,[plan.planId])).rows[0];
  if(row?.accepted_revision_id!==plan.revisionId)throw new HttpFailure(409,'source_changed','Accepted delivery plan changed');
  identities.push({...plan,sourceDigest});
 }
 return expansionHash({links:metadata.links,plans:identities});
}
export function mergeExpansionDependencies(groups:readonly (readonly ExpansionDependency[])[]){
 const union=new Map<string,ExpansionDependency>();
 for(const dependency of groups.flat()){
  const key=`${dependency.kind}:${dependency.revisionId}`,prior=union.get(key);
  if(prior&&(prior.generation!==dependency.generation||prior.contentDigest!==dependency.contentDigest||prior.engagementId!==dependency.engagementId))throw new HttpFailure(409,'source_changed','Conflicting delivery source identities');
  union.set(key,dependency);if(union.size>200)throw new HttpFailure(422,'scope_too_large','Narrow the expansion evidence closure');
 }
 return [...union.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
}
