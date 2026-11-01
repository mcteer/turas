import {expect,it} from 'vitest';
import {activeTurn,foldEvents,emptySessionView,position,parts} from 'eve/events';
import {backgroundChatActivity} from '../../lib/chat-messages';
import {pendingChatInputsFromView} from '../../lib/chat-inputs';
import {replyFixture,turnFixture} from '../fixtures/eve-v27';

it('uses the installed SDK for reply ordering and preserves a user quotation of a task notice',()=>{
 const fixture=replyFixture('Checked evidence.');
 expect(fixture.snapshot.messages.map(message=>message.role)).toEqual(['user','assistant']);
 const text='Background task task_example (implementation-research) is completed.';
 fixture.commit({type:'delivery.admitted',data:{deliveryId:'quote'}},{type:'turn.started',data:{turnId:'turn_quote',cause:{deliveryId:'quote'},follows:'turn_0'}},
  {type:'delivery.consumed',scope:{turnId:'turn_quote'},data:{deliveryId:'quote',turnId:'turn_quote',parts:[{kind:'text',text}]}});
 expect(fixture.snapshot.messages.some(message=>message.role==='user'&&message.parts.some(part=>part.type==='text'&&part.text===text))).toBe(true);
});
it('tracks actual task facts rather than text matching or arbitrary elapsed time',()=>{
 const fixture=turnFixture().commit({type:'model.requested',scope:{turnId:'turn_0'},data:{runId:'run_0',owner:{turnId:'turn_0'}}})
 .commit({type:'call.requested',scope:{turnId:'turn_0',runId:'run_0'},data:{callId:'call_0',owner:{runId:'run_0'},capability:{kind:'tool',name:'customer-recon'},input:{}}},
  {type:'task.started',scope:{turnId:'turn_0'},data:{taskId:'task_0',startedBy:{callId:'call_0'},kind:'tool',name:'customer-recon'}},
  {type:'call.started',scope:{turnId:'turn_0'},data:{callId:'call_0',taskId:'task_0'}});
 expect(backgroundChatActivity(fixture.snapshot.view).thinking).toBe(true);
 fixture.commit({type:'task.ended',scope:{turnId:'turn_0'},data:{taskId:'task_0',outcome:'cancelled'}});
 expect(backgroundChatActivity(fixture.snapshot.view)).toEqual({thinking:false,admittedAt:0});
});
it('keeps a question turn open for Stop while idle and clears controls on interruption',()=>{
 const fixture=turnFixture().commit({type:'interaction.opened',scope:{turnId:'turn_0'},data:{interactionId:'question',subject:{turnId:'turn_0'},request:{kind:'question',prompt:'Choose a target',allowFreeform:true}}},
  {type:'turn.paused',scope:{turnId:'turn_0'},data:{turnId:'turn_0',awaiting:[{interactionId:'question'}]}});
 expect(fixture.snapshot.status).toBe('idle');expect(activeTurn(fixture.snapshot.view)?.turnId).toBe('turn_0');
 expect(pendingChatInputsFromView(fixture.snapshot.view)).toHaveLength(1);
 fixture.commit({type:'interaction.settled',scope:{turnId:'turn_0'},data:{interactionId:'question',outcome:'interrupted'}},
  {type:'turn.settled',scope:{turnId:'turn_0'},data:{turnId:'turn_0',outcome:'cancelled'}});
 expect(pendingChatInputsFromView(fixture.snapshot.view)).toEqual([]);expect(activeTurn(fixture.snapshot.view)).toBeUndefined();
});
it('never publishes half a commit while folding a restored source prefix',()=>{
 const fixture=replyFixture(),events=fixture.events;
 const line=events.filter(event=>event.meta.position.line===3);
 let view=foldEvents(emptySessionView(),events.filter(event=>event.meta.position.line<3));
 const before=view;view=foldEvents(view,[line[0]]);expect(position(view)).toBe(position(before));expect(parts(view)).toHaveLength(0);
 view=foldEvents(view,line.slice(1));expect(position(view)).toBeGreaterThan(position(before));expect(parts(view)).toHaveLength(1);
});
