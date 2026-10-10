import {activateLearning} from '../../scripts/learning-activate';
import {requireOwnedLearningDatabase} from '../../scripts/learning-environment';
import {readPublishedKnowledge} from '../../lib/server/knowledge/read';
import {readLearningRequest} from '../../lib/server/learning/commands';
import {withTransaction} from '../../lib/server/db/client';
import {reviewLearningEvaluationCase} from '../../lib/server/learning/evaluation-review';
import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {wrapLanguageModel} from 'ai';
import {withLearningDatabase} from '../fixtures/learning/environment';
import {learningScopedFixture,learningAcceptedOriginal} from '../fixtures/learning/setup';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate} from '../../lib/server/knowledge/service';
import {readLearningCandidate,reviewLearningCandidate} from '../../lib/server/learning/reviews';
import {prepareLearningEvaluation,prepareLearningEvaluationArm} from '../../lib/server/learning/evaluation';
import {readLearningEvaluation,readLearningEvaluationCapture} from '../../lib/server/learning/evaluation-captures';
import {learningEvaluationCatalogDigest,learningEvaluationPrompt} from '../../lib/server/learning/evaluation-context';
import {prepareLearningNativeAttempt,claimLearningNativeDispatch} from '../../lib/server/learning/native';
import {projectLearningNativeEventInTransaction} from '../../lib/server/learning/native-events';
import {readLearningDraftInitialContext} from '../../lib/server/learning/native-context';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../lib/server/staffing/native-admission';
import {wrapStaffingModel} from '../../lib/server/staffing/model-budget';
import {runLearningRead} from '../../lib/server/learning/tools';
describe('isolated sequential native learning evaluation with synthetic provider',()=>{
 it('freezes sixteen paired arms, denies tools and retries, and withholds outputs after original loss',()=>withLearningDatabase(async db=>{
  const {actors,workspaceId,customerId}=await learningScopedFixture(db),lineage=await learningAcceptedOriginal(db,actors.member,actors.admin,customerId),previous=process.env.TURAS_014_PRICE_CONTRACT;
  process.env.TURAS_014_PRICE_CONTRACT=JSON.stringify({version:'learning-price-v1',modelId:'spacexai/grok-4.7',inputMicroUsdPerMillion:'8000000',outputMicroUsdPerMillion:'24000000',providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/grok-4.7',pricingCaptureDigest:'a'.repeat(64),outputContractCaptureDigest:'b'.repeat(64),verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
  await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[workspaceId]);
  try{
   const payload={title:'Synthetic evaluated reusable practice',productVersion:'Unknown',problem:'An observed engineering concern',prerequisites:'Verify current applicability',solution:'Use independently accepted measurements',reasoning:'Ground decisions in evidence',applicability:'Reviewed engineering workflows',limitations:'No causal outcome established',validation:'Check current originals'};
   const candidate=await createKnowledgeCandidate(db,actors.member,{idempotencyKey:randomUUID(),customerId:customerId,payload,lineage:[lineage]});await submitKnowledgeCandidate(db,actors.member,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:candidate.revision,expectedDigest:candidate.digest});
   const current=await readLearningCandidate(actors.admin,candidate.id),review=await reviewLearningCandidate(actors.admin,candidate.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,revisionId:current.revisionId,contentDigest:current.digest,closureDigest:current.closureDigest,decision:'accept',rightsAttested:true,checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},rationale:'Synthetic independently reviewed rights and sanitization'});
   const prepared=await prepareLearningEvaluation(actors.admin,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,reviewId:review.targetId,baselineGeneration:null,catalogDigest:learningEvaluationCatalogDigest(),budgetUsd:'25'});
   const id=prepared.targetId!,snapshots:unknown[]=[],nativeIds:string[]=[];let calls=0;
   await expect(readLearningEvaluation(actors.partner,id)).rejects.toMatchObject({status:403});
   for(let ordinal=0;ordinal<16;ordinal++){
    const view=await readLearningEvaluation(actors.admin,id),arm=await prepareLearningEvaluationArm(actors.admin,id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version,rationale:'Continue the admitted fixed paired batch'});
    if(ordinal===0)await expect(prepareLearningEvaluationArm(actors.admin,id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version+1,rationale:'Forbidden concurrent arm'})).rejects.toMatchObject({status:409});
    const meta=(await db.query('SELECT a.*,c.creation_operation_id FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1',[arm.targetId])).rows[0],nativeSessionId=`learning-evaluation-${randomUUID()}`,turnId=`turn-${randomUUID()}`;nativeIds.push(nativeSessionId);
    await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[meta.conversation_id,nativeSessionId]);await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'learning-evaluation-fixture',clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=excluded.last_seen_at",[process.env.TURAS_ENVIRONMENT_ID]);
    const native=await prepareLearningNativeAttempt(actors.admin,meta.conversation_id,nativeSessionId,meta.native_request_id,learningEvaluationPrompt,false);await claimLearningNativeDispatch(actors.admin,meta.conversation_id,native.attemptId,0);
    const event=(type:string,data:Record<string,unknown>)=>({type,meta:{id:`evt_learning_${randomUUID().replaceAll('-','')}`,at:new Date().toISOString()},data:{turnId,...data}});
    await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('message.received',{message:learningEvaluationPrompt}));
    const principal={principalId:actors.admin.principalId,attributes:{turasAttemptId:native.attemptId}},identity={nativeSessionId,responseAttemptId:native.attemptId,turnId,stepIndex:0};
    const snapshot=await readLearningDraftInitialContext(principal,turnId,nativeSessionId);snapshots.push(snapshot);expect(JSON.stringify(snapshot)).not.toContain('Explicit synthetic permission');expect(JSON.stringify(snapshot)).not.toContain('expected');
    await expect(runLearningRead(principal,'learning_summary',{},randomUUID())).rejects.toMatchObject({status:404});
    const admitted=await admitGovernedStaffingModelStep(principal,identity),output={kind:'abstain',text:'Synthetic bounded evaluation response',citationKeys:[],unknowns:['Applicability remains unverified']};
    const model={specificationVersion:'v4',provider:'synthetic',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async(params:{tools?:unknown[]})=>{calls++;expect(params.tools).toEqual([]);return {content:[{type:'text',text:JSON.stringify(output)}],finishReason:'stop',usage:{inputTokens:{total:100},outputTokens:{total:200}},providerMetadata:{gateway:{cost:'0.001',generationId:`synthetic-evaluation-${ordinal}`}},warnings:[]};}} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
    const wrapped=wrapStaffingModel(model,admitted.mode,{deadlineAt:admitted.deadlineAt,beforeProvider:()=>assertGovernedStaffingProviderRelease(principal,identity)});await wrapped.doGenerate({prompt:[]});await expect(wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({status:409});
    await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('message.completed',{message:JSON.stringify(output),finishReason:'stop'}));await projectLearningNativeEventInTransaction(db,nativeSessionId,native.attemptId,event('turn.completed',{}));
   }
   expect(calls).toBe(16);expect(new Set(nativeIds).size).toBe(16);for(let i=0;i<16;i+=2){const {practice:_a,noBaseline:_b,...baseline}=snapshots[i] as Record<string,unknown>,{practice:_c,noBaseline:_d,...candidate}=snapshots[i+1] as Record<string,unknown>;expect(candidate).toEqual(baseline);}
   const completed=await readLearningEvaluation(actors.admin,id);expect(completed.state).toBe('awaiting_review');expect(completed.cases.every(c=>c.arms.every(a=>a.state==='completed'&&'outputDigest' in a))).toBe(true);for(const c of completed.cases)for(const a of c.arms)expect((await readLearningEvaluationCapture(actors.admin,id,c.id,a.purpose)).arm).toHaveProperty('output');expect(completed.budget.chargedMicroUsd).toBe('16000');expect(completed.budget.unknownReservations).toBe(0);
   for(const caseId of completed.cases.map(c=>c.id)){
    const view=await readLearningEvaluation(actors.admin,id),pair=view.cases.find(c=>c.id===caseId)!,baseline=pair.arms[0],candidate=pair.arms[1];
    if(!('outputDigest' in baseline)||!('outputDigest' in candidate))throw Error('Both synthetic captures required');
    const grading={contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version,caseId,baselineCaptureDigest:baseline.outputDigest,candidateCaptureDigest:candidate.outputDigest,baseline:{fidelity:2,applicability:2,unknownHandling:2,usefulness:1},candidate:{fidelity:2,applicability:2,unknownHandling:2,usefulness:2},safetyPassed:true,citationPassed:true,authorityPassed:true,rationale:'Synthetic human-review contract fixture; does not evaluate real model quality'};
    if(caseId==='E01')await expect(reviewLearningEvaluationCase(actors.admin,id,{...grading,candidateCaptureDigest:'a'.repeat(64)})).rejects.toMatchObject({status:409});
    const reviewed=await reviewLearningEvaluationCase(actors.admin,id,grading);
    expect((await reviewLearningEvaluationCase(actors.admin,id,grading)).targetId).toBe(reviewed.targetId);
   }
   expect((await readLearningEvaluation(actors.admin,id)).state).toBe('passed');
   await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,workspaceId,true,requireOwnedLearningDatabase(process.env,true));
   const publish={idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:current.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Synthetic final evaluated release',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},learningEvaluationId:id,learningReviewId:review.targetId,expectedBaselineGeneration:null};
   await expect(withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,{...publish,learningEvaluationId:undefined}))).rejects.toMatchObject({status:409});
   const abandoned=randomUUID();await readLearningRequest(actors.admin,abandoned,true);
   await expect(withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,{...publish,idempotencyKey:abandoned}))).rejects.toMatchObject({status:410});
   const decision=await withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,publish));
   expect(await readLearningRequest(actors.admin,publish.idempotencyKey)).toMatchObject({outcome:'committed',targetId:decision.decisionId,action:'release.publish'});
   const simultaneous=await Promise.all([withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,publish)),withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,publish))]);expect(simultaneous.every(result=>result.replayed&&result.decisionId===decision.decisionId)).toBe(true);
   const head=(await db.query('SELECT id FROM knowledge_publications WHERE contribution_id=$1',[candidate.id])).rows[0];
   expect((await readPublishedKnowledge(db,actors.partner,head.id)).payload.title).toBe(payload.title);
   await db.query('UPDATE memberships SET active=false WHERE id=ANY($1::uuid[])',[ [actors.member.membershipId,actors.admin.membershipId] ]);
   expect((await readPublishedKnowledge(db,actors.partner,head.id)).payload.title).toBe(payload.title);
   await db.query('UPDATE memberships SET active=true WHERE id=ANY($1::uuid[])',[ [actors.member.membershipId,actors.admin.membershipId] ]);
   expect((await withTransaction(client=>decideKnowledgeCandidate(client,actors.admin,candidate.id,publish))).replayed).toBe(true);

   await db.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1",[lineage.sourceRevisionId]);const lost=await readLearningEvaluation(actors.admin,id);expect(lost.bodyAvailable).toBe(false);await expect(readPublishedKnowledge(db,actors.partner,head.id)).rejects.toMatchObject({status:404});expect(lost.cases.every(c=>c.arms.every(a=>!('output' in a)))).toBe(true);
  }finally{if(previous===undefined)delete process.env.TURAS_014_PRICE_CONTRACT;else process.env.TURAS_014_PRICE_CONTRACT=previous;await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[workspaceId]);}
 }));
});
