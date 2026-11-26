import { describe,it,expect,vi } from 'vitest';
import { assertLearningPrice,learningStepCeiling,resolvePublishedLearningPrice,type LearningPrice } from '../../lib/server/learning/pricing';
const price:LearningPrice={version:'learning-price-v1',modelId:'anthropic/claude-sonnet-5.5',inputMicroUsdPerMillion:'8000000',outputMicroUsdPerMillion:'24000000',providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/claude-sonnet-5.5',pricingCaptureDigest:'a'.repeat(64),outputContractCaptureDigest:'b'.repeat(64),verifiedAt:'2026-10-09T12:00:00Z',expiresAt:'2026-10-10T12:00:00Z'};
describe('finite learning price contracts',()=>{
 it('uses the complete provider input bound and reasoning-inclusive output contract',()=>{
  expect(learningStepCeiling(price,4096)).toMatchObject({ceilingMicroUsd:16000000n,inputCeiling:500000,outputCeiling:500000});
  expect(()=>assertLearningPrice({...price,hardOutputCapIncludesReasoning:false},new Date('2026-10-09T13:00:00Z'))).toThrow();
  expect(()=>learningStepCeiling(price,8192)).toThrow();
 });
 it('rejects absent, future, stale and oversized price evidence',()=>{
  for(const raw of [null,{...price,verifiedAt:'2026-10-10T12:00:00Z'},{...price,expiresAt:'2026-10-09T12:00:00Z'},{...price,expiresAt:'2026-10-12T12:00:00Z'}])expect(()=>assertLearningPrice(raw,new Date('2026-10-09T13:00:00Z'))).toThrow();
  expect(()=>learningStepCeiling({...price,inputMicroUsdPerMillion:'9999999999999'},4096)).toThrow();
 });
 it('rounds a fractional micro-USD ceiling upward, never below the bound',()=>{
  expect(learningStepCeiling({...price,inputMicroUsdPerMillion:'1',outputMicroUsdPerMillion:'1',providerInputLimit:1,providerOutputLimit:1},1).ceilingMicroUsd).toBe(1n);
 });
});


it('verifies pricing against the canonical model contract without following redirects',async()=>{
 const modelUrl='https://vercel.com/ai-gateway/models/anthropic/claude-sonnet-5.5';
 const catalog={data:[{id:price.modelId,context_window:500000,max_tokens:500000,supported_parameters:['max_tokens'],pricing:{input:'0.000002',output:'0.000010'}}]};
 const fetch=vi.fn((url:string)=>Promise.resolve(url===price.pricingSource ? Response.json(catalog) :
  url===modelUrl ? new Response('Hard cap on generated tokens: 500,000. Reasoning tokens count toward this limit.') : Response.redirect(modelUrl,308)));
 vi.stubGlobal('fetch',fetch);
 try{
  await expect(resolvePublishedLearningPrice(new Date('2026-10-09T13:00:00Z'))).resolves.toMatchObject({outputContractSource:modelUrl,hardOutputCapIncludesReasoning:true,providerOutputLimit:500000});
  expect(fetch).toHaveBeenCalledWith(modelUrl,expect.objectContaining({redirect:'error'}));
  expect(assertLearningPrice(price,new Date('2026-10-09T13:00:00Z'))).toEqual(price);
  fetch.mockImplementation(url=>Promise.resolve(url===price.pricingSource ? Response.json(catalog) : Response.redirect('https://example.com/other-provider',308)));
  await expect(resolvePublishedLearningPrice(new Date('2026-10-09T13:00:00Z'))).rejects.toMatchObject({status:503});
 }finally{vi.unstubAllGlobals();}
});
