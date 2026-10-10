import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {wrapLanguageModel} from 'ai';
import {learningScopedFixture,learningAcceptedOriginal} from './setup';
import {createKnowledgeCandidate,submitKnowledgeCandidate} from '../../../lib/server/knowledge/service';
import {readLearningCandidate,reviewLearningCandidate} from '../../../lib/server/learning/reviews';
import {prepareLearningEvaluation,prepareLearningEvaluationArm} from '../../../lib/server/learning/evaluation';
import {readLearningEvaluation} from '../../../lib/server/learning/evaluation-captures';
import {learningEvaluationCatalogDigest,learningEvaluationPrompt} from '../../../lib/server/learning/evaluation-context';
import {prepareLearningNativeAttempt,claimLearningNativeDispatch} from '../../../lib/server/learning/native';
import {projectLearningNativeEventInTransaction} from '../../../lib/server/learning/native-events';
import {readLearningDraftInitialContext} from '../../../lib/server/learning/native-context';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../../lib/server/staffing/native-admission';
import {wrapStaffingModel} from '../../../lib/server/staffing/model-budget';
import {activateLearning} from '../../../scripts/learning-activate';
import {requireOwnedLearningDatabase} from '../../../scripts/learning-environment';
/** Complete domain captures for UI review checks. Synthetic SDK results prove no actual model quality. */
export async function learningPreparedEvaluation(db:PoolClient,options:{budgetUsd?:string}={}){
 requireOwnedLearningDatabase(process.env,true);
 const scope=await learningScopedFixture(db),{actors,workspaceId,customerId}=scope;
 const lineage=await learningAcceptedOriginal(db,actors.member,actors.admin,customerId);
 const payload={title:'Synthetic fully captured browser candidate',productVersion:'Unknown',problem:'Observed engineering concern',prerequisites:'Verify current evidence',solution:'Measure independently reviewed evidence',reasoning:'Use accepted observations',applicability:'Engineering workflows',limitations:'No causal claim',validation:'Verify originals'};
 const candidate=await createKnowledgeCandidate(db,actors.member,{idempotencyKey:randomUUID(),customerId,payload,lineage:[lineage]});
 await submitKnowledgeCandidate(db,actors.member,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest});
 await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,workspaceId,true,requireOwnedLearningDatabase(process.env,true));
 const view=await readLearningCandidate(actors.admin,candidate.id);
 const review=await reviewLearningCandidate(actors.admin,candidate.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,revisionId:view.revisionId,contentDigest:view.digest,closureDigest:view.closureDigest,decision:'accept',rightsAttested:true,checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},rationale:'Synthetic independently reviewed original rights'});
 const evaluation=await prepareLearningEvaluation(actors.admin,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,reviewId:review.targetId,baselineGeneration:null,catalogDigest:learningEvaluationCatalogDigest(),budgetUsd:options.budgetUsd??'25'});
 if(!evaluation.targetId)throw Error('Synthetic evaluation identity required');
 return {...scope,candidate,evaluationId:evaluation.targetId};
}
export async function learningCompletedEvaluation(db:PoolClient){
 const scope=await learningPreparedEvaluation(db),{actors}=scope,candidate=scope.candidate,evaluation={targetId:scope.evaluationId};
 for(let ordinal=0;ordinal<16;ordinal++){
  const current=await readLearningEvaluation(actors.admin,evaluation.targetId),arm=await prepareLearningEvaluationArm(actors.admin,evaluation.targetId,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:current.version,rationale:'Synthetic fixed paired arm'});
  const meta=(await db.query('SELECT * FROM learning_attempts WHERE id=$1',[arm.targetId])).rows[0],nativeSessionId=`synthetic-browser-${randomUUID()}`,turnId=`turn-${randomUUID()}`;
  await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[meta.conversation_id,nativeSessionId]);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'learning-browser-fixture',clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=excluded.last_seen_at",[process.env.TURAS_ENVIRONMENT_ID]);
  const native=await prepareLearningNativeAttempt(actors.admin,meta.conversation_id,nativeSessionId,meta.native_request_id,learningEvaluationPrompt,false);await claimLearningNativeDispatch(actors.admin,meta.conversation_id,native.attemptId,0);
  const event=(type:string,data:Record<string,unknown>)=>({type,meta:{id:`evt_learning_${randomUUID().replaceAll('-','')}`,at:new Date().toISOString()},data:{turnId,...data}});
  await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('message.received',{message:learningEvaluationPrompt}));
  const principal={principalId:actors.admin.principalId,attributes:{turasAttemptId:native.attemptId}},identity={nativeSessionId,responseAttemptId:native.attemptId,turnId,stepIndex:0};
  await readLearningDraftInitialContext(principal,turnId,nativeSessionId);
  const admitted=await admitGovernedStaffingModelStep(principal,identity),output={kind:'abstain',text:'PRIVATE_SYNTHETIC_CAPTURE: bounded fixed-case response',citationKeys:[],unknowns:['Applicability remains unverified']};
  const model={specificationVersion:'v4',provider:'synthetic',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async()=>({content:[{type:'text',text:JSON.stringify(output)}],finishReason:'stop',usage:{inputTokens:{total:100},outputTokens:{total:200}},providerMetadata:{gateway:{cost:'0.001',generationId:`synthetic-browser-${randomUUID()}`}},warnings:[]})} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
  const wrapped=wrapStaffingModel(model,admitted.mode,{deadlineAt:admitted.deadlineAt,beforeProvider:()=>assertGovernedStaffingProviderRelease(principal,identity)});await wrapped.doGenerate({prompt:[]});
  await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('message.completed',{message:JSON.stringify(output),finishReason:'stop'}));await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('turn.completed',{}));
 }
 if((await readLearningEvaluation(actors.admin,evaluation.targetId)).state!=='awaiting_review')throw Error('Sixteen synthetic captures required');
 return {...scope,candidate,evaluationId:evaluation.targetId};
}
