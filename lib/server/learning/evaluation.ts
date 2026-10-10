import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningEvaluationSchema,learningReasonSchema,learningId,learningLimits} from '../../contracts/learning';
import {learningCommand,learningRead} from './commands';
import {findLearningReceipt} from './receipts';
import {lockLearningPublisher} from './policy';
import {learningHash,expectLearningVersion,learningDatabaseNow} from './repository';
import {resolveLearningPrice} from './pricing';
import {createLearningBudget} from './budget';
import {createOwnedConversation} from '../conversations/repository';
import {assertFreshFeatureConversation} from '../conversations/feature';
import {persistLearningDependencies} from './sources';
import {learningEvaluationCases} from '../../learning/evaluation-cases';
import {captureLearningEvaluationScope,captureLearningEvaluationArmContext,learningEvaluationCatalogDigest,learningEvaluationRubricDigest,learningEvaluationModelIdentity,learningEvaluationSourceDigest,learningEvaluationPrompt} from './evaluation-context';
import {scheduleLearningPayloadPurge} from './retention';
import {enqueueLearningRetirement} from './invalidation';
export async function authorizeLearningEvaluationReceipt(db:PoolClient,actor:CurrentSession,id:string){
 await lockLearningPublisher(db,actor);
 const header=(await db.query('SELECT customer_id FROM learning_evaluations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!header)throw hiddenRecord();await lockLearningPublisher(db,actor,header.customer_id);
 const row=(await db.query('SELECT e.review_id,p.content,p.content_digest FROM learning_evaluations e JOIN learning_evaluation_payloads p ON p.evaluation_id=e.id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();const scope=await captureLearningEvaluationScope(db,actor,row.review_id);if(learningHash(row.content)!==row.content_digest||scope.fenceDigest!==row.content.fenceDigest)throw new HttpFailure(409,'evaluation_changed','Frozen evaluation inputs changed');
}
export async function prepareLearningEvaluation(actor:CurrentSession,raw:unknown,contributionId?:string){
 const input=learningEvaluationSchema.parse(raw),prior=await learningRead(actor,undefined,async db=>{await lockLearningPublisher(db,actor);return findLearningReceipt(db,actor,input.requestId);});
 const price=prior?null:await resolveLearningPrice();
 return learningCommand(actor,{...input,contributionId:contributionId??null},'evaluation.prepare',{customerId:null,authorize:async db=>{const scope=await captureLearningEvaluationScope(db,actor,input.reviewId);if(contributionId&&scope.candidate.id!==contributionId)throw hiddenRecord();expectLearningVersion(scope.candidate.revision,input.expectedVersion);if(input.catalogDigest!==learningEvaluationCatalogDigest()||input.baselineGeneration!==(scope.baseline?.generation??null))throw new HttpFailure(409,'evaluation_changed','Reload the fixed catalog and current baseline');}},async db=>{
  const scope=await captureLearningEvaluationScope(db,actor,input.reviewId);if(contributionId&&scope.candidate.id!==contributionId)throw hiddenRecord();expectLearningVersion(scope.candidate.revision,input.expectedVersion);
  if(input.catalogDigest!==learningEvaluationCatalogDigest()||input.baselineGeneration!==(scope.baseline?.generation??null))throw new HttpFailure(409,'evaluation_changed','Reload the fixed catalog and current baseline');
  if(!price)throw new HttpFailure(503,'pricing_unavailable','Prepare a fresh provider price contract');
  if((await db.query("SELECT 1 FROM learning_evaluations WHERE environment_id=$1 AND workspace_id=$2 AND state IN('prepared','running','unconfirmed')",[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rowCount)throw new HttpFailure(409,'evaluation_active','Resolve the active workspace evaluation first');
  const budgetId=await createLearningBudget(db,actor,input.budgetUsd,price),id=randomUUID(),now=await learningDatabaseNow(db);
  await db.query(`INSERT INTO learning_evaluations(id,environment_id,workspace_id,customer_id,actor_membership_id,contribution_id,revision_id,review_id,budget_id,baseline_revision_id,baseline_publication_id,baseline_generation,catalog_digest,rubric_digest,closure_digest,prompt_digest,source_digest,model_identity,deadline_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,scope.candidate.customerId,actor.membershipId,scope.candidate.id,scope.review.revision_id,input.reviewId,budgetId,scope.baseline?.revisionId??null,scope.baseline?.publicationId??null,scope.baseline?.generation??null,learningEvaluationCatalogDigest(),learningEvaluationRubricDigest(),scope.closure.closureDigest,learningHash(learningEvaluationPrompt),learningEvaluationSourceDigest(),learningEvaluationModelIdentity,new Date(now.getTime()+40*60000)]);
  const manifest={contractVersion:'learning-evaluation-v1',utcDate:now.toISOString().slice(0,10),fence:scope.fence,fenceDigest:scope.fenceDigest,candidate:{payload:scope.candidate.payload},baseline:scope.baseline,cases:learningEvaluationCases};
  await db.query('INSERT INTO learning_evaluation_payloads(evaluation_id,content,content_digest) VALUES($1,$2,$3)',[id,JSON.stringify(manifest),learningHash(manifest)]);
  for(const [index,fixture] of learningEvaluationCases.entries())await db.query('INSERT INTO learning_evaluation_cases(evaluation_id,case_id,ordinal,fixture_digest) VALUES($1,$2,$3,$4)',[id,fixture.id,index+1,learningHash(fixture)]);
  await persistLearningDependencies(db,actor,scope.candidate.customerId,'evaluation',id,scope.closure.originals);
  return {targetId:id,version:1};
 });
}
/** One fresh arm is prepared just before use, so later arms never inherit an expired five-minute preparation. */
export async function prepareLearningEvaluationArm(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningReasonSchema.parse(raw);
 return learningCommand(actor,{...input,evaluationId:id},'evaluation.arm',{customerId:null,authorize:async db=>{await authorizeLearningEvaluationReceipt(db,actor,id);}},async db=>{
  const evaluation=(await db.query('SELECT * FROM learning_evaluations WHERE id=$1 AND actor_membership_id=$2 FOR UPDATE',[id,actor.membershipId])).rows[0];if(!evaluation)throw hiddenRecord();expectLearningVersion(evaluation.version,input.expectedVersion);
  const now=await learningDatabaseNow(db);
  if(!['prepared','running'].includes(evaluation.state)||evaluation.deadline_at<=now)throw new HttpFailure(409,'evaluation_unavailable','This batch cannot admit another arm');
  const prior=(await db.query('SELECT a.* FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1 ORDER BY a.created_at,a.id',[id])).rows;
  if(prior.some(a=>a.state!=='completed'||!a.output_digest)||prior.length>=16)throw new HttpFailure(409,'evaluation_unavailable','Resolve the current arm or complete a fresh full-run evaluation');
  const fixture=learningEvaluationCases[Math.floor(prior.length/2)],purpose=prior.length%2===0?'evaluation_baseline' as const:'evaluation_candidate' as const;
  const context=await captureLearningEvaluationArmContext(db,actor,{evaluationId:id,caseId:fixture.id,purpose});
  const conversation=(await createOwnedConversation(actor,{customerId:evaluation.customer_id,requestKey:randomUUID(),title:`Learning evaluation ${fixture.id} ${prior.length%2===0?'baseline':'candidate'}`},db)).conversation;await assertFreshFeatureConversation(db,conversation.id);
  const binding=randomUUID(),attempt=randomUUID();
  await db.query(`INSERT INTO learning_bindings(id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,evaluation_id,case_id,closure_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[binding,evaluation.environment_id,evaluation.workspace_id,evaluation.customer_id,actor.membershipId,conversation.id,purpose,id,fixture.id,context.closure.closureDigest]);
  await db.query(`INSERT INTO learning_attempts(id,binding_id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,budget_id,native_request_id,prepared_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[attempt,binding,evaluation.environment_id,evaluation.workspace_id,evaluation.customer_id,actor.membershipId,conversation.id,purpose,evaluation.budget_id,randomUUID(),new Date(Math.min(now.getTime()+learningLimits.preparationMs,evaluation.deadline_at.getTime()))]);
  const payloads={context:{snapshot:context.snapshot,fence:context.fence,fenceDigest:context.fenceDigest,input:{evaluationId:id,caseId:fixture.id,purpose}},source_map:context.sourceMap,instruction:{text:learningEvaluationPrompt}};
  for(const [kind,content] of Object.entries(payloads))await db.query('INSERT INTO learning_attempt_payloads(attempt_id,kind,content,content_digest) VALUES($1,$2,$3,$4)',[attempt,kind,JSON.stringify(content),learningHash(content)]);
  await db.query("UPDATE learning_evaluations SET state='running',version=version+1 WHERE id=$1",[id]);
  return {targetId:attempt,version:1};
 });
}
/** Event completion is metadata-only. A single failed or unknown arm ends admission; no partial reruns. */
export async function advanceLearningEvaluation(db:PoolClient,attemptId:string){
 const binding=(await db.query('SELECT evaluation_id FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id WHERE a.id=$1',[attemptId])).rows[0];if(!binding?.evaluation_id)return;
 const evaluation=(await db.query('SELECT * FROM learning_evaluations WHERE id=$1 FOR UPDATE',[binding.evaluation_id])).rows[0];if(!evaluation||!['prepared','running'].includes(evaluation.state))return;
 const arms=(await db.query('SELECT a.state,a.output_digest FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1',[evaluation.id])).rows;
 const failed=arms.some(a=>['failed','cancelled','invalidated','unconfirmed'].includes(a.state)),complete=arms.length===16&&arms.every(a=>a.state==='completed'&&a.output_digest);
 if(failed||complete){await db.query('UPDATE learning_evaluations SET state=$2,version=version+1 WHERE id=$1',[evaluation.id,failed?'failed':'awaiting_review']);await scheduleLearningPayloadPurge(db,evaluation.id,'evaluation','obsolete');}
}
export async function cancelLearningEvaluation(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningReasonSchema.parse(raw);
 return learningCommand(actor,{...input,evaluationId:id},'evaluation.cancel',{customerId:null,newWork:false,authorize:async db=>{const e=(await db.query('SELECT customer_id FROM learning_evaluations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!e)throw hiddenRecord();await lockLearningPublisher(db,actor,e.customer_id);}},async db=>{
  const e=(await db.query('SELECT * FROM learning_evaluations WHERE id=$1 FOR UPDATE',[id])).rows[0];expectLearningVersion(e.version,input.expectedVersion);if(!['prepared','running','unconfirmed'].includes(e.state))throw new HttpFailure(409,'evaluation_unavailable','This evaluation is already terminal');
  await db.query("UPDATE learning_evaluations SET state='cancelled',version=version+1 WHERE id=$1",[id]);
  const arms=(await db.query("UPDATE learning_attempts a SET state='cancelled',failure_code='operator_cancelled',version=a.version+1 FROM learning_bindings b WHERE a.binding_id=b.id AND b.evaluation_id=$1 AND a.state IN('prepared','admitted','running','unconfirmed') RETURNING a.id,a.response_attempt_id",[id])).rows;
  for(const arm of arms){await scheduleLearningPayloadPurge(db,arm.id,'attempt','obsolete');await enqueueLearningRetirement(db,e.workspace_id,arm.id,new Date());if(arm.response_attempt_id)await db.query("UPDATE response_attempts SET response_state='stopping',revision=revision+1 WHERE id=$1 AND response_state IN('pending','running')",[arm.response_attempt_id]);}
  await scheduleLearningPayloadPurge(db,id,'evaluation','obsolete');return {targetId:id,version:Number(e.version)+1};
 });
}
