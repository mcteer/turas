import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {context,identity} from '../fixtures/legacy-specialist-contracts';
import {researchState} from '../../agent/lib/legacy-research/research-state';
import definition from '../../agent/subagents/customer-recon-worker/tools/finalize_customer_update';
import {customerUpdateSubmissionSchema} from '../../lib/server/research/specialists/solution-research/customer-update';
import {researchPassages} from '../../lib/server/research/specialists/solution-research/source-integrity';
const boundary=vi.hoisted(()=>({stored:vi.fn(),finished:vi.fn(),finalContext:vi.fn()}));
vi.mock('../../lib/server/research/specialists/identity',()=>({researchIdentity:vi.fn(async principal=>principal?identity:null)}));
vi.mock('../../lib/server/research/specialists/research-cache/database',()=>({cacheEnabled:()=>false}));
vi.mock('../../lib/server/research/specialists/solution-research/context',()=>({finalizeResearchContext:boundary.finalContext}));
vi.mock('../../lib/server/research/specialists/solution-research/artifacts',async original=>({...await original<typeof import('../../lib/server/research/specialists/solution-research/artifacts')>(),storeCustomerUpdateArtifact:boundary.stored}));
vi.mock('../../lib/server/research/specialists/research-cache/requests',()=>({finishResearchRequest:boundary.finished}));
const source={id:'customer',url:'https://example.com/product',title:'Synthetic customer source',retrievedAt:'2026-09-20T00:00:00.000Z',excerpt:'The synthetic customer documents a narrowly scoped beta workflow.'};
const input=()=>customerUpdateSubmissionSchema.parse({accountId:context.accountId,question:'What does this source establish?',findings:[{claim:'Documents a scoped workflow.',scope:'Named workload only',sourceId:source.id,passageId:researchPassages(source)[0].id,publisherType:'customer'}],conflicts:[],unknowns:[],coverage:{release_history:{status:'checked',sourceIds:['customer','unretained-release'],currentIndexSourceId:'customer',note:'A synthetic source references a missing release.'},current_documentation:{status:'checked',sourceIds:['customer'],note:'The supplied source documents this workload.'},availability_and_pricing:{status:'not_applicable',sourceIds:[],note:'Focused question does not assess pricing.'},operations_and_limits:{status:'not_applicable',sourceIds:[],note:'Focused question does not assess all limits.'},employee_testimony:{status:'not_applicable',sourceIds:[],searchIds:[],note:'Focused question does not assess testimony.'},practitioner_experience:{status:'not_applicable',sourceIds:[],searchIds:[],note:'Focused question does not assess practitioner experience.'}}});
const ctx=(callId:string,principal:unknown={principalId:identity.principalId},abortSignal=new AbortController().signal)=>({callId,abortSignal,session:{id:'synthetic-worker',auth:{current:principal}}});
type UnitTool={execute:(submission:ReturnType<typeof input>,context:ReturnType<typeof ctx>)=>Promise<{status:string;reference:unknown;reason:string}>};
const current=()=>(definition as unknown as {events:{'step.started':()=>UnitTool|null}}).events['step.started']();
let state:ReturnType<typeof researchState.get>;
beforeEach(()=>{state={context:structuredClone(context),sources:[source],calls:{},startedAt:Date.now(),mode:'customer-update'};vi.spyOn(researchState,'get').mockImplementation(()=>state);vi.spyOn(researchState,'update').mockImplementation(update=>{state=update(state);});boundary.stored.mockReset().mockResolvedValue({accountId:context.accountId,researchId:'a'.repeat(64)});boundary.finished.mockReset().mockResolvedValue(undefined);boundary.finalContext.mockReset().mockResolvedValue(context);vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-unit-signing-secret');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('permits one recon evidence correction with idempotent same-call replay, then closes after exact artifact storage',async()=>{
 const tool=current()!;const first=await tool.execute(input(),ctx('repair-1'));expect(first).toMatchObject({status:'needs_revision',reference:null});expect(first.reason).toContain('unretained-release');expect(state.customerUpdateRevisionCallId).toBe('repair-1');expect(state.finalized).toBeUndefined();
 expect(await tool.execute(input(),ctx('repair-1'))).toEqual(first);expect(boundary.stored).not.toHaveBeenCalled();expect(boundary.finished).not.toHaveBeenCalled();
 const second=await tool.execute(input(),ctx('repair-2'));expect(second.status).toBe('incomplete');expect(second.reference).toEqual({accountId:context.accountId,researchId:'a'.repeat(64)});expect(state.finalized).toBe(true);expect(current()).toBeNull();expect(boundary.stored).toHaveBeenCalledTimes(1);expect(boundary.finished).toHaveBeenCalledTimes(1);
 const receipt=boundary.stored.mock.calls[0][0];expect(receipt.payload.update.coverage.release_history.status).toBe('unavailable');expect(receipt.payload.sources[0].excerpt).toBe(source.excerpt);expect(receipt.payload.blockers.join(' ')).toContain('retained supporting findings');
});
it('does not claim stored success when signing fails after the original correction was consumed',async()=>{
 const tool=current()!;await tool.execute(input(),ctx('repair-1'));vi.stubEnv('TURAS_MAINTENANCE_SECRET','');vi.spyOn(console,'warn').mockImplementation(()=>{});
 expect(await tool.execute(input(),ctx('repair-2'))).toMatchObject({status:'unavailable',reference:null,reason:expect.stringContaining('storage or signing')});expect(state.customerUpdateRevisionCallId).toBe('repair-1');expect(state.finalized).toBeUndefined();expect(boundary.stored).not.toHaveBeenCalled();expect(boundary.finished).not.toHaveBeenCalled();
});
it('denies anonymous, cancelled, wrong-mode and wrong-account finalization before storage',async()=>{
 const tool=current()!;
 expect((await tool.execute(input(),ctx('anonymous',null))).status).toBe('unavailable');expect((await tool.execute(input(),ctx('cancelled',{},AbortSignal.abort()))).status).toBe('unavailable');
 state.mode='solution';expect((await tool.execute(input(),ctx('wrong-mode'))).status).toBe('unavailable');state.mode='customer-update';expect((await tool.execute({...input(),accountId:'22222222-2222-4222-8222-222222222222'},ctx('wrong-account'))).status).toBe('unavailable');expect(boundary.stored).not.toHaveBeenCalled();expect(boundary.finished).not.toHaveBeenCalled();expect(state.customerUpdateRevisionCallId).toBeUndefined();
});
