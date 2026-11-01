import {expect,it,vi,beforeEach} from 'vitest';
const fixture=vi.hoisted(()=>({embed:vi.fn()}));
vi.mock('../../lib/server/retrieval/embeddings',()=>({embeddingModelId:'openai/text-embedding-3-small',embedRetrievalTexts:fixture.embed}));
import {embedQuery} from '../../lib/server/research/specialists/embeddings';
const vector=Array.from({length:1536},(_,i)=>i===0?1:0);
beforeEach(()=>vi.resetAllMocks());
it('records an actually returned vector before rejecting cancelled downstream use',async()=>{
 const abort=new AbortController(),complete=vi.fn(async()=>{}),beforeRequest=vi.fn(async()=>({complete}));
 fixture.embed.mockImplementation(async(_values,options)=>{await options.beforeProvider();abort.abort();return [vector];});
 await expect(embedQuery('bounded query',abort.signal,{beforeRequest,wrapModel:model=>model})).rejects.toThrow();
 expect(beforeRequest).toHaveBeenCalledOnce();expect(complete).toHaveBeenCalledOnce();
});
it('does not create a specialist reservation when prerequisite admission rejects',async()=>{
 const beforeRequest=vi.fn(),complete=vi.fn();
 fixture.embed.mockRejectedValue(Error('Prerequisite rejected before provider boundary'));
 await expect(embedQuery('bounded query',undefined,{beforeRequest,wrapModel:model=>model})).rejects.toThrow('Prerequisite rejected');
 expect(beforeRequest).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
});
it('retains an unfinished full hold when a dispatched embedding has an uncertain outcome',async()=>{
 const complete=vi.fn(async()=>{}),beforeRequest=vi.fn(async()=>({complete}));
 fixture.embed.mockImplementation(async(_values,options)=>{await options.beforeProvider();throw Error('Provider outcome uncertain');});
 await expect(embedQuery('bounded query',undefined,{beforeRequest,wrapModel:model=>model})).rejects.toThrow('Provider outcome uncertain');
 expect(beforeRequest).toHaveBeenCalledOnce();expect(complete).not.toHaveBeenCalled();
});
