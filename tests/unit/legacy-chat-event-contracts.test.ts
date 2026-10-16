import { test } from 'vitest';
import assert from 'node:assert/strict';
import { defaultMessageReducer } from 'eve/react';
import type { MessageStreamEvent } from 'eve/client';
import type { EveMessage } from 'eve/react';
import { backgroundChatActivity as activityProjection, visibleChatMessages as messageProjection } from '../../lib/chat-messages';
// Legacy raw-event compatibility contract, including historical receipt shapes.
// Cast only at the raw-wire fixture boundary; exercise the real installed reducer.
const backgroundChatActivity=(events:readonly unknown[],now:number)=>activityProjection(events as MessageStreamEvent[],now);
const visibleChatMessages=(messages:readonly EveMessage[],events:readonly unknown[])=>messageProjection(messages,events as MessageStreamEvent[]);
const text=(message:EveMessage)=>message.parts.filter(part=>part.type==='text').map(part=>part.text).join('');
const meta={id:'fixture-event',at:'2026-09-20T16:00:00.000Z'};
const notice='Background task task_fixture (implementation-research) is completed.\n\nResult:\n{"status":"incomplete","reference":{"researchId":"fixture-private-reference"}}';
const admitted={type:'subagent.completed',meta,data:{callId:'fixture-call',subagentName:'implementation-research',output:'Working',backgroundTask:{taskId:'task_fixture',status:'working'}}};
const received=(turnId:string,message:string,deliveryIds?:string[])=>({type:'message.received',meta:{...meta,id:`received-${turnId}`,...(deliveryIds?{deliveryIds}:{})},data:{turnId,sequence:0,message}});
function project(events:readonly unknown[]){const reducer=defaultMessageReducer();let state=reducer.initial();for(const event of events)state=reducer.reduce(state,event as MessageStreamEvent);return state.messages;}
test('hide only correlated internal completion messages while retaining the final answer and raw events',()=>{
 const events=[received('user-turn','Research the proposal',['delivery-1']),admitted,received('completion-turn',notice),{type:'message.completed',meta,data:{turnId:'completion-turn',sequence:1,stepIndex:0,message:'Evidence needs review.',finishReason:'stop'}}];
 const original=JSON.stringify(events);
 assert.deepEqual(visibleChatMessages(project(events),events).map(m=>m.role),['user','assistant']);
 assert.equal(JSON.stringify(events),original);
 assert.equal(visibleChatMessages(project(events.slice(0,3)),events.slice(0,3)).length,1);
});
test('keep user quotations, optimistic messages and unmatched task text visible',()=>{
 const events=[admitted,received('quote',notice,['delivery-2']),received('unmatched',notice.replace('task_fixture','task_unknown')),received('ordinary','Please inspect my background task.'),{type:'client.message.submitted',data:{submissionId:'optimistic',message:notice}}];
 const messages=project(events);
 assert.equal(visibleChatMessages(messages,events).length,messages.length);
});
test('replace correlated internal failure with a visible status, without changing approval or user text',()=>{
 const failure='Background task task_fixture (implementation-research) failed.\n\nError: {"code":"SUBAGENT_EXECUTION_FAILED","message":"The agent invocation was cancelled."}';
 const events=[admitted,received('failed-turn',failure),received('user-quote',failure,['delivery-3'])];
 const original=JSON.stringify(events);
 const messages=visibleChatMessages(project(events),events);
 assert.equal(messages.length,2);
 assert.equal(messages[0].role,'assistant');
 assert.match(text(messages[0]),/stopped before a result was handed back/);
 assert.doesNotMatch(text(messages[0]),/task_fixture|SUBAGENT_EXECUTION_FAILED/);
 assert.equal(messages[1].role,'user');
 assert.equal(text(messages[1]),failure);
 assert.equal(JSON.stringify(events),original);
});

const observedAt=Date.parse(meta.at)+1000;
const activity=(events:readonly unknown[])=>backgroundChatActivity(events,observedAt);
test('thinking survives the initial reply and ends only after the task handoff turn settles',()=>{
 const initial=[admitted,{type:'message.completed',meta,data:{turnId:'initial',message:'Research is underway.'}},{type:'turn.completed',meta,data:{turnId:'initial'}}];
 assert.equal(activity(initial).thinking,true);
 const handoff=[...initial,received('completion',notice)];
 assert.equal(activity(handoff).thinking,true);
 assert.equal(activity([...handoff,{type:'turn.completed',meta,data:{turnId:'unrelated'}}]).thinking,true);
 assert.deepEqual(activity([...handoff,{type:'turn.completed',meta,data:{turnId:'completion'}}]),{thinking:false,admittedAt:0});
});
test('failed or cancelled tasks stop thinking but continue catch-up for the parent explanation',()=>{
 for(const outcome of ['failed','is cancelled','cancelled']){
  const events=[admitted,received('failure',`Background task task_fixture (implementation-research) ${outcome}.\nDetails`)];
  assert.equal(activity(events).thinking,false);
  assert.ok(activity(events).admittedAt>0);
  assert.equal(activity([...events,{type:'turn.completed',meta,data:{turnId:'failure'}}]).admittedAt,0);
 }
 // Eve keeps admitted tasks alive when only their initiating turn is cancelled.
 assert.equal(activity([admitted,{type:'turn.cancelled',meta,data:{turnId:'initial'}}]).thinking,true);
});
test('quoted notices cannot end real work; multiple tasks and stale histories remain distinct',()=>{
 assert.equal(activity([admitted,received('user',notice,['real-delivery']),{type:'turn.completed',meta,data:{turnId:'user'}}]).thinking,true);
 const other={...admitted,data:{...admitted.data,backgroundTask:{taskId:'task_other',status:'working'}}};
 const events=[admitted,other,received('completion',notice),{type:'turn.completed',meta,data:{turnId:'completion'}}];
 assert.equal(activity(events).thinking,true);
 for(const type of ['session.failed','session.completed'])assert.deepEqual(activity([...events,{type,meta,data:{}}]),{thinking:false,admittedAt:0});
 assert.deepEqual(backgroundChatActivity([admitted],Date.parse(meta.at)+600001),{thinking:false,admittedAt:0});
 assert.deepEqual(activity([]),{thinking:false,admittedAt:0});
});
