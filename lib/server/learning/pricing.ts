import { z } from 'zod';
import { HttpFailure } from '../../contracts/http';
import { sha256Schema,utcTimestampSchema } from '../../contracts/retrieval';
import { learningHash } from './repository';
export const learningPriceSchema=z.object({
 version:z.literal('learning-price-v1'),modelId:z.literal('spacexai/grok-4.7'),
 inputMicroUsdPerMillion:z.string().regex(/^[1-9]\d{0,12}$/),outputMicroUsdPerMillion:z.string().regex(/^[1-9]\d{0,12}$/),
 providerInputLimit:z.number().int().positive().max(2000000),providerOutputLimit:z.number().int().positive().max(2000000),
 hardOutputCapIncludesReasoning:z.literal(true),
 pricingSource:z.literal('https://ai-gateway.vercel.sh/v1/models'),
 outputContractSource:z.literal('https://vercel.com/ai-gateway/models/grok-4.7'),
 pricingCaptureDigest:sha256Schema,outputContractCaptureDigest:sha256Schema,
 verifiedAt:utcTimestampSchema,expiresAt:utcTimestampSchema,
}).strict();
export type LearningPrice=z.infer<typeof learningPriceSchema>;
export function assertLearningPrice(raw:unknown,at=new Date()):LearningPrice{
 const result=learningPriceSchema.safeParse(raw);
 if(!result.success)throw new HttpFailure(503,'pricing_unavailable','A verified provider price and finite usage bound are required');
 const price=result.data,verified=Date.parse(price.verifiedAt),expires=Date.parse(price.expiresAt);
 if(verified>at.getTime()||expires<=at.getTime()||expires<=verified||expires-verified>86400000)throw new HttpFailure(503,'pricing_unavailable','Provider price evidence requires refresh');
 return price;
}
/** Reserve the full published provider limits. Earlier live evaluation observed
 * output beyond the requested cap, so that cap cannot establish a billing bound. */
export function learningStepCeiling(price:LearningPrice,requestedOutputTokens:number){
 if(!Number.isSafeInteger(requestedOutputTokens)||requestedOutputTokens<1||requestedOutputTokens>4096||requestedOutputTokens>price.providerOutputLimit)throw new HttpFailure(503,'pricing_unavailable','Finite provider output contract unavailable');
 const numerator=BigInt(price.providerInputLimit)*BigInt(price.inputMicroUsdPerMillion)+BigInt(price.providerOutputLimit)*BigInt(price.outputMicroUsdPerMillion);
 const ceiling=(numerator+999999n)/1000000n;
 if(ceiling<1n||ceiling>25000000n)throw new HttpFailure(503,'pricing_unavailable','Provider bound exceeds the maximum learning budget');
 return {ceilingMicroUsd:ceiling,inputCeiling:price.providerInputLimit,outputCeiling:price.providerOutputLimit,priceDigest:learningHash(price)};
}
export function configuredLearningPrice(at=new Date()):LearningPrice{
 let raw:unknown;try{raw=JSON.parse(process.env.TURAS_014_PRICE_CONTRACT??'null');}catch{raw=null;}
 return assertLearningPrice(raw,at);
}

function ratePerMillion(value:unknown):bigint{
 if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value))throw new HttpFailure(503,'pricing_unavailable','Unknown provider pricing');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
}
async function publicPriceEvidence(url:string,maximum:number):Promise<string>{
 const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>maximum)throw new HttpFailure(503,'pricing_unavailable','Provider pricing evidence unavailable');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maximum)throw new HttpFailure(503,'pricing_unavailable','Provider pricing evidence exceeds its limit');chunks.push(chunk.value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(chunks).toString('utf8');
}
/** Read public authoritative evidence before entering an admission transaction. */
export async function resolveLearningPrice(at=new Date()):Promise<LearningPrice>{
 if(process.env.TURAS_014_PRICE_CONTRACT)return configuredLearningPrice(at);
 try{
  const [catalog,document]=await Promise.all([publicPriceEvidence('https://ai-gateway.vercel.sh/v1/models',4194304),publicPriceEvidence('https://vercel.com/ai-gateway/models/grok-4.7',8388608)]);
  const entry=JSON.parse(catalog).data?.find((model:{id?:unknown})=>model.id==='spacexai/grok-4.7');
  if(!entry||!Number.isSafeInteger(entry.context_window)||!Number.isSafeInteger(entry.max_tokens)||!entry.supported_parameters?.includes('max_tokens'))throw Error('Finite provider limits unavailable');
  const prose=document.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  if(!/hard cap on generated tokens/i.test(prose)||!prose.includes('Reasoning tokens count toward this limit.')||!prose.includes(entry.max_tokens.toLocaleString('en-US')))throw Error('Reasoning-inclusive hard cap evidence unavailable');
  const pricing=entry.pricing;
  if(!pricing||Object.keys(pricing).some(key=>!['input','output','input_tiers','output_tiers','input_cache_read','input_cache_read_tiers','web_search','service_tiers'].includes(key)))throw Error('Unaccounted price category');
  const rates=(kind:'input'|'output')=>{
   const values=[pricing[kind],...(pricing[`${kind}_tiers`]??[]).map((tier:{cost:unknown})=>tier.cost)];
   for(const tier of Object.values(pricing.service_tiers??{}) as Array<Record<string,unknown>>){
    if(Object.keys(tier).some(key=>!['input','output','input_cache_read','long_context'].includes(key)))throw Error('Unaccounted service tier');
    if(tier[kind]!==undefined)values.push(tier[kind]);
    const long=tier.long_context as Record<string,unknown>|undefined;
    if(long){if(Object.keys(long).some(key=>!['threshold','input','output','input_cache_read'].includes(key)))throw Error('Unaccounted long-context tier');if(long[kind]!==undefined)values.push(long[kind]);}
   }
   const parsed=values.map(ratePerMillion);return parsed.reduce((a,b)=>a>b?a:b).toString();
  };
  return assertLearningPrice({version:'learning-price-v1',modelId:entry.id,inputMicroUsdPerMillion:rates('input'),outputMicroUsdPerMillion:rates('output'),providerInputLimit:entry.context_window,providerOutputLimit:entry.max_tokens,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/grok-4.7',pricingCaptureDigest:learningHash(entry),outputContractCaptureDigest:learningHash(prose),verifiedAt:at.toISOString(),expiresAt:new Date(at.getTime()+86400000).toISOString()},at);
 }catch(error){if(error instanceof HttpFailure)throw error;throw new HttpFailure(503,'pricing_unavailable','Verified provider pricing and reasoning-inclusive limits unavailable');}
}
