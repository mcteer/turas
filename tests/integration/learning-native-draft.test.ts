import {it,expect} from 'vitest';
import type {wrapLanguageModel} from 'ai';
import {withLearningDatabase} from '../fixtures/learning/environment';
import {learningNativeFixture,learningNativeDraftOutput} from '../fixtures/learning/native';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../lib/server/staffing/native-admission';
import {wrapStaffingModel} from '../../lib/server/staffing/model-budget';
import {readLearningDraft,saveLearningDraft} from '../../lib/server/learning/drafts';
import {readLearningRequest} from '../../lib/server/learning/commands';
import {cancelLearningDraft,learningDraftMeta} from '../../lib/server/learning/advisory';
import {projectLearningNativeEventInTransaction} from '../../lib/server/learning/native-events';
import {randomUUID} from 'node:crypto';
it('rechecks original eligibility immediately before the durable provider claim',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db);await admitGovernedStaffingModelStep(f.principal,f.identity);
 await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[f.lineage.sourceRevisionId]);
 await expect(assertGovernedStaffingProviderRelease(f.principal,f.identity)).rejects.toMatchObject({status:404});
 expect((await db.query('SELECT count(*)::int n FROM learning_model_dispatches d JOIN learning_budget_reservations r ON r.id=d.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
 await expect(readLearningDraft(f.actor,f.meta.id)).rejects.toBeDefined();
}));
it('preserves durable cancellation against late output and redacts native history projections',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db),meta=await learningDraftMeta(f.actor,f.meta.id);
 await cancelLearningDraft(f.actor,f.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:meta.version,rationale:'Explicit synthetic operator cancellation'});
 await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,f.event('message.completed',{message:'PRIVATE_SYNTHETIC_LATE_MODEL_BODY',finishReason:'stop'}));
 await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,f.event('turn.completed',{}));
 expect((await db.query('SELECT state FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].state).toBe('cancelled');
 expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.native.attemptId])).rows[0].response_state).toBe('cancelled');
 expect((await db.query("SELECT count(*)::int n FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='output'",[f.meta.id])).rows[0].n).toBe(0);
 expect((await db.query('SELECT visible_payload FROM event_projections WHERE conversation_id=$1',[f.meta.conversationId])).rows.every(row=>JSON.stringify(row.visible_payload)==='{}')).toBe(true);
}));
it('rejects changed native event position under a retained event identity',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db),event=f.event('step.started',{stepIndex:0});
 await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,event,1);
 await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,event,1);
 await expect(projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,event,2)).rejects.toMatchObject({status:404});
 await expect(projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,{...event,data:{...event.data,stepIndex:1}},1)).rejects.toMatchObject({status:404});
 await expect(projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,{...event,data:{...event.data,message:'Changed event content'}},1)).rejects.toMatchObject({status:404});
}));
it('rechecks current actor authority before any provider invocation',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db);await admitGovernedStaffingModelStep(f.principal,f.identity);
 await db.query("UPDATE memberships SET kind='partner',role='member',partner_org_id=(SELECT id FROM partner_organizations WHERE workspace_id=memberships.workspace_id LIMIT 1),revision=revision+1 WHERE id=$1",[f.actor.membershipId]);
 await expect(assertGovernedStaffingProviderRelease(f.principal,f.identity)).rejects.toBeDefined();
 expect((await db.query('SELECT count(*)::int n FROM learning_model_dispatches d JOIN learning_budget_reservations r ON r.id=d.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
}));
it('holds unknown cost after one invocation and never retries the uncertain call',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db),admitted=await admitGovernedStaffingModelStep(f.principal,f.identity);let invoked=0;
 const model={specificationVersion:'v4',provider:'synthetic',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async()=>{invoked++;return {content:[{type:'text',text:'Unconfirmed synthetic output'}],finishReason:'stop',usage:{inputTokens:{total:100},outputTokens:{total:100}},warnings:[]};}} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
 const wrapped=wrapStaffingModel(model,admitted.mode,{deadlineAt:admitted.deadlineAt,beforeProvider:()=>assertGovernedStaffingProviderRelease(f.principal,f.identity)});
 await expect(wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'accounting_unknown'});await expect(wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});expect(invoked).toBe(1);
 expect((await db.query('SELECT state FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].state).toBe('unconfirmed');
 expect((await db.query('SELECT count(*)::int n FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
 await expect(readLearningDraft(f.actor,f.meta.id)).rejects.toMatchObject({status:404});
}));
it('saves a selected baseline improvement as one new private revision while preserving publication',()=>withLearningDatabase(async db=>{
 const f=await learningNativeFixture(db,{baseline:true}),admitted=await admitGovernedStaffingModelStep(f.principal,f.identity),output=learningNativeDraftOutput();
 const model={specificationVersion:'v4',provider:'synthetic',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async()=>({content:[{type:'text',text:JSON.stringify(output)}],finishReason:'stop',usage:{inputTokens:{total:100},outputTokens:{total:200}},providerMetadata:{gateway:{cost:'0.001',generationId:`synthetic-${randomUUID()}`}},warnings:[]})} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
 await wrapStaffingModel(model,admitted.mode,{deadlineAt:admitted.deadlineAt,beforeProvider:()=>assertGovernedStaffingProviderRelease(f.principal,f.identity)}).doGenerate({prompt:[]});
 await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,f.event('message.completed',{message:JSON.stringify(output),finishReason:'stop'}));await projectLearningNativeEventInTransaction(db,f.nativeSessionId,f.native.attemptId,f.event('turn.completed',{}));
 const captured=await readLearningDraft(f.actor,f.meta.id),input={contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:captured.version,outputDigest:captured.outputDigest,proposalIndex:0,payload:output.proposal};
 const saved=await saveLearningDraft(f.actor,f.meta.id,input);expect(saved).toMatchObject({targetId:f.baseline!.contributionId,version:2});expect((await saveLearningDraft(f.actor,f.meta.id,{...input,requestId:randomUUID()})).version).toBe(2);expect((await readLearningRequest(f.actor,input.requestId)).targetId).toBe(f.baseline!.contributionId);
 expect((await db.query('SELECT state,current_revision_number FROM knowledge_contributions WHERE id=$1',[saved.targetId])).rows[0]).toMatchObject({state:'draft',current_revision_number:2});expect((await db.query('SELECT state,head_generation FROM knowledge_publications WHERE id=$1',[f.baseline!.publicationId])).rows[0]).toMatchObject({state:'published',head_generation:'1'});
 const context=(await db.query("SELECT content FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='context'",[f.meta.id])).rows[0].content;expect(context.snapshot.evidence[0]).toHaveProperty('quality');expect(context.snapshot.evidence[0].dates.observationAt).toBeNull();
}));
