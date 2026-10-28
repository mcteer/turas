import {resolvePublishedLearningPrice,learningStepCeiling} from '../lib/server/learning/pricing';
import {evidenceDigest} from './pilot-evidence';

const catalogUrl='https://ai-gateway.vercel.sh/v1/models';
const embeddingLimitUrl='https://developers.openai.com/api/reference/resources/embeddings/methods/create';
async function evidence(url:string,maximum:number){
 const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>maximum)throw Error('Published evaluation pricing unavailable');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum)throw Error('Published evaluation evidence exceeds bound');chunks.push(part.value);}}
 finally{await reader.cancel();}
 return Buffer.concat(chunks).toString('utf8');
}
function rate(value:unknown){
 if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value))throw Error('Unknown embedding charge');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
}
/** Public evidence only. Fixture prices and requested output caps cannot admit
 * live calls. Embedding uses its separately published whole-request bound. */
export async function publishedQualityCeiling(modelId:'anthropic/claude-sonnet-5.5'|'openai/text-embedding-3-small'){
 if(modelId==='anthropic/claude-sonnet-5.5'){
  const price=await resolvePublishedLearningPrice();
  if(price.providerInputLimit>1000000||price.providerOutputLimit>128000)throw Error('Evaluation model exceeds ledger usage bounds');
  const bound=learningStepCeiling(price,4096);
  return {modelId,ceilingMicroUsd:Number(bound.ceilingMicroUsd),pricingDigest:bound.priceDigest};
 }
 const [catalog,document]=await Promise.all([evidence(catalogUrl,4194304),evidence(embeddingLimitUrl,8388608)]);
 const entry=JSON.parse(catalog).data?.find((row:{id?:unknown})=>row.id===modelId),pricing=entry?.pricing;
 if(entry?.type!=='embedding'||entry.owned_by!=='openai'||!entry.supported_specifications?.includes('v4')||!pricing||Object.keys(pricing).some(key=>!['input','regional'].includes(key)))throw Error('Embedding pricing contract unavailable');
 const rates=[rate(pricing.input)];
 for(const regional of Object.values(pricing.regional??{}) as Array<Record<string,unknown>>){if(!regional||Object.keys(regional).some(key=>key!=='input'))throw Error('Unknown regional embedding charge');rates.push(rate(regional.input));}
 const prose=document.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 if(!/8192 tokens/i.test(prose)||!/2048/.test(prose)||!/maximum of 300,000 tokens summed across all inputs in a single request/i.test(prose))throw Error('Published embedding request bound unavailable');
 const maximum=rates.reduce((a,b)=>a>b?a:b),ceiling=(maximum*300000n+999999n)/1000000n;
 if(ceiling<1n||ceiling>25000000n)throw Error('Embedding reservation outside supported range');
 return {modelId,ceilingMicroUsd:Number(ceiling),pricingDigest:evidenceDigest(JSON.stringify({entry,limitSource:embeddingLimitUrl,limitEvidenceDigest:evidenceDigest(prose),inputLimit:300000,outputLimit:0}))};
}
