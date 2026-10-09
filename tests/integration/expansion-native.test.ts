import {wrapExpansionModel} from '../../lib/server/expansion/model-budget';
import {beforeAll,describe,it,expect} from 'vitest';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {startExpansionNative} from '../fixtures/expansion/native';
import {acceptedExpansionEvidence} from '../fixtures/expansion/evidence';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {readExpansionInitialContext} from '../../lib/server/expansion/native';
import {admitGovernedModelStep,assertGovernedProviderRelease} from '../../lib/server/conversations/model-admission';
import {runExpansionRead} from '../../lib/server/expansion/tools';
import {getOwnedConversationDetail} from '../../lib/server/conversations/repository';
import {boundToolActor} from '../../lib/server/profiles/tool-actor';
import {withTransaction} from '../../lib/server/db/client';
import type {CurrentSession} from '../../lib/server/auth/sessions';
const zero={contractVersion:'expansion-advice-v1',summary:'No selected observation establishes a need.',facts:[],unknowns:[{text:'Customer need',reason:'No reviewed observation selected'}],discoverySteps:[{action:'Ask the operating owner',validationCriterion:'Record a reviewed need'}],proposals:[]};
describe('Expansion governed native domain paths',()=>{
 let actor:CurrentSession,other:CurrentSession;
 beforeAll(async()=>{({actor,other}=await withExpansionDatabase(async db=>({actor:await createProfileTestSession(db,'panel'),other:await createProfileTestSession(db,'mcteer')})));});
 it('requires exact injection, persists paid admission, denies SDK retries and enforces the six-step/read boundaries',async()=>{
  const f=await startExpansionNative(actor);
  await expect(admitGovernedModelStep(f.principal,f.identity)).rejects.toMatchObject({code:'expansion_context_changed'});
  expect(await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId)).toMatchObject({question:'What should the operating owner validate?',evidence:[],hypotheses:[]});
  expect((await admitGovernedModelStep(f.principal,f.identity)).mode).toBe('expansion');await assertGovernedProviderRelease(f.principal,f.identity);
  await expect(admitGovernedModelStep(f.principal,f.identity)).rejects.toMatchObject({code:'expansion_step_uncertain'});
  for(let stepIndex=1;stepIndex<6;stepIndex++)await admitGovernedModelStep(f.principal,{...f.identity,stepIndex});
  await expect(admitGovernedModelStep(f.principal,{...f.identity,stepIndex:6})).rejects.toMatchObject({code:'expansion_step_budget'});
  const result=await runExpansionRead(f.principal,'expansion_summary',{},'summary-0');expect(await runExpansionRead(f.principal,'expansion_summary',{},'summary-0')).toEqual(result);
  for(let index=1;index<6;index++)await runExpansionRead(f.principal,'expansion_summary',{},`summary-${index}`);
  await expect(runExpansionRead(f.principal,'expansion_summary',{},'summary-over')).rejects.toMatchObject({code:'expansion_read_budget'});
  await expect(withTransaction(db=>boundToolActor(db,f.principal))).rejects.toMatchObject({code:'expansion_tool_denied'});
 });
 it('releases only validated final output, preserves zero-proposal discovery and keeps conversations private',async()=>{
  const f=await startExpansionNative(actor);await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);await admitGovernedModelStep(f.principal,f.identity);
  await f.event('message.appended',{text:'Private partial model prose'});
  const partials=await withExpansionDatabase(db=>db.query("SELECT visible_payload FROM event_projections WHERE conversation_id=$1 AND event_type='message.appended'",[f.conversationId]));expect(partials.rows).toEqual([]);
  await f.event('message.completed',{message:JSON.stringify(zero),finishReason:'stop'});await f.event('step.completed',{stepIndex:0,usage:{inputTokens:10,outputTokens:20}});await f.event('turn.completed');
  const detail=await getOwnedConversationDetail(actor,f.conversationId);expect(detail.history.find(item=>item.eventType==='message.completed')?.payload).toMatchObject({message:JSON.stringify(zero)});
  await expect(getOwnedConversationDetail(other,f.conversationId)).rejects.toMatchObject({status:404});
  expect((await withExpansionDatabase(db=>db.query('SELECT state,output_digest FROM expansion_advice_attempts WHERE id=$1',[f.attemptId]))).rows[0]).toMatchObject({state:'completed',output_digest:expect.any(String)});
 });
 it('never persists structurally valid prose rejected by current factual-evidence checks',async()=>{
  const evidence=await acceptedExpansionEvidence(actor,other,DEMO_IDS.sharedCustomer,null,'Historical capability requires fresh verification','synthetic-candidate','product_capability',{observedAt:new Date(Date.now()-400*86400000).toISOString(),state:'planned'});
  const f=await startExpansionNative(actor,[evidence.reference]);
  await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);await admitGovernedModelStep(f.principal,f.identity);
  const rejected={...zero,facts:[{classification:'accepted_fact',statement:'Rejected stale capability must never be retained as current factual advice.',citationKeys:[evidence.reference.id]}]};
  await f.event('message.completed',{message:JSON.stringify(rejected),finishReason:'stop'});
  await f.event('step.completed',{stepIndex:0,usage:{inputTokens:10,outputTokens:20}});
  const stored=await withExpansionDatabase(async db=>({attempt:(await db.query('SELECT state,failure_code,output_digest FROM expansion_advice_attempts WHERE id=$1',[f.attemptId])).rows[0],payloads:(await db.query("SELECT payload FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='output'",[f.attemptId])).rows,events:(await db.query("SELECT visible_payload FROM event_projections WHERE conversation_id=$1 AND event_type='message.completed'",[f.conversationId])).rows}));
  expect(stored.attempt).toMatchObject({state:'failed',failure_code:'invalid_advice',output_digest:null});
  expect(stored.payloads).toEqual([]);expect(stored.events).toEqual([{visible_payload:{code:'invalid_advice'}}]);
 });
 it('terminalizes malformed final output and denies a paid repair',async()=>{
  const f=await startExpansionNative(actor);await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);await admitGovernedModelStep(f.principal,f.identity);
  await f.event('message.completed',{message:JSON.stringify({...zero,qualification:'qualified'}),finishReason:'stop'});
  await expect(admitGovernedModelStep(f.principal,{...f.identity,stepIndex:1})).rejects.toMatchObject({code:'expansion_advice_unavailable'});
  expect((await withExpansionDatabase(db=>db.query('SELECT state,failure_code FROM expansion_advice_attempts WHERE id=$1',[f.attemptId]))).rows[0]).toMatchObject({state:'failed',failure_code:'invalid_advice'});
  expect(Number((await withExpansionDatabase(db=>db.query("SELECT count(*) AS n FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='output'",[f.attemptId]))).rows[0].n)).toBe(0);
 });
 it('withholds an over-limit provider result and preserves actual usage when the framework reports failure without usage',async()=>{
  const f=await startExpansionNative(actor);await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);
  const admitted=await admitGovernedModelStep(f.principal,f.identity);if(admitted.mode!=='expansion')throw Error('Expected expansion admission');
  const model={specificationVersion:'v4',provider:'synthetic',modelId:'synthetic',supportedUrls:{},doGenerate:async()=>({
   content:[{type:'text',text:JSON.stringify(zero)}],finishReason:'stop',usage:{inputTokens:{total:100},outputTokens:{total:8193}},warnings:[]
  })} as unknown as Parameters<typeof wrapExpansionModel>[0];
  const wrapped=wrapExpansionModel(model,{deadlineAt:admitted.deadlineAt,beforeProvider:()=>assertGovernedProviderRelease(f.principal,f.identity)});
  await expect(wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'expansion_output_budget'});
  await f.event('step.failed',{stepIndex:0});
  const stored=await withExpansionDatabase(async db=>({attempt:(await db.query('SELECT state,failure_code,output_digest FROM expansion_advice_attempts WHERE id=$1',[f.attemptId])).rows[0],
   usage:(await db.query('SELECT u.outcome,u.input_tokens,u.output_tokens,u.native_event_id FROM expansion_advice_usage u JOIN expansion_model_step_receipts s ON s.id=u.step_id WHERE s.attempt_id=$1',[f.attemptId])).rows,
   payloads:(await db.query("SELECT 1 FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='output'",[f.attemptId])).rows}));
  expect(stored.attempt).toMatchObject({state:'failed',failure_code:'expansion_output_budget',output_digest:null});expect(stored.payloads).toEqual([]);
  expect(stored.usage).toHaveLength(1);expect(stored.usage[0]).toMatchObject({outcome:'failed',native_event_id:null});
  expect(Number(stored.usage[0].input_tokens)).toBe(100);expect(Number(stored.usage[0].output_tokens)).toBe(8193);
  await expect(admitGovernedModelStep(f.principal,{...f.identity,stepIndex:1})).rejects.toMatchObject({code:'expansion_advice_unavailable'});
 });

});
