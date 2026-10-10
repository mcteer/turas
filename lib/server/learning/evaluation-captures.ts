import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {learningId,learningArmOutputSchema} from '../../contracts/learning';
import {hiddenRecord,HttpFailure} from '../../contracts/http';
import {learningRead} from './commands';
import {lockLearningPublisher} from './policy';
import {learningHash} from './repository';
import {captureLearningEvaluationScope,learningEvaluationCatalogDigest} from './evaluation-context';
import {learningEvaluationCases} from '../../learning/evaluation-cases';
import {learningExpectedBehaviors,learningRubric} from '../../learning/evaluation-rubric';
export async function readLearningEvaluation(actor:CurrentSession,id:string,options:{capture?:{caseId:string;purpose:'evaluation_baseline'|'evaluation_candidate'}}={}){
 learningId.parse(id);return learningRead(actor,undefined,async db=>{
  await lockLearningPublisher(db,actor);
  const header=(await db.query(`SELECT e.*,b.limit_micro_usd,b.state AS budget_state FROM learning_evaluations e JOIN learning_budget_accounts b ON b.id=e.budget_id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!header)throw hiddenRecord();await lockLearningPublisher(db,actor,header.customer_id);
  const payload=(await db.query('SELECT content,content_digest FROM learning_evaluation_payloads WHERE evaluation_id=$1',[id])).rows[0];
  const row={...header,...payload};
  let bodyAvailable=false;
  try{const current=await captureLearningEvaluationScope(db,actor,row.review_id);bodyAvailable=!!row.content&&learningHash(row.content)===row.content_digest&&current.fenceDigest===row.content.fenceDigest;}catch(error){if(!(error instanceof HttpFailure)||error.status>=500)throw error;}
  const attempts=(await db.query(`SELECT b.case_id,b.purpose,a.id,a.version,a.state,a.failure_code,a.output_digest,a.model_steps,a.output_tokens,a.conversation_id,a.native_request_id,a.native_session_id,a.native_turn_id,a.prepared_until,c.creation_operation_id,p.content,p.content_digest FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id JOIN conversations c ON c.id=a.conversation_id LEFT JOIN learning_attempt_payloads p ON p.attempt_id=a.id AND p.kind='output' AND b.case_id=$2 AND b.purpose=$3 WHERE b.evaluation_id=$1`,[id,options.capture?.caseId??null,options.capture?.purpose??null])).rows;
  const costs=(await db.query(`SELECT coalesce(sum(s.amount_micro_usd),0)::text charged,count(*) FILTER(WHERE s.id IS NULL AND released.reservation_id IS NULL)::int unknown FROM learning_budget_reservations r LEFT JOIN learning_budget_settlements s ON s.reservation_id=r.id LEFT JOIN learning_reservation_releases released ON released.reservation_id=r.id WHERE r.budget_id=$1`,[row.budget_id])).rows[0];
  const reviews=(await db.query('SELECT case_id,baseline_score,candidate_score,safety_passed,citation_passed,authority_passed FROM learning_case_reviews WHERE evaluation_id=$1',[id])).rows;
  return {contractVersion:'learning-evaluation-v1' as const,id,version:Number(row.version),state:row.state as string,deadlineAt:row.deadline_at.toISOString(),contributionId:row.contribution_id as string,reviewId:row.review_id as string,baselineGeneration:row.baseline_generation===null?null:Number(row.baseline_generation),bodyAvailable,budget:{id:row.budget_id as string,limitMicroUsd:String(row.limit_micro_usd),chargedMicroUsd:costs.charged as string,unknownReservations:Number(costs.unknown),state:row.budget_state as string},catalogDigest:row.catalog_digest as string,currentCatalogDigest:learningEvaluationCatalogDigest(),rubric:learningRubric,
   cases:learningEvaluationCases.map(fixture=>({id:fixture.id,...(bodyAvailable?{fixture,expected:learningExpectedBehaviors[fixture.id as keyof typeof learningExpectedBehaviors]}:{}),review:reviews.find(r=>r.case_id===fixture.id)??null,arms:(['evaluation_baseline','evaluation_candidate'] as const).map(purpose=>{
    const a=attempts.find(a=>a.case_id===fixture.id&&a.purpose===purpose);if(!a)return {purpose,state:'missing' as string};
    const parsed=bodyAvailable&&a.state==='completed'&&a.content&&learningHash(a.content)===a.content_digest&&a.content_digest===a.output_digest?learningArmOutputSchema.safeParse(a.content):null;
    return {purpose,id:a.id as string,state:a.state as string,version:Number(a.version),failureCode:a.failure_code as string|null,outputDigest:a.output_digest as string|null,modelSteps:Number(a.model_steps),outputTokens:Number(a.output_tokens),...(parsed?.success?{output:parsed.data}:{}),conversationId:a.conversation_id as string,operationId:a.creation_operation_id as string,nativeRequestId:a.native_request_id as string,nativeSessionId:a.native_session_id as string|null,nativeTurnId:a.native_turn_id as string|null,preparedUntil:a.prepared_until.toISOString()};
   })})),canAdvance:actor.membershipId===row.actor_membership_id&&bodyAvailable&&['prepared','running'].includes(row.state),canReview:bodyAvailable&&row.state==='awaiting_review'};
 });
}

export async function readLearningEvaluationCapture(actor:CurrentSession,id:string,caseId:string,purpose:'evaluation_baseline'|'evaluation_candidate'){
 if(!learningEvaluationCases.some(c=>c.id===caseId)||!['evaluation_baseline','evaluation_candidate'].includes(purpose))throw hiddenRecord();
 const evaluation=await readLearningEvaluation(actor,id,{capture:{caseId,purpose}}),arm=evaluation.cases.find(c=>c.id===caseId)?.arms.find(a=>a.purpose===purpose);if(!arm)throw hiddenRecord();
 return {contractVersion:'learning-evaluation-v1' as const,evaluationId:id,caseId,bodyAvailable:evaluation.bodyAvailable,arm};
}
