import {z} from 'zod';
import {learningId} from '../../contracts/learning';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningHash} from './repository';
import {lockLearningPublisher,learningActorGeneration} from './policy';
import {currentLearningReview} from './eligibility';
import {readKnowledgeCandidate} from '../knowledge/lineage';
import {readPublishedKnowledge} from '../knowledge/read';
import {learningEvaluationCases,learningCatalogVersion} from '../../learning/evaluation-cases';
import {learningRubric,learningExpectedBehaviors} from '../../learning/evaluation-rubric';
import {learningLimits,serializedBytes} from '../../contracts/learning';
export const learningEvaluationArmInputSchema=z.object({evaluationId:learningId,caseId:z.string().regex(/^E0[1-8]$/),purpose:z.enum(['evaluation_baseline','evaluation_candidate'])}).strict();
import {learningEvaluationPrompt} from '../../contracts/learning';
export {learningEvaluationPrompt} from '../../contracts/learning';
export const learningEvaluationCatalogDigest=()=>learningHash({version:learningCatalogVersion,cases:learningEvaluationCases});
export const learningEvaluationRubricDigest=()=>learningHash({rubric:learningRubric,expected:learningExpectedBehaviors});
export const learningEvaluationModelIdentity=JSON.stringify({model:'spacexai/grok-4.7',reasoningEffort:'low',requestedOutputTokens:4096,tools:0});
export const learningEvaluationSourceDigest=()=>learningHash({commit:process.env.VERCEL_GIT_COMMIT_SHA??null,contract:'learning-evaluation-v1',catalog:learningEvaluationCatalogDigest(),rubric:learningEvaluationRubricDigest(),prompt:learningEvaluationPrompt,model:learningEvaluationModelIdentity});
export async function captureLearningEvaluationScope(db:PoolClient,actor:CurrentSession,reviewId:string){
 await lockLearningPublisher(db,actor);
 const {review,closure}=await currentLearningReview(db,actor,reviewId);
 const candidate=await readKnowledgeCandidate(db,actor,review.contribution_id);
 if(candidate.revision!==Number(review.revision_number)||candidate.digest!==review.content_digest||candidate.state!=='submitted')throw new HttpFailure(409,'candidate_changed','The reviewed candidate is no longer current');
 const head=(await db.query(`SELECT p.id,p.revision_id,p.head_generation,r.content_digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.contribution_id=$1 AND p.environment_id=$2 AND p.state='published' FOR SHARE OF p`,[review.contribution_id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 const baseline=head?{publicationId:head.id as string,revisionId:head.revision_id as string,generation:Number(head.head_generation),digest:head.content_digest as string,payload:(await readPublishedKnowledge(db,actor,head.id)).payload}:null;
 const fence={actorGeneration:await learningActorGeneration(db,actor),reviewId,revisionId:review.revision_id,contentDigest:review.content_digest,closureDigest:closure.closureDigest,rightsDigest:closure.rightsDigest,baseline:baseline?{publicationId:baseline.publicationId,revisionId:baseline.revisionId,generation:baseline.generation,digest:baseline.digest}:null,catalogDigest:learningEvaluationCatalogDigest(),rubricDigest:learningEvaluationRubricDigest(),sourceDigest:learningEvaluationSourceDigest(),modelIdentity:learningEvaluationModelIdentity};
 return {review,closure,candidate,baseline,fence,fenceDigest:learningHash(fence)};
}
export async function captureLearningEvaluationArmContext(db:PoolClient,actor:CurrentSession,input:{evaluationId:string;caseId:string;purpose:'evaluation_baseline'|'evaluation_candidate'}){
 await lockLearningPublisher(db,actor);
 const header=(await db.query('SELECT customer_id FROM learning_evaluations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND actor_membership_id=$4',[input.evaluationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];if(!header)throw hiddenRecord();await lockLearningPublisher(db,actor,header.customer_id);
 const evaluation=(await db.query(`SELECT e.*,p.content,p.content_digest FROM learning_evaluations e JOIN learning_evaluation_payloads p ON p.evaluation_id=e.id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 AND e.actor_membership_id=$4`,[input.evaluationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];
 if(!evaluation||learningHash(evaluation.content)!==evaluation.content_digest)throw hiddenRecord();
 const current=await captureLearningEvaluationScope(db,actor,evaluation.review_id),retained=evaluation.content;
 if(current.fenceDigest!==retained.fenceDigest||evaluation.catalog_digest!==learningEvaluationCatalogDigest()||evaluation.rubric_digest!==learningEvaluationRubricDigest()||evaluation.source_digest!==learningEvaluationSourceDigest())throw new HttpFailure(409,'evaluation_changed','Frozen review, baseline or evaluation contract changed');
 const fixture=learningEvaluationCases.find(c=>c.id===input.caseId);if(!fixture)throw hiddenRecord();
 const frozen=retained.cases.find((c:{id:string})=>c.id===input.caseId);if(!frozen||learningHash(frozen)!==learningHash(fixture))throw hiddenRecord();
 const snapshot={contractVersion:'learning-evaluation-v1',purpose:'evaluation',utcDate:retained.utcDate,case:fixture,practice:input.purpose==='evaluation_baseline'?retained.baseline?.payload??null:retained.candidate.payload,noBaseline:input.purpose==='evaluation_baseline'&&!retained.baseline};
 const bytes=serializedBytes(snapshot)+Buffer.byteLength(learningEvaluationPrompt);if(bytes>learningLimits.inputBytes)throw new HttpFailure(413,'scope_too_large','Frozen evaluation context exceeds the input limit');
 return {snapshot,fence:current.fence,fenceDigest:current.fenceDigest,closure:current.closure,sourceMap:fixture.context.originals.filter(o=>o.status==='accepted').map(o=>({key:o.key})),bytes,evaluation};
}
