import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {hiddenRecord} from '../../contracts/http';
import {learningId} from '../../contracts/learning';
import {learningRead} from './commands';
import {lockInternalLearningActor} from './policy';
import {learningWorkspaceState} from './schema';
import {listScopedDueResearch} from '../research/refresh';
/** Metadata remains reviewable when source prose is withheld. No original body,
 * research request, acceptance, model call or improvement draft is created here. */
export const learningDueOwners=`
 SELECT j.*,c.customer_id,c.author_membership_id,c.id AS candidate_id,NULL::uuid AS measurement_id,r.id AS dependency_owner,'review' AS dependency_kind FROM learning_refresh_jobs j JOIN knowledge_publications p ON j.owner_kind='publication' AND p.id=j.owner_id JOIN knowledge_contributions c ON c.id=p.contribution_id LEFT JOIN learning_release_decisions release ON release.publication_id=p.id AND release.publication_generation=p.head_generation LEFT JOIN learning_candidate_reviews r ON r.id=release.review_id AND (SELECT min(d.valid_until) FROM learning_dependencies d WHERE d.environment_id=j.environment_id AND d.workspace_id=j.workspace_id AND d.owner_kind='review' AND d.owner_id=r.id)=j.deadline_at
 UNION ALL SELECT j.*,c.customer_id,c.author_membership_id,c.id,NULL::uuid,e.id,'evaluation' FROM learning_refresh_jobs j JOIN learning_evaluations e ON j.owner_kind='evaluation' AND e.id=j.owner_id JOIN knowledge_contributions c ON c.id=e.contribution_id
 UNION ALL SELECT j.*,c.customer_id,c.author_membership_id,NULL::uuid,c.id,r.id,'measurement' FROM learning_refresh_jobs j JOIN learning_measurement_revisions r ON j.owner_kind='measurement' AND r.id=j.owner_id JOIN learning_measurement_contributions c ON c.id=r.contribution_id`;
export async function readLearningDuePage(db:PoolClient,actor:CurrentSession,limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Invalid due-review page size');
 const rows=(await db.query(`SELECT * FROM(${learningDueOwners}) work WHERE environment_id=$1 AND workspace_id=$2 AND(author_membership_id=$3 OR $4::boolean) AND state IN('pending','running','review_required') ORDER BY deadline_at,id LIMIT $5`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.role==='admin',limit])).rows;
 return rows.map(row=>({jobId:String(row.id),candidateId:row.candidate_id?String(row.candidate_id):null,measurementId:row.measurement_id?String(row.measurement_id):null,state:String(row.state),kind:String(row.owner_kind),dueAt:row.deadline_at.toISOString(),action:'Review the original evidence. External refresh and improvement drafts each require their own explicit admission.'}));
}
export async function readLearningRefreshHandoff(actor:CurrentSession,id:string){
 learningId.parse(id);return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);const row=(await db.query(`SELECT * FROM(${learningDueOwners}) work WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND(author_membership_id=$4 OR $5::boolean)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.role==='admin'])).rows[0];if(!row)throw hiddenRecord();await lockInternalLearningActor(db,actor,row.customer_id);
  const sources=(await db.query("SELECT source_revision_id FROM learning_dependencies WHERE environment_id=$1 AND workspace_id=$2 AND owner_kind=$3 AND owner_id=$4 AND source_kind='verified_research' ORDER BY source_revision_id LIMIT 201",[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,row.dependency_kind,row.dependency_owner])).rows.map(source=>String(source.source_revision_id));
  const state=await learningWorkspaceState(db,actor.workspaceId),active=['pending','running','review_required'].includes(row.state);
  return {contractVersion:'learning-v1' as const,id,version:Number(row.version),kind:String(row.owner_kind),state:String(row.state),dueAt:row.deadline_at.toISOString(),enabled:state.enabled,sources:active?await listScopedDueResearch(db,actor,row.customer_id,sources):[],researchHref:active&&state.enabled?`/s?customerId=${encodeURIComponent(row.customer_id)}`:null,reviewHref:row.candidate_id?`/learning/candidates/${row.candidate_id}`:`/learning/measurements/${row.measurement_id}`,limitation:'Refresh retains the original public query and scope through normal research admission. Checked observations still require separate review; no facts, draft or publication are accepted automatically.'};
 });
}
