import {it,expect,vi,afterEach} from 'vitest';
import {researchHandoffs,bindResearchHandoff,resolveResearchHandoff,sessionResearchReferenceSchema} from '../../agent/lib/legacy-research/research-handoff';
import {identity,context} from '../fixtures/legacy-specialist-contracts';
afterEach(()=>vi.restoreAllMocks());
it('resolves only the exact admitted account and purpose through its server-held key',async()=>{
 let state:ReturnType<typeof researchHandoffs.get>=[];
 vi.spyOn(researchHandoffs,'get').mockImplementation(()=>state);vi.spyOn(researchHandoffs,'update').mockImplementation(update=>{state=update(state);});
 const scope={accountId:context.accountId,kind:'customer-update' as const,question:'Which products are documented?',workload:'One pilot'};
 const reference={accountId:context.accountId,researchId:'a'.repeat(64)},signal=new AbortController().signal;
 bindResearchHandoff(scope,{key:'exact-server-key',reference:null});
 const progress=vi.fn(async(principal:typeof identity,key:string,abort:AbortSignal)=>{expect(principal).toBe(identity);expect(key).toBe('exact-server-key');expect(abort).toBe(signal);return {status:'available' as const,reference,reason:'Complete'};});
 expect(await resolveResearchHandoff({accountId:context.accountId},scope.kind,identity,signal,progress)).toEqual(reference);
 expect(await resolveResearchHandoff({accountId:'22222222-2222-4222-8222-222222222222'},scope.kind,identity,signal,progress)).toBeNull();
 expect(await resolveResearchHandoff({accountId:context.accountId},'solution',identity,signal,progress)).toBeNull();expect(progress).toHaveBeenCalledTimes(1);
 for(const status of ['working','unavailable'] as const)expect(await resolveResearchHandoff({accountId:context.accountId},scope.kind,identity,signal,async()=>({status,reference:null,reason:'Not complete'}))).toBeNull();
 expect(await resolveResearchHandoff({accountId:context.accountId},scope.kind,identity,signal,async()=>({status:'available',reference:{...reference,accountId:'22222222-2222-4222-8222-222222222222'},reason:'Wrong scope'}))).toBeNull();
 const explicit={...reference,researchId:'b'.repeat(64)};expect(await resolveResearchHandoff(explicit,scope.kind,identity,signal,()=>{throw Error('Explicit IDs must never be repaired');})).toEqual(explicit);
 const aborted=vi.fn();await expect(resolveResearchHandoff(reference,scope.kind,identity,AbortSignal.abort(),aborted)).rejects.toBeDefined();expect(aborted).not.toHaveBeenCalled();
 expect(sessionResearchReferenceSchema.safeParse({accountId:reference.accountId}).success).toBe(true);expect(sessionResearchReferenceSchema.safeParse({...reference,researchId:'invented'}).success).toBe(false);
});
it('replaces only the same account purpose, retains reused references, and bounds session handoffs to twelve',async()=>{
 let state:ReturnType<typeof researchHandoffs.get>=[];vi.spyOn(researchHandoffs,'get').mockImplementation(()=>state);vi.spyOn(researchHandoffs,'update').mockImplementation(update=>{state=update(state);});
 const base={accountId:context.accountId,question:'Which products are documented?',workload:'One pilot'};
 bindResearchHandoff({...base,kind:'customer-update'},{key:'recon',reference:null});bindResearchHandoff({...base,kind:'solution'},{key:'old-solution',reference:null});bindResearchHandoff({...base,kind:'solution'},{key:'new-solution',reference:null});
 expect(state.map(s=>s.key)).toEqual(['recon','new-solution']);
 const reference={accountId:context.accountId,researchId:'c'.repeat(64)};bindResearchHandoff({...base,kind:'customer-update'},{key:null,reference});
 const progress=vi.fn();expect(await resolveResearchHandoff({accountId:context.accountId},'customer-update',identity,new AbortController().signal,progress)).toEqual(reference);expect(progress).not.toHaveBeenCalled();
 for(let i=0;i<20;i++)bindResearchHandoff({...base,accountId:`test-${i}`,kind:'solution'},{key:`key-${i}`,reference:null});expect(state).toHaveLength(12);expect(state.at(-1)?.key).toBe('key-19');expect(state.some(s=>s.accountId===context.accountId)).toBe(false);
});
