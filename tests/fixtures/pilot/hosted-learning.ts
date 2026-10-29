import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Client,type PoolClient} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from './knowledge';
import {installLearningSyntheticPrice} from '../learning/native-preparation';
import {createKnowledgeCandidate,submitKnowledgeCandidate} from '../../../lib/server/knowledge/service';
import {readLearningCandidate,reviewLearningCandidate} from '../../../lib/server/learning/reviews';
import {prepareLearningEvaluation,prepareLearningEvaluationArm} from '../../../lib/server/learning/evaluation';
import {learningEvaluationCatalogDigest,learningEvaluationPrompt} from '../../../lib/server/learning/evaluation-context';
import {activateLearning} from '../../../scripts/learning-activate';
import {prepareLearningNativeAttempt,claimLearningNativeDispatch} from '../../../lib/server/learning/native';
import {projectLearningNativeEventInTransaction} from '../../../lib/server/learning/native-events';
import {readLearningDraftInitialContext} from '../../../lib/server/learning/native-context';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../../lib/server/staffing/native-admission';
import {learningStepCeiling} from '../../../lib/server/learning/pricing';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
import {admitHostedLearningDispatch} from '../../../scripts/pilot-hosted-learning-admission';
import {hostedLearningBindingSchema,hostedLearningDispatchSchema} from '../../../lib/contracts/pilot-hosted-learning';

async function setup(environment:Parameters<Parameters<typeof withPilotEnvironment>[0]>[0],db:Client){
 const client=db as unknown as PoolClient,f=await pilotPublishedKnowledgeFixture(client,'synthetic_pilot');installLearningSyntheticPrice();
 const source=(await db.query('SELECT content_digest,revision_number FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0];
 const candidate=await createKnowledgeCandidate(client,f.actor,{idempotencyKey:randomUUID(),customerId:f.customerId,
  payload:{title:'Synthetic hosted ledger boundary',productVersion:'Unknown',problem:'A controlled accounting exercise',prerequisites:'Current independently reviewed originals',solution:'Retain original reservations before native dispatch',reasoning:'Prevent an unbounded provider retry',applicability:'Controlled synthetic tests',limitations:'No actual model or customer quality claim',validation:'Check exact scope and immutable receipts'},
  lineage:[{sourceKind:'accepted_profile',sourceRevisionId:f.originalRevisionId,sourceGeneration:Number(source.revision_number),sourceDigest:source.content_digest,rightsBasis:'Controlled synthetic accounting original'}]});
 await submitKnowledgeCandidate(client,f.actor,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:candidate.revision,expectedDigest:candidate.digest});
 await activateLearning(environment.environmentId,f.actor.workspaceId,true,requireOwnedPilotDatabase(process.env,true));
 const view=await readLearningCandidate(f.actor,candidate.id),review=await reviewLearningCandidate(f.actor,candidate.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:candidate.revision,revisionId:view.revisionId,contentDigest:view.digest,closureDigest:view.closureDigest,decision:'accept',rightsAttested:true,checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},rationale:'Owned synthetic accounting fixture only'});
 const evaluation=await prepareLearningEvaluation(f.actor,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:candidate.revision,reviewId:review.targetId,baselineGeneration:null,catalogDigest:learningEvaluationCatalogDigest(),budgetUsd:'25'});
 const prepared=await prepareLearningEvaluationArm(f.actor,evaluation.targetId!,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,rationale:'Controlled synthetic hosted admission arm'});
 const meta=(await db.query('SELECT a.*,b.case_id,b.evaluation_id,q.price_contract,q.price_digest FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id JOIN learning_budget_accounts q ON q.id=a.budget_id WHERE a.id=$1',[prepared.targetId])).rows[0];
 const native='synthetic-native-'+randomUUID(),turn='synthetic-turn-'+randomUUID();await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[meta.conversation_id,native]);
 const sourceBinding={sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)},expiresAt=new Date(Date.now()+3600000).toISOString();
 const scope={contract:'pilot-hosted-scope-v1' as const,runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:'https://synthetic.example',environmentMarker:environment.environmentId,workspaceId:f.actor.workspaceId,target:'preview' as const,...sourceBinding};
 const parent=join(environment.appRoot,'local-artifacts/016');await mkdir(parent,{recursive:true,mode:0o700});
 const ledger=await QualityBudgetLedger.create(join(parent,'synthetic-original-ledger-'+randomUUID()),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd:25000000,authorizationDigest:'c'.repeat(64),sourceDigest:sourceBinding.sourceDigest,catalogDigest:sourceBinding.catalogDigest,modelId:'anthropic/claude-sonnet-5.5',expiresAt});
 const original=await ledger.currentAuthority(),attempt=await ledger.beginAttempt(sourceBinding);
 const binding=hostedLearningBindingSchema.parse({contract:'pilot-hosted-learning-ledger-v1',budgetId:original.id,originalAuthorizationDigest:original.originalAuthorizationDigest,capMicroUsd:25000000,environmentMarker:environment.environmentId,workspaceId:f.actor.workspaceId,ownerPrincipalId:f.actor.principalId,target:'preview',projectId:scope.projectId,...sourceBinding,recordedAt:new Date().toISOString(),expiresAt});
 const dispatchBinding=hostedLearningDispatchSchema.parse({contract:'pilot-hosted-learning-dispatch-v1',scope,evaluationId:evaluation.targetId,learningAttemptId:meta.id,actorMembershipId:f.actor.membershipId,caseId:meta.case_id,purpose:meta.purpose,nativeSessionId:native,nativeRequestId:meta.native_request_id,priceDigest:meta.price_digest});
 const ceiling=Number(learningStepCeiling(meta.price_contract,4096).ceilingMicroUsd);
 process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON=JSON.stringify(binding);process.env.VERCEL_ENV='preview';process.env.VERCEL_PROJECT_ID=scope.projectId;process.env.VERCEL_DEPLOYMENT_ID=scope.deploymentId;
 const dispatch=await ledger.dispatch({modelId:'anthropic/claude-sonnet-5.5',ceilingMicroUsd:ceiling,pricingDigest:meta.price_digest,hostedLearning:dispatchBinding},attempt);
 const admit=()=>admitHostedLearningDispatch({db,ledger,dispatchId:dispatch,binding,signal:environment.signal});
 async function prepare(){
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'synthetic-hosted-learning',clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=excluded.last_seen_at",[environment.environmentId]);
  const nativeAttempt=await prepareLearningNativeAttempt(f.actor,meta.conversation_id,native,meta.native_request_id,learningEvaluationPrompt,false);await claimLearningNativeDispatch(f.actor,meta.conversation_id,nativeAttempt.attemptId,0);
  await projectLearningNativeEventInTransaction(client,native,nativeAttempt.attemptId,{type:'message.received',meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()},data:{turnId:turn,message:learningEvaluationPrompt}});
  const principal={principalId:f.actor.principalId,attributes:{turasAttemptId:nativeAttempt.attemptId}},identity={nativeSessionId:native,responseAttemptId:nativeAttempt.attemptId,turnId:turn,stepIndex:0};
  await readLearningDraftInitialContext(principal,turn,native);
  const admitted=await admitGovernedStaffingModelStep(principal,identity);
  return {principal,identity,admitted,release:()=>assertGovernedStaffingProviderRelease(principal,identity)};
 }
 return {environment,db,client,ledger,binding,scope,dispatchBinding,dispatch,ceiling,admit,prepare,meta};
}
export async function withHostedLearningFixture(run:(fixture:Awaited<ReturnType<typeof setup>>)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{await run(await setup(environment,db));}finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
