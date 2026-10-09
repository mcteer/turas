import { randomUUID } from 'node:crypto';
import type { GapActor } from './policy';
import { gapSaveSchema,type GapContent,type GapImpactContent,gapListSchema } from '../../contracts/product-gaps';
import { parseGapContent } from '../../product-gaps/content';
import { getServerConfig } from '../config';
import { gapCommand,gapRead,gapHash } from './commands';
import { gapRow,gapExpected,insertGapRevision,impactRow,revisionHeader } from './repository';
import { verifyGapSources,lockGapSourceUnion,createFencedGapVerifier,gapConfirmationChecks } from './sources';
import { projectGapRevision } from './projection';
import { HttpFailure,hiddenRecord } from '../../contracts/http';
import { invalidateGapReports } from './invalidation';
import type { PoolClient } from 'pg';
import {isGapWithholding} from './eligibility';
import {gapCountMetadata} from './counts';
import { lockGapCustomers } from './policy';
export async function saveGap(actor:GapActor,raw:unknown,id?:string){const input=gapSaveSchema.parse(raw),content=parseGapContent(input.content);return gapCommand(actor,'save_gap',{...input,gapId:id??null},async db=>{const verified=await verifyGapSources(db,actor,input.sourceRefs,{lock:true});let gapId=id;
 if(gapId){const row=await gapRow(db,actor,gapId,true);gapExpected(row.version,input.expectedVersion);if(row.canonical_state!=='active')throw new HttpFailure(409,'stale_version','Edit the canonical gap');}
 else{gapExpected(0,input.expectedVersion);gapId=randomUUID();await db.query('INSERT INTO product_gaps(id,environment_id,workspace_id,creator_membership_id) VALUES($1,$2,$3,$4)',[gapId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId]);}
 const row=await gapRow(db,actor,gapId);const revisionId=await insertGapRevision(db,actor,gapId,null,content,input.sourceRefs,verified.dependencies,id?Number(row.version)+1:1);await db.query('UPDATE product_gaps SET working_revision_id=$2,version=$3 WHERE id=$1',[gapId,revisionId,id?Number(row.version)+1:1]);return {recordId:gapId,resultId:revisionId,outcome:'proposed',version:id?Number(row.version)+1:1};});}
