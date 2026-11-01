import {expect,it} from 'vitest';
import {emptySessionView,foldEvents,position} from 'eve/events';
import {projectEveEvents,projectEveFact} from '../../lib/server/conversations/eve-events';
import {completeReplayWindow,nextNativeIndex} from '../../lib/server/conversations/replay-window';
import {replyFixture,turnFixture,fixtureAt} from '../fixtures/eve-v27';

it('settles a model from its complete commit including later usage, with stable scoped event identities',()=>{
 const fixture=replyFixture(),view=fixture.snapshot.view;
 const events=projectEveEvents('wrun_synthetic',fixture.events,view),step=events.find(item=>item.event.type==='step.completed')!;
 expect(step.event.data).toMatchObject({turnId:'turn_0',stepIndex:0,usage:{inputTokens:12,outputTokens:4,costUsd:0.001}});
 expect(step.event.meta.id).toMatch(/^evt_[a-f0-9]{64}$/);
 expect(new Set(events.map(item=>item.event.meta.id)).size).toBe(events.length);
 expect(projectEveEvents('wrun_synthetic',fixture.events,view)).toEqual(events);
 expect(projectEveEvents('wrun_another',fixture.events,view)[0].event.meta.id).not.toBe(events[0].event.meta.id);
 expect(completeReplayWindow(events,0)).toBe(true);
});
it('does not manufacture known zero cost when a provider reports no cost',()=>{
 const fixture=replyFixture(),events=fixture.events.map(event=>event.type==='usage.recorded'?{...event,data:{...event.data,usage:{inputTokens:12,outputTokens:4,cacheReadTokens:0,cacheWriteTokens:0}}}:event);
 const view=foldEvents(emptySessionView(),events),step=projectEveEvents('wrun_synthetic',events,view).find(item=>item.event.type==='step.completed')!;
 expect(step.event.data?.usage).not.toHaveProperty('costUsd');
});
it.each(['interrupted','withdrawn','expired','failed','abandoned','invalid'] as const)('never turns %s into a human approval',outcome=>{
 const fixture=turnFixture().commit({type:'interaction.opened',scope:{turnId:'turn_0'},data:{interactionId:'held',subject:{turnId:'turn_0'},request:{kind:'approval',prompt:'Publish exact revision?'}}})
 .commit({type:'interaction.settled',scope:{turnId:'turn_0'},data:{interactionId:'held',outcome}});
 const projected=projectEveEvents('wrun_synthetic',fixture.events,fixture.snapshot.view),resolved=projected.find(item=>item.event.type==='input.resolved')!;
 expect(resolved.event.data?.resolutions).toEqual([{requestId:'held',kind:'tool-approval',outcome:'dismissed',nativeOutcome:outcome}]);
 expect(projected.some(item=>item.event.type==='approval.settled')).toBe(false);
});
it('preserves a declined budget as denial, never an answered question',()=>{
 const fixture=turnFixture().commit({type:'interaction.opened',scope:{turnId:'turn_0'},data:{interactionId:'budget',subject:{turnId:'turn_0'},request:{kind:'budget',prompt:'Continue?'}}})
 .commit({type:'interaction.settled',scope:{turnId:'turn_0'},data:{interactionId:'budget',outcome:'declined'}});
 expect(projectEveEvents('wrun_synthetic',fixture.events,fixture.snapshot.view).find(item=>item.event.type==='input.resolved')?.event.data?.resolutions).toEqual([{requestId:'budget',kind:'session-limit',outcome:'denied',nativeOutcome:'declined'}]);
});
it('retains the same line cursor on a mid-commit stopping boundary and rejects partial intermediate lines',()=>{
 const fixture=replyFixture(),events=projectEveEvents('wrun_synthetic',fixture.events,fixture.snapshot.view),line=events.filter(item=>item.index===3);
 expect(nextNativeIndex(line[0])).toBe(3);expect(nextNativeIndex(line.at(-1)!)).toBe(4);
 expect(completeReplayWindow([line[0],...events.filter(item=>item.index===4)],3)).toBe(false);
 expect(completeReplayWindow(line.slice(0,1),3)).toBe(false);
 expect(completeReplayWindow(line,3)).toBe(true);
});
it('skips withheld content and leaves the committed source cursor unchanged until a line completes',()=>{
 const fixture=turnFixture(),view=fixture.snapshot.view;
 const event={type:'content.completed' as const,scope:{turnId:'turn_0',runId:'run_0'},data:{partId:'withheld',runId:'run_0',kind:'text' as const,phase:'reply' as const,valueRef:{withheld:true as const}}};
 expect(projectEveFact('wrun_synthetic',event,{line:1,index:0},fixtureAt,view).type).toBe('native.observed');
 const pending=foldEvents(view,[{...event,meta:{at:fixtureAt,position:{line:1,index:0},endOfLine:false}}]);
 expect(position(pending)).toBe(position(view));
});

it('does not project answer-only deliveries as a second user message',()=>{
 const fixture=turnFixture();
 const event={type:'delivery.consumed' as const,scope:{turnId:'turn_0'},data:{deliveryId:'answer_only',turnId:'turn_0',parts:[]}};
 expect(projectEveFact('wrun_synthetic',event,{line:1,index:0},fixtureAt,fixture.snapshot.view).type).toBe('native.observed');
});

it('retains the trusted tool-call discriminator for composer question routing',()=>{
 const scope={turnId:'turn_0',runId:'run_0'};
 const fixture=turnFixture().commit({type:'model.requested',scope,data:{runId:'run_0',owner:{turnId:'turn_0'}}})
 .commit({type:'call.requested',scope,data:{callId:'ask',owner:{runId:'run_0'},capability:{kind:'tool',name:'ask_question'},input:{question:'Choose a display'}}},
  {type:'call.started',scope,data:{callId:'ask'}},
  {type:'interaction.opened',scope,data:{interactionId:'question',subject:{callId:'ask'},request:{kind:'question',prompt:'Choose a display'}}});
 const requested=projectEveEvents('wrun_synthetic',fixture.events,fixture.snapshot.view).find(item=>item.event.type==='input.requested');
 expect(requested?.event.data?.requests).toMatchObject([{action:{kind:'tool-call',callId:'ask',toolName:'ask_question'}}]);
});
