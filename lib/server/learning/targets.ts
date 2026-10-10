import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { learningTargetSchema,type LearningTarget } from '../../contracts/learning';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { readPublishedKnowledge } from '../knowledge/read';
import { reportReadProjection } from '../reports/read';
import { lockGapActor } from '../gaps/policy';
import { gapRow,impactRow,revisionHeader } from '../gaps/repository';
import { projectGapRevision } from '../gaps/projection';
import { gapConfirmationChecks } from '../gaps/sources';
import type { GapContent,GapImpactContent } from '../../contracts/product-gaps';
import { projectPartnerGuide,projectPartnerAttempt } from '../partners/projection';
import { loadPartnerAssignment,assignmentContext,lockPartnerAssignmentSources } from '../partners/assignments';
import { lockPartnerActor } from '../partners/policy';
import { revisionScope } from '../partners/guides';
import { lockLearningActor } from './policy';
import { learningRead } from './commands';
import { learningId } from '../../contracts/learning';
type TargetAccess={customerId:string|null;label:string};
export async function resolveLearningFeedbackTarget(actor:CurrentSession,kind:LearningTarget['kind'],id:string,revisionId?:string){
 learningId.parse(id);if(revisionId)learningId.parse(revisionId);
 return learningRead(actor,undefined,async db=>{
  let row:Record<string,unknown>|undefined;
  if(kind==='shared_practice')row=(await db.query(`SELECT p.revision_id,p.head_generation AS generation,r.content_digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.id=$1 AND p.environment_id=$2`,[id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  else if(!revisionId)throw hiddenRecord();
  else if(kind==='report')row=(await db.query('SELECT r.id AS revision_id,s.version AS generation,r.content_digest FROM report_revisions r JOIN report_scopes s ON s.id=r.report_id WHERE r.id=$1 AND s.id=$2 AND s.environment_id=$3 AND s.workspace_id=$4',[revisionId,id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
  else if(kind==='gap_observation'){const header=await revisionHeader(db,actor,revisionId!);row={revision_id:header.id,generation:header.generation,content_digest:header.content_digest};}
  else if(kind==='partner_guide')row=(await db.query('SELECT r.id AS revision_id,s.generation,r.content_digest FROM partner_guide_revisions r JOIN partner_guide_revision_states s ON s.revision_id=r.id JOIN partner_guides g ON g.id=r.guide_id WHERE r.id=$1 AND g.id=$2 AND g.environment_id=$3 AND g.workspace_id=$4',[revisionId,id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
  else if(kind==='own_checkpoint')row=(await db.query('SELECT r.id AS revision_id,s.generation,r.content_digest FROM partner_checkpoint_attempts t JOIN partner_checkpoint_revisions r ON r.id=t.head_revision_id JOIN partner_checkpoint_revision_states s ON s.revision_id=r.id WHERE t.id=$1 AND r.id=$2',[id,revisionId])).rows[0];
  if(!row)throw hiddenRecord();
  const target=learningTargetSchema.parse({kind,id,revisionId:row.revision_id,generation:Number(row.generation),digest:row.content_digest});
  const access=await authorizeLearningTarget(db,actor,target,true);return {contractVersion:'learning-v1' as const,target,label:access.label};
 });
}
const exact=(target:LearningTarget,revision:string,generation:number,digest:string)=>{
 if(target.revisionId!==revision||target.generation!==generation||target.digest!==digest)throw hiddenRecord();
};
/** Domain adapters check current access and the exact revision. They confer no reuse rights. */
export async function authorizeLearningTarget(db:PoolClient,actor:CurrentSession,raw:LearningTarget,submitting=false):Promise<TargetAccess>{
 const target=learningTargetSchema.parse(raw);await lockLearningActor(db,actor);
 try{
  switch(target.kind){
   case 'shared_practice':{
    const projection=await readPublishedKnowledge(db,actor,target.id);
    const row=(await db.query(`SELECT p.revision_id,p.head_generation,r.content_digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.id=$1 AND p.environment_id=$2 AND p.state='published' FOR SHARE OF p`,[target.id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if(!row)throw hiddenRecord();exact(target,row.revision_id,Number(row.head_generation),row.content_digest);
    return {customerId:null,label:projection.payload.title};
   }
   case 'report':{
    const projection=await reportReadProjection(db,actor,target.id,target.revisionId);
    if(!projection.document||projection.visibility!=='current')throw hiddenRecord();
    const row=(await db.query('SELECT content_digest FROM report_revisions WHERE id=$1 AND report_id=$2',[target.revisionId,target.id])).rows[0];
    if(!row)throw hiddenRecord();exact(target,projection.revisionId,projection.version,row.content_digest);
    return {customerId:projection.customerId,label:`${projection.kind} report`};
   }
   case 'gap_observation':{
    await lockGapActor(db,actor);
    const assignment=(await db.query(`SELECT canonical_gap_id FROM gap_observation_assignments WHERE observation_id=$1`,[target.id])).rows[0];
    if(!assignment)throw hiddenRecord();
    const impact=await impactRow(db,actor,assignment.canonical_gap_id,target.id,'share');
    if(impact.state!=='active'||![impact.working_revision_id,impact.reviewed_revision_id].includes(target.revisionId))throw hiddenRecord();
    await lockLearningActor(db,actor,impact.customer_id);
    const header=await revisionHeader(db,actor,target.revisionId),projection=await projectGapRevision(db,actor,target.revisionId);
    if(header.impact_id!==target.id||projection?.availability!=='eligible'||!projection.content)throw hiddenRecord();
    exact(target,header.id,Number(header.generation),header.content_digest);
    const content=projection.content as GapImpactContent;
    if(content.classification!=='suspected'){
     const gap=await gapRow(db,actor,assignment.canonical_gap_id,'share'),reviewed=await projectGapRevision(db,actor,gap.reviewed_revision_id);
     if(!reviewed?.content||reviewed.availability!=='eligible')throw hiddenRecord();
     await gapConfirmationChecks(db,actor,impact.customer_id,content,reviewed.content as GapContent,projection.sourceRefs,reviewed.sourceRefs);
    }
    return {customerId:impact.customer_id,label:'Product gap observation'};
   }
   case 'partner_guide':{
    const projection=await projectPartnerGuide(db,actor,target.id,target.revisionId);
    if(projection.availability!=='eligible'||!projection.content)throw hiddenRecord();
    const state=(await db.query('SELECT generation FROM partner_guide_revision_states WHERE revision_id=$1',[projection.revisionId])).rows[0];
    if(!state)throw hiddenRecord();exact(target,projection.revisionId,Number(state.generation),projection.contentDigest);
    return {customerId:projection.customerId,label:projection.content.title};
   }
   case 'own_checkpoint':{
    const row=(await db.query(`SELECT t.id AS attempt_id,t.assignment_id,t.attempt_number,t.state,t.head_revision_id,r.id AS revision_id,r.revision_number,r.content_digest,r.created_at,r.author_membership_id,s.invalidated_at,s.generation,p.content
      FROM partner_checkpoint_attempts t JOIN partner_checkpoint_revisions r ON r.id=t.head_revision_id
      JOIN partner_checkpoint_revision_states s ON s.revision_id=r.id LEFT JOIN partner_checkpoint_payloads p ON p.revision_id=r.id WHERE t.id=$1`,[target.id])).rows[0];
    if(!row)throw hiddenRecord();
    const assignment=await loadPartnerAssignment(db,actor,row.assignment_id);
    if(assignment.membership_id!==actor.membershipId&&(submitting||actor.kind==='partner'))throw hiddenRecord();
    await lockPartnerActor(db,actor,assignment.customer_id,assignment.membership_id);
    await lockPartnerAssignmentSources(db,actor,assignment);
    const context=await assignmentContext(db,actor,assignment);
    const projection=await projectPartnerAttempt(db,actor,revisionScope(context.guide,context.revision),row,context.availability);
    if(projection.availability!=='eligible'||!projection.content)throw hiddenRecord();
    exact(target,row.revision_id,Number(row.generation),row.content_digest);
    return {customerId:assignment.customer_id,label:'My training demonstration'};
   }
  }
 }catch(error){
  if(error instanceof HttpFailure&&[403,404,409,410,422].includes(error.status))throw hiddenRecord();
  throw error;
 }
}