export async function gapDetail(db:PoolClient,actor:GapActor,id:string,impactOffset=0){const row=await gapRow(db,actor,id);if(row.canonical_state==='redirected'){await gapRow(db,actor,row.canonical_target!);return {contractVersion:'product-gaps-v1' as const,commandNamespace:gapHash([getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.sessionId]),scopeGeneration:Number(row.version),id,canonicalTarget:row.canonical_target,version:Number(row.version),working:null,reviewed:null,impacts:[],history:[],reviewer:false,disposition:row.disposition,revisitAt:null};}
 const rows=(await db.query(`SELECT o.* FROM gap_impact_observations o JOIN gap_observation_assignments a ON a.observation_id=o.id WHERE a.canonical_gap_id=$1 AND o.environment_id=$2 AND o.workspace_id=$3 ORDER BY o.created_at,o.id LIMIT 51 OFFSET $4`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,impactOffset])).rows;
 const visible=rows.slice(0,50);
 const ids=[...new Set([row.working_revision_id,row.reviewed_revision_id,...visible.flatMap(r=>[r.working_revision_id,r.reviewed_revision_id])].filter((v):v is string=>Boolean(v)))];
 const headers=new Map<string,Awaited<ReturnType<typeof revisionHeader>>>();
 for(const revisionId of ids)headers.set(revisionId,await revisionHeader(db,actor,revisionId));
 const refs=ids.flatMap(revisionId=>headers.get(revisionId)?.content?.sourceRefs??[]);
 // Discover the whole selected operation before acquiring original locks. This
 // prevents one customer's execution locks preceding another's source locks.
 const countProjection=await gapCountMetadata(db,actor,[id],new Date(),refs);
 const locked=await gapRow(db,actor,id,'share');gapExpected(locked.version,Number(row.version));
 const verifyFenced=await createFencedGapVerifier(db,actor);
 const project=(revisionId:string|null)=>projectGapRevision(db,actor,revisionId,false,revisionId?headers.get(revisionId):undefined,verifyFenced);
 const working=await project(row.working_revision_id),reviewed=row.reviewed_revision_id===row.working_revision_id?working:await project(row.reviewed_revision_id);
 const projectImpact=async(revisionId:string|null,customerId:string)=>{const projection=await project(revisionId);if(!projection?.content||(projection.content as GapImpactContent).classification==='suspected')return projection;try{if(!reviewed?.content)throw new HttpFailure(409,'source_unavailable','Reviewed product evidence unavailable');await gapConfirmationChecks(db,actor,customerId,projection.content as GapImpactContent,reviewed.content as GapContent,projection.sourceRefs,reviewed.sourceRefs);return projection;}catch(error){if(!isGapWithholding(error))throw error;return {...projection,availability:'withheld' as const,content:null,sourceRefs:[],sourceDigest:null};}};
 const impacts=[];
 for(const item of visible){const impact=await impactRow(db,actor,id,item.id,'share');gapExpected(impact.version,Number(item.version));const proposed=await projectImpact(impact.working_revision_id,impact.customer_id),accepted=impact.reviewed_revision_id===impact.working_revision_id?proposed:await projectImpact(impact.reviewed_revision_id,impact.customer_id);if(proposed?.content||accepted?.content){const customer=(await db.query('SELECT display_name FROM customer_references WHERE id=$1 AND workspace_id=$2',[impact.customer_id,actor.workspaceId])).rows[0];if(!customer)continue;impacts.push({id:impact.id,customerId:impact.customer_id,customerName:customer.display_name,workloadId:impact.workload_id,engagementId:impact.engagement_id,recurrenceParent:impact.recurrence_parent,version:Number(impact.version),state:impact.state,working:proposed,reviewed:accepted});}else impacts.push({id:impact.id,customerId:null,customerName:null,workloadId:null,engagementId:null,recurrenceParent:null,version:Number(impact.version),state:impact.state,working:proposed,reviewed:accepted});}
 const history=(await db.query('SELECT d.id,d.action,d.revision_id,d.impact_id,d.created_at,d.reviewer_membership_id,d.self_review FROM gap_decisions d WHERE (d.gap_id=$1 OR d.impact_id IN(SELECT observation_id FROM gap_observation_assignments WHERE canonical_gap_id=$1)) AND d.environment_id=$2 AND d.workspace_id=$3 ORDER BY d.created_at DESC,d.id DESC LIMIT 50',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows.map(d=>({id:d.id,action:d.action,revisionId:d.revision_id,impactId:d.impact_id,at:d.created_at.toISOString(),reviewerMembershipId:d.reviewer_membership_id,selfReview:d.self_review}));
 return {contractVersion:'product-gaps-v1' as const,commandNamespace:gapHash([getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.sessionId]),scopeGeneration:gapHash({version:row.version,heads:ids.map(id=>[id,headers.get(id)?.generation]),evidenceFreshness:countProjection.items[0].evidenceFreshness,availability:[working?.availability??null,reviewed?.availability??null,...impacts.flatMap(i=>[i.working?.availability??null,i.reviewed?.availability??null])]}),id,canonicalTarget:null,version:Number(row.version),disposition:row.disposition,revisitAt:row.revisit_at?.toISOString()??null,working,reviewed,evidenceFreshness:countProjection.items[0].evidenceFreshness,counts:{confirmed:countProjection.items[0].confirmed,suspectedOnly:countProjection.items[0].suspectedOnly,resolvedHistory:countProjection.items[0].resolvedHistory,methodVersion:countProjection.methodVersion},impacts,impactOffset,nextImpactOffset:rows.length>50?impactOffset+50:null,history,reviewer:(await import('./policy')).isGapReviewer(actor)};
}
export function readGap(actor:GapActor,id:string,offset=0){if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new HttpFailure(400,'invalid_input','Invalid impact page');return gapRead(actor,db=>gapDetail(db,actor,id,offset));}
export async function readGaps(actor:GapActor,raw:unknown){const input=gapListSchema.parse(raw);return gapRead(actor,async db=>{const {gapRegistry}=await import('./registry');return gapRegistry(db,actor,input);});}
