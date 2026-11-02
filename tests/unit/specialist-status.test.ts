import{describe,expect,it,vi}from'vitest';
import type{CurrentSession}from'../../lib/server/auth/sessions';
const fixture=vi.hoisted(()=>({rows:[] as Record<string,unknown>[]}));
vi.mock('../../lib/server/db/client',()=>({withTransaction:async(run:(db:unknown)=>unknown)=>run({query:async()=>({rows:fixture.rows})})}));
vi.mock('../../lib/server/conversations/binding',()=>({readOwnedBinding:async()=>({})}));
vi.mock('../../lib/server/profiles/policy',()=>({lockProfileActor:async()=>({})}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'test-specialist-status'})}));
import{listOwnedSpecialists}from'../../lib/server/research/specialists/discussion-status';
const id='10000000-0000-4000-8000-000000000001';
describe('owned specialist status projection',()=>{
 it.each(['admitted','working','waiting_input','stopping','completed','failed','cancelled','unavailable'])('returns a valid bounded DTO for %s',async state=>{
  fixture.rows=[{id,customer_id:id,kind:'customer-update',discussion_state:state==='unavailable'?'failed':'open',expires_at:new Date(Date.now()+60000),closed_at:null,assignment_id:id,state,created_at:new Date(),updated_at:new Date()}];
  const list=await listOwnedSpecialists({workspaceId:id,principalId:id}as CurrentSession,id);
  expect(list.items).toHaveLength(1);expect(list.items[0].state).toBe(state);
  if(state==='unavailable')expect(list.items[0]).toMatchObject({reasonCode:'result_unavailable',canCancel:false,canContinue:false});
  expect(list.items[0]).not.toHaveProperty('customer_id');
 });
});
