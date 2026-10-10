import {admitLearningWrite} from './limits';
import {knowledgeLineageIsCurrent} from '../profiles/eligibility';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {getServerConfig} from '../config';
import {learningWorkspaceState} from './schema';
import {captureLearningEvaluationScope} from './evaluation-context';
import {lockLearningPublisher} from './policy';
import {learningHash} from './repository';
import {learningPublishedReuseState} from './published-reuse';
type LearningPublishCommand={learningEvaluationId?:string;learningReviewId?:string;expectedBaselineGeneration?:number|null};
export async function learningPublicationState(db:PoolClient,workspaceId:string){const marker=(await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];return Number(marker?.schema_version??0)>=54?await learningWorkspaceState(db,workspaceId):null;}
const activated=learningPublicationState;
/** Called inside the same contribution/publication/source transaction as 005. */
export async function recordLearningRelease(db:PoolClient,actor:CurrentSession,contributionId:string,revisionId:string,digest:string,publicationId:string,generation:number,command:LearningPublishCommand){
 const state=await activated(db,actor.workspaceId);if(!state?.activatedAt)return false;
 await lockLearningPublisher(db,actor);
 if(!state.enabled)throw new HttpFailure(503,'learning_disabled','New publication is disabled');
 if(!command.learningEvaluationId||!command.learningReviewId||command.expectedBaselineGeneration===undefined)throw new HttpFailure(409,'learning_evaluation_required','A current reviewed paired evaluation is required before publication');
 const e=(await db.query(`SELECT e.*,p.content,p.content_digest FROM learning_evaluations e JOIN learning_evaluation_payloads p ON p.evaluation_id=e.id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 FOR UPDATE OF e`,[command.learningEvaluationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!e||e.state!=='passed'||e.invalidated_at||e.review_id!==command.learningReviewId||e.contribution_id!==contributionId||e.revision_id!==revisionId||Number(e.baseline_generation??0)!==Number(command.expectedBaselineGeneration??0))throw new HttpFailure(409,'evaluation_unavailable','The exact current candidate, review and baseline must pass evaluation');
 const current=await captureLearningEvaluationScope(db,actor,e.review_id);
 if(current.candidate.digest!==digest||learningHash(e.content)!==e.content_digest||current.fenceDigest!==e.content.fenceDigest)throw new HttpFailure(409,'evaluation_changed','The evaluated candidate or original closure changed');
 const reviewed=(await db.query(`SELECT r.case_id,m.active,m.kind,m.role,m.revision,r.actor_generation,p.active AS principal_active FROM learning_case_reviews r JOIN memberships m ON m.id=r.actor_membership_id AND m.workspace_id=$2 JOIN principals p ON p.id=m.principal_id WHERE r.evaluation_id=$1 FOR SHARE OF m,p`,[e.id,actor.workspaceId])).rows;
 if(reviewed.length!==8||reviewed.some(r=>!r.active||!r.principal_active||r.kind!=='internal'||r.role!=='admin'||Number(r.revision)+1!==Number(r.actor_generation)))throw new HttpFailure(409,'review_authority_changed','Current human review authority is required for release');
 await admitLearningWrite(db,actor);
 await db.query(`INSERT INTO learning_release_decisions(id,environment_id,workspace_id,evaluation_id,review_id,contribution_id,revision_id,publication_id,publication_generation,actor_membership_id,rollback_from_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT historical_revision_id FROM learning_rollback_records WHERE revision_id=$7))`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,e.id,e.review_id,contributionId,revisionId,publicationId,generation,actor.membershipId]);return true;
}
/** A retained receipt never reactivates an older or withdrawn publication head. */
export async function assertLearningPublicationReplay(db:PoolClient,actor:CurrentSession,contributionId:string,revisionId:string,command:LearningPublishCommand){
 const state=await activated(db,actor.workspaceId);if(!state?.activatedAt)return;
 await lockLearningPublisher(db,actor);
 const legacy=(await db.query(`SELECT 1 FROM knowledge_publications p JOIN learning_legacy_heads l ON l.publication_id=p.id AND l.publication_generation=p.head_generation AND l.revision_id=p.revision_id WHERE p.contribution_id=$1 AND p.revision_id=$2 AND p.state='published' AND p.environment_id=$3`,[contributionId,revisionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount;
 if(legacy&&!command.learningEvaluationId&&!command.learningReviewId&&await knowledgeLineageIsCurrent(db,revisionId))return;
 const head=(await db.query(`SELECT p.id,p.head_generation,d.evaluation_id,d.review_id FROM knowledge_publications p JOIN learning_release_decisions d ON d.publication_id=p.id AND d.publication_generation=p.head_generation AND d.revision_id=p.revision_id WHERE p.contribution_id=$1 AND p.revision_id=$2 AND p.state='published' AND p.environment_id=$3`,[contributionId,revisionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!head||head.evaluation_id!==command.learningEvaluationId||head.review_id!==command.learningReviewId||!((await learningPublishedReuseState(db,revisionId)).eligible))throw new HttpFailure(409,'publication_changed','The recorded publication is no longer current or eligible');
}

export async function admitLearningWithdrawal(db:PoolClient,actor:CurrentSession){if((await activated(db,actor.workspaceId))?.activatedAt)await admitLearningWrite(db,actor);}
