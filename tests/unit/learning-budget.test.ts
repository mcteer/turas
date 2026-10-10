import { describe,it,expect } from 'vitest';
import { assertLearningPrice,learningStepCeiling,type LearningPrice } from '../../lib/server/learning/pricing';
const price:LearningPrice={version:'learning-price-v1',modelId:'spacexai/grok-4.7',inputMicroUsdPerMillion:'8000000',outputMicroUsdPerMillion:'24000000',providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/grok-4.7',pricingCaptureDigest:'a'.repeat(64),outputContractCaptureDigest:'b'.repeat(64),verifiedAt:'2026-10-09T12:00:00Z',expiresAt:'2026-10-10T12:00:00Z'};
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
