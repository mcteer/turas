import {captureLearningEvaluationArmContext,learningEvaluationArmInputSchema} from './evaluation-context';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningId,learningDraftSchema } from '../../contracts/learning';
import { getServerConfig } from '../config';
import { conversationFeature,type FeaturePrincipal } from '../conversations/feature';
import { captureLearningDraftContext } from './context';
import { learningHash } from './repository';
import {lockInternalLearningActor,lockLearningPublisher} from './policy';

/** Native identity is resolved from the server-owned response, never model arguments. */
export async function boundLearningActor(db:PoolClient,principal:FeaturePrincipal,incomingTurnId?:string,options:{release?:boolean;allowUnclaimedTurn?:boolean}={}){
 const responseId=principal?.attributes?.turasAttemptId;
 if(!learningId.safeParse(responseId).success||!learningId.safeParse(principal?.principalId).success||incomingTurnId!==undefined&&(!incomingTurnId||incomingTurnId.length>200))throw hiddenRecord();
 const row=(await db.query(`SELECT a.id,a.conversation_id,a.actor_membership_id,c.owner_principal_id,c.context_login_session_id,c.workspace_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
  FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id
  JOIN response_attempts r ON r.id=a.response_attempt_id AND r.conversation_id=c.id
  JOIN memberships m ON m.id=a.actor_membership_id JOIN principals p ON p.id=c.owner_principal_id JOIN login_sessions s ON s.id=c.context_login_session_id
  WHERE a.response_attempt_id=$1 AND c.owner_principal_id=$2 AND a.environment_id=$3 AND c.environment_id=a.environment_id AND c.workspace_id=a.workspace_id
  AND m.workspace_id=c.workspace_id AND m.principal_id=c.owner_principal_id AND s.principal_id=c.owner_principal_id`,[responseId,principal!.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!row)throw hiddenRecord();
 const actor:CurrentSession={sessionId:row.context_login_session_id,token:'',expiresAt:row.expires_at,principalId:row.owner_principal_id,membershipId:row.actor_membership_id,workspaceId:row.workspace_id,loginName:row.login_name,displayName:row.display_name,kind:row.kind,role:row.role};
 const feature=await conversationFeature(db,row.conversation_id);
 if(feature.kind!=='learning'||feature.scope.ownerMembershipId!==actor.membershipId)throw hiddenRecord();
 if(feature.scope.purpose==='draft')await lockInternalLearningActor(db,actor,feature.scope.customerId);else await lockLearningPublisher(db,actor,feature.scope.customerId);
 const payloads=(await db.query('SELECT kind,content,content_digest FROM learning_attempt_payloads WHERE attempt_id=$1',[row.id])).rows;
 if(payloads.some(p=>learningHash(p.content)!==p.content_digest))throw hiddenRecord();
 const retained=payloads.find(p=>p.kind==='context')?.content;
 if(!retained)throw new HttpFailure(409,'learning_context_changed','Learning inputs are no longer retained');
 if(feature.scope.purpose!=='draft'&&(retained.input?.evaluationId!==feature.scope.evaluationId||retained.input?.caseId!==feature.scope.caseId||retained.input?.purpose!==feature.scope.purpose))throw hiddenRecord();
 const current=feature.scope.purpose==='draft'?await captureLearningDraftContext(db,actor,learningDraftSchema.parse(retained.input)):await captureLearningEvaluationArmContext(db,actor,learningEvaluationArmInputSchema.parse(retained.input));
 if('evaluation' in current&&!options.release&&(current.evaluation.state!=='running'||current.evaluation.deadline_at<=new Date()))throw new HttpFailure(409,'evaluation_unavailable','Evaluation no longer admits this arm');
 if(current.fenceDigest!==retained.fenceDigest||current.closure.closureDigest!==feature.scope.closureDigest)throw new HttpFailure(409,'learning_context_changed','Learning inputs changed');
 await db.query('SELECT id FROM conversations WHERE id=$1 FOR SHARE',[row.conversation_id]);
 await db.query('SELECT id FROM response_attempts WHERE id=$1 FOR SHARE',[responseId]);
 const attempt=(await db.query(`SELECT a.*,r.response_state,r.dispatch_state,r.native_turn_id AS response_turn,r.deadline_at AS response_deadline,c.eve_session_id,c.binding_state,s.revoked_at,s.expires_at,clock_timestamp() AS now
  FROM learning_attempts a JOIN response_attempts r ON r.id=a.response_attempt_id JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id WHERE a.id=$1 FOR UPDATE OF a`,[row.id])).rows[0];
 const completed=options.release&&attempt?.state==='completed'&&attempt.response_state==='completed'&&attempt.dispatch_state==='admitted';
 if(!attempt||attempt.revoked_at||attempt.expires_at<=attempt.now||attempt.invalidated_at||attempt.binding_state!=='bound'||!attempt.eve_session_id||incomingTurnId&&attempt.response_turn&&incomingTurnId!==attempt.response_turn||!completed&&(attempt.state!=='running'||!['pending','running'].includes(attempt.response_state)||!['dispatching','admitted'].includes(attempt.dispatch_state)||!attempt.deadline_at||attempt.deadline_at<=attempt.now||!attempt.response_deadline||attempt.response_deadline<=attempt.now||!attempt.response_turn&&!incomingTurnId&&!(options.release&&options.allowUnclaimedTurn&&attempt.dispatch_state==='dispatching')))throw new HttpFailure(409,'learning_unavailable','Learning attempt is no longer active');
  if(attempt.native_session_id!==attempt.eve_session_id||attempt.native_turn_id&&attempt.native_turn_id!==(attempt.response_turn??incomingTurnId))throw hiddenRecord();
  return {actor,scope:feature.scope,attemptId:row.id as string,responseAttemptId:responseId as string,nativeSessionId:attempt.eve_session_id as string,nativeTurnId:(attempt.response_turn??incomingTurnId) as string,deadlineAt:attempt.deadline_at as Date,budgetId:attempt.budget_id as string,snapshot:retained.snapshot,sourceMap:current.sourceMap,counters:{modelSteps:Number(attempt.model_steps),readCalls:Number(attempt.read_calls),contextBytes:Number(attempt.context_bytes),outputTokens:Number(attempt.output_tokens)}};
}

export async function boundLearningDraftActor(db:PoolClient,principal:FeaturePrincipal,incomingTurnId?:string,options:{release?:boolean;allowUnclaimedTurn?:boolean}={}){const bound=await boundLearningActor(db,principal,incomingTurnId,options);if(bound.scope.purpose!=='draft')throw hiddenRecord();return bound;}
