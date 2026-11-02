import {expect,it,vi,beforeEach,afterEach} from 'vitest';
const fixture=vi.hoisted(()=>({events:[] as string[],provider:vi.fn(),parity:vi.fn()}));
vi.mock('ai',()=>({gateway:{embeddingModel:()=>({})},embedMany:fixture.provider}));
vi.mock('../../lib/server/db/client',()=>({withTransaction:async(run:any)=>run({})}));
vi.mock('../../lib/server/operations/admission',()=>({withOperationalProviderIo:async(run:any)=>run()}));
vi.mock('../../lib/server/retrieval/jobs',()=>({reserveEmbeddingOperation:async()=>({id:'owned-operation',state:'reserved'}),markEmbeddingDispatched:async()=>true,finishEmbeddingOperation:async()=>{}}));
vi.mock('../../lib/server/retrieval/telemetry',()=>({recordRetrievalMetric:()=>{}}));
vi.mock('../../lib/server/research/specialists/evaluation-budget',()=>({reserveParityEmbedding:fixture.parity,settleParityProvider:async()=>{}}));
import {embedRetrievalTexts} from '../../lib/server/retrieval/embeddings';
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{vi.resetAllMocks();fixture.events.length=0;vi.stubEnv('AI_GATEWAY_API_KEY','synthetic-unit-key');});
it('runs specialist admission after prerequisites and before the real provider boundary',async()=>{
 fixture.parity.mockImplementation(async()=>{fixture.events.push('prerequisite');return null;});
 fixture.provider.mockImplementation(async()=>{fixture.events.push('provider');return {embeddings:[Array.from({length:1536},(_,i)=>i===0?1:0)],providerMetadata:{}};});
 await embedRetrievalTexts(['bounded query'],{beforeProvider:async()=>{fixture.events.push('specialist');}});
 expect(fixture.events).toEqual(['prerequisite','specialist','provider']);
});
it('never calls specialist admission or the provider after a failed prerequisite',async()=>{
 fixture.parity.mockRejectedValue(Error('Prerequisite unavailable'));
 const boundary=vi.fn(async()=>{});
 await expect(embedRetrievalTexts(['bounded query'],{beforeProvider:boundary})).rejects.toThrow('Embedding unavailable');
 expect(boundary).not.toHaveBeenCalled();expect(fixture.provider).not.toHaveBeenCalled();
});
it('never dispatches when the specialist boundary rejects',async()=>{
 fixture.parity.mockResolvedValue(null);
 await expect(embedRetrievalTexts(['bounded query'],{beforeProvider:async()=>{throw Error('Specialist authority denied');}})).rejects.toThrow('Embedding unavailable');
 expect(fixture.provider).not.toHaveBeenCalled();
});
