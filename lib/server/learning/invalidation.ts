import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getServerConfig } from '../config';
import { scheduleLearningPayloadPurge } from './retention';
/** Actor loss fences their own jobs; it does not revoke independent reuse rights. */
export async function fenceLearningActor(db:PoolClient,workspaceId:string,membershipId:string,at=new Date()){
 const environment=getServerConfig().TURAS_ENVIRONMENT_ID;
 const attempts=(await db.query(`UPDATE learning_attempts SET state='invalidated',failure_code='actor_unavailable',version=version+1
  WHERE id IN(SELECT id FROM learning_attempts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND state IN('prepared','admitted','running','unconfirmed') ORDER BY id LIMIT 100) RETURNING id`,[environment,workspaceId,membershipId])).rows;
 await db.query(`UPDATE learning_evaluations SET state='ineligible',invalidated_at=least(invalidated_at,$4),version=version+1
  WHERE id IN(SELECT id FROM learning_evaluations WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND state IN('prepared','running','awaiting_review','unconfirmed') ORDER BY id LIMIT $5)`,[environment,workspaceId,membershipId,at,100-attempts.length]);
 for(const attempt of attempts){await scheduleLearningPayloadPurge(db,attempt.id,'attempt','obsolete',at);await enqueueLearningRetirement(db,workspaceId,attempt.id,at);}
 return attempts.length;
}
export async function enqueueLearningRetirement(db:PoolClient,workspaceId:string,attemptId:string,due:Date){
 await db.query(`INSERT INTO learning_cleanup_jobs(id,environment_id,workspace_id,owner_kind,owner_id,due_at,next_attempt_at)
  VALUES($1,$2,$3,'attempt',$4,$5,$5) ON CONFLICT(environment_id,workspace_id,owner_kind,owner_id)
  DO UPDATE SET due_at=least(learning_cleanup_jobs.due_at,EXCLUDED.due_at),next_attempt_at=least(learning_cleanup_jobs.next_attempt_at,EXCLUDED.next_attempt_at)`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,workspaceId,attemptId,due]);
}
/** Caller has already established global original/rights loss under source locks. */
export async function invalidateLearningAttempt(db:PoolClient,workspaceId:string,attemptId:string,at=new Date(),sourceDeadline?:Date|null){
 const attempt=(await db.query(`UPDATE learning_attempts SET state='invalidated',failure_code='source_unavailable',version=version+1
  WHERE environment_id=$1 AND workspace_id=$2 AND id=$3 AND state<>'invalidated' RETURNING id`,[getServerConfig().TURAS_ENVIRONMENT_ID,workspaceId,attemptId])).rows[0]
  ??(await db.query("SELECT id FROM learning_attempts WHERE environment_id=$1 AND workspace_id=$2 AND id=$3 AND state='invalidated'",[getServerConfig().TURAS_ENVIRONMENT_ID,workspaceId,attemptId])).rows[0];
 if(!attempt)return false;
 const deadline=await scheduleLearningPayloadPurge(db,attemptId,'attempt','global_invalidated',at,sourceDeadline);
 await enqueueLearningRetirement(db,workspaceId,attemptId,deadline<at?deadline:at);
 return true;
}
/** Global reuse loss invalidates this immutable review and its exact evaluation
 * closure. Individual actor access loss must use fenceLearningActor instead. */
export async function invalidateLearningReview(db:PoolClient,workspaceId:string,reviewId:string,at=new Date(),sourceDeadline?:Date|null){
 const review=(await db.query('SELECT id FROM learning_candidate_reviews WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[reviewId,getServerConfig().TURAS_ENVIRONMENT_ID,workspaceId])).rows[0];if(!review)return false;
 await db.query('UPDATE learning_review_states SET revoked_at=$2,version=version+1 WHERE review_id=$1 AND revoked_at IS NULL',[reviewId,at]);
 await scheduleLearningPayloadPurge(db,reviewId,'review','global_invalidated',at,sourceDeadline);
 const evaluations=(await db.query(`UPDATE learning_evaluations SET state='ineligible',invalidated_at=least(invalidated_at,$4),version=version+1 WHERE id IN(SELECT id FROM learning_evaluations WHERE environment_id=$1 AND workspace_id=$2 AND review_id=$3 AND state<>'ineligible' ORDER BY id LIMIT 5) RETURNING id`,[getServerConfig().TURAS_ENVIRONMENT_ID,workspaceId,reviewId,at])).rows;
 for(const evaluation of evaluations){
  const attempts=(await db.query('SELECT a.id FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1 ORDER BY a.id LIMIT 16',[evaluation.id])).rows;
  for(const attempt of attempts)await invalidateLearningAttempt(db,workspaceId,attempt.id,at,sourceDeadline);
 }
 return true;
}
