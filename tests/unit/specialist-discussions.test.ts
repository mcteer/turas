import {describe,expect,it} from 'vitest';
import {remainingSpecialistAllowance,assertSpecialistReservation} from '../../lib/server/research/specialists/discussion-budget';
const limit={inputTokens:100,outputTokens:100,microUsd:100};
const first={id:'first',ceiling:{inputTokens:40,outputTokens:40,microUsd:40},actual:null};
describe('cumulative specialist allowance',()=>{
 it('retains unknown usage across later assignments',()=>{
  expect(remainingSpecialistAllowance(limit,[first])).toEqual({inputTokens:60,outputTokens:60,microUsd:60});
  expect(()=>assertSpecialistReservation(limit,[first],{inputTokens:1,outputTokens:1,microUsd:61})).toThrow();
 });
 it('uses measured usage only with a complete valid receipt',()=>{
  expect(remainingSpecialistAllowance(limit,[{...first,actual:{inputTokens:10,outputTokens:20,microUsd:30}}])).toEqual({inputTokens:90,outputTokens:80,microUsd:70});
  expect(()=>remainingSpecialistAllowance(limit,[{...first,actual:{inputTokens:10,outputTokens:20,microUsd:41}}])).toThrow();
 });
 it('rejects duplicate operation ownership and invalid quantities',()=>{
  expect(()=>remainingSpecialistAllowance(limit,[first,first])).toThrow();
  expect(()=>assertSpecialistReservation(limit,[],{inputTokens:1,outputTokens:1,microUsd:NaN})).toThrow();
 });
 it('cannot reset earlier charges for a follow-up',()=>{
  const second={...first,id:'second'};
  expect(remainingSpecialistAllowance(limit,[first,second]).microUsd).toBe(20);
  expect(()=>assertSpecialistReservation(limit,[first,second],first.ceiling)).toThrow();
 });
});

describe('fixed discussion authority',()=>{
 it('does not renew expiry for later calls or admit stopped work',async()=>{
  const {requireOpenDiscussion}=await import('../../lib/server/research/specialists/discussions');
  const now=new Date('2026-11-01T00:00:00Z');
  const row={kind:'solution',state:'open',expires_at:new Date(now.getTime()+1)} as Parameters<typeof requireOpenDiscussion>[0];
  expect(()=>requireOpenDiscussion(row,'solution',now)).not.toThrow();
  expect(()=>requireOpenDiscussion(row,'solution',new Date(now.getTime()+1))).toThrow();
  expect(()=>requireOpenDiscussion({...row,state:'stopping'},'solution',now)).toThrow();
  expect(()=>requireOpenDiscussion(row,'customer-update',now)).toThrow();
  expect(()=>requireOpenDiscussion({...row,expires_at:new Date(NaN)},'solution',now)).toThrow();
 });
});

it('associates a pending specialist question with its native task without deriving progress from text',async()=>{
 const {turnFixture}=await import('../fixtures/eve-v27');
 const {openInteractions}=await import('eve/events');
 const fixture=turnFixture().commit({type:'model.requested',scope:{turnId:'turn_0'},data:{runId:'run-specialist',owner:{turnId:'turn_0'}}})
  .commit({type:'call.requested',scope:{turnId:'turn_0'},data:{callId:'call-specialist',owner:{runId:'run-specialist'},capability:{kind:'tool',name:'customer-recon'},input:{}}},
   {type:'task.started',scope:{turnId:'turn_0'},data:{taskId:'task-specialist',startedBy:{callId:'call-specialist'},kind:'tool',name:'customer-recon'}},
   {type:'call.started',scope:{turnId:'turn_0'},data:{callId:'call-specialist',taskId:'task-specialist'}})
  .commit({type:'interaction.opened',scope:{turnId:'turn_0'},data:{interactionId:'private-question',subject:{callId:'call-specialist'},request:{kind:'question',prompt:'Synthetic private specialist question',allowFreeform:true}}});
 expect(openInteractions(fixture.snapshot.view)).toMatchObject([{taskId:'task-specialist'}]);
 fixture.commit({type:'interaction.settled',scope:{turnId:'turn_0'},data:{interactionId:'private-question',outcome:'withdrawn'}});
 expect(openInteractions(fixture.snapshot.view)).toHaveLength(0);
});
it('rejects an uncited practice before the shared finalizer contract can store it',async()=>{
 const {practiceBriefSchema}=await import('../../lib/contracts/vercel-practice-result');
 const brief={summary:'Checked guidance with a retained source.',practices:[{practice:'Verify the deployment before promoting it.',rationale:'The checked source supports this recommendation.',sourceIds:['checked-source'],caveat:'Preserve the documented platform prerequisites.'}],gaps:[]};
 expect(practiceBriefSchema.safeParse(brief).success).toBe(true);
 expect(practiceBriefSchema.safeParse({...brief,practices:[{...brief.practices[0],sourceIds:[]}]}).success).toBe(false);
});
