import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {learningScopedFixture,learningAcceptedOriginal} from './setup';
import {prepareLearningDraft,learningDraftMeta} from '../../../lib/server/learning/advisory';
import {learningDraftPrompt} from '../../../lib/contracts/learning';
import {prepareLearningNativeAttempt,claimLearningNativeDispatch} from '../../../lib/server/learning/native';
import {projectLearningNativeEventInTransaction} from '../../../lib/server/learning/native-events';
import {readLearningDraftInitialContext} from '../../../lib/server/learning/native-context';
import {createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate} from '../../../lib/server/knowledge/service';
export const learningNativeDraftOutput=()=>({contractVersion:'learning-v1',proposal:{title:'Synthetic revised engineering practice',productVersion:'Unknown',problem:'An observed engineering concern',prerequisites:'Check current applicability',solution:'Measure accepted original evidence',reasoning:'Ground guidance in independently observed evidence',applicability:'Engineering workflows',limitations:'No causal attribution',validation:'Verify current originals'},citationKeys:['original-1'],unknowns:['Applicability remains to be reviewed'],intendedImprovement:'State the evidence limitation clearly'});
/** Deterministic domain fixture, not a real eve or paid-provider acceptance claim. */
export async function learningNativeFixture(db:PoolClient,options:{baseline?:boolean}={}){
 const scope=await learningScopedFixture(db),actor=scope.actors.member,lineage=await learningAcceptedOriginal(db,actor,scope.actors.admin,scope.customerId),prior=process.env.TURAS_014_PRICE_CONTRACT;
 let baseline:null|{contributionId:string;publicationId:string}=null;
 if(options.baseline){
  const candidate=await createKnowledgeCandidate(db,actor,{idempotencyKey:randomUUID(),customerId:scope.customerId,lineage:[lineage],payload:{...learningNativeDraftOutput().proposal,title:'Synthetic original baseline practice'}});
  await submitKnowledgeCandidate(db,actor,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest});
  await decideKnowledgeCandidate(db,scope.actors.admin,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Reviewed synthetic baseline before activation',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
  baseline={contributionId:candidate.id,publicationId:(await db.query('SELECT id FROM knowledge_publications WHERE contribution_id=$1',[candidate.id])).rows[0].id};
 }
 process.env.TURAS_014_PRICE_CONTRACT=JSON.stringify({version:'learning-price-v1',modelId:'spacexai/grok-4.7',inputMicroUsdPerMillion:'8000000',outputMicroUsdPerMillion:'24000000',providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/grok-4.7',pricingCaptureDigest:'a'.repeat(64),outputContractCaptureDigest:'b'.repeat(64),verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
 await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[scope.workspaceId]);
 let id:string;
 try{id=(await prepareLearningDraft(actor,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,customerId:scope.customerId,lineage:[lineage],feedbackIds:[],question:'Draft one grounded sanitized engineering practice',budgetUsd:'25',...(baseline?{publicationId:baseline.publicationId}:{})})).targetId!;}
 finally{if(prior===undefined)delete process.env.TURAS_014_PRICE_CONTRACT;else process.env.TURAS_014_PRICE_CONTRACT=prior;}
 const meta=await learningDraftMeta(actor,id),nativeSessionId=`synthetic-native-${randomUUID()}`,turnId=`synthetic-turn-${randomUUID()}`;
 await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[meta.conversationId,nativeSessionId]);
 await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'learning-native-fixture',clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=excluded.last_seen_at",[process.env.TURAS_ENVIRONMENT_ID]);
 const native=await prepareLearningNativeAttempt(actor,meta.conversationId,nativeSessionId,meta.nativeRequestId,learningDraftPrompt,false);await claimLearningNativeDispatch(actor,meta.conversationId,native.attemptId,0);
 const event=(type:string,data:Record<string,unknown>)=>({type,meta:{id:`evt_learning_${randomUUID().replaceAll('-','')}`,at:new Date().toISOString()},data:{turnId,...data}});
 await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('message.received',{message:learningDraftPrompt}));
 const principal={principalId:actor.principalId,attributes:{turasAttemptId:native.attemptId}},identity={nativeSessionId,responseAttemptId:native.attemptId,turnId,stepIndex:0};
 await readLearningDraftInitialContext(principal,turnId,nativeSessionId);
 return {...scope,actor,lineage,meta,nativeSessionId,turnId,native,principal,identity,event,baseline};
}
