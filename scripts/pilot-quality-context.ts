import {z} from 'zod';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {evidenceDigest} from './pilot-evidence';

const units=z.number().int().nonnegative().safe();
const usage=z.object({credits_remaining:units,auto_topup:z.object({enabled:z.literal(false)}),key_metadata:z.object({credits_consumed:z.literal(0)}).optional(),request_id:z.string().min(1).max(256)});
const search=z.strictObject({query:z.string().trim().min(1).max(500),numResults:z.literal(10),markdownOptions:z.strictObject({enabled:z.literal(false)}),highlightsOptions:z.strictObject({enabled:z.literal(false)})});
async function bytes(response:Response,maximum=65536){
 if(!response.body)throw Error('Provider evidence unavailable');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let count=0;
 try{for(;;){const part=await reader.read();if(part.done)break;count+=part.value.byteLength;if(count>maximum)throw Error('Provider evidence exceeds bound');chunks.push(part.value);}}
 finally{await reader.cancel();}
 return Buffer.concat(chunks);
}

/** Context is admitted in its actual credit unit, separately from Gateway USD.
 * Only existing credits with Auto-Topup disabled qualify. No subscription,
 * top-up, estimated dollar conversion, or other Context operation is allowed. */
export function budgetedQualityContextFetch(input:{ledger:QualityBudgetLedger;attemptId?:string;fetch:typeof fetch;scope:()=>Promise<void>;evidence:(receipt:unknown)=>Promise<void>}):typeof fetch{
 return async(resource,init)=>{
  const url=new URL(resource instanceof Request?resource.url:String(resource));
  if(url.hostname!=='api.context.dev')return input.fetch(resource,init);
  const request=new Request(resource,init);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.search)throw Error('Unexpected research provider endpoint');
  if(request.method==='GET'&&url.pathname==='/v1/org/usage')return input.fetch(resource,init);
  if(request.method!=='POST'||url.pathname!=='/v1/web/search')throw Error('Unbudgeted research operation denied');
  if((await input.ledger.status()).contextCreditCap<1)throw Error('Explicit research credit budget required');
  const key=process.env.CONTEXT_API_KEY;
  if(!key||request.headers.get('authorization')!=='Bearer '+key)throw Error('Selected research credential required');
  const body=await request.clone().arrayBuffer();if(body.byteLength>32768)throw Error('Research request exceeds bound');
  search.parse(JSON.parse(Buffer.from(body).toString('utf8')));request.signal.throwIfAborted();await input.scope();
  const account=async()=>{
   const response=await input.fetch('https://api.context.dev/v1/org/usage',{headers:{authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Existing-credit authority unavailable');
   const proof=usage.parse(JSON.parse((await bytes(response)).toString('utf8')));
   return {creditsRemaining:proof.credits_remaining,autoTopupEnabled:false,managementCredits:0,requestId:proof.request_id,observedAt:new Date().toISOString()};
  };
  const before=await account();if(before.creditsRemaining<1)throw Error('Existing research credits exhausted');
  const id=await input.ledger.reserveCredit(evidenceDigest(JSON.stringify(before)),input.attemptId);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]),aborted=()=>{void input.ledger.holdCredit(id).catch(()=>undefined);};signal.addEventListener('abort',aborted,{once:true});
  try{
   signal.throwIfAborted();const response=await input.fetch(resource,{...init,signal});
   if(!response.ok)throw Error('Research dispatch requires review');
   const payload=await bytes(response),raw=z.object({request_id:z.string().min(1).max(256),key_metadata:z.object({credits_consumed:units,credits_remaining:units})}).parse(JSON.parse(payload.toString('utf8')));
   const header=response.headers.get('x-credits-used');if(header!==null&&String(raw.key_metadata.credits_consumed)!==header)throw Error('Research credit receipts differ');
   const after=await account();await input.evidence({contract:'pilot-quality-context-v1',operationId:id,providerRequestId:raw.request_id,before,after,creditsConsumed:raw.key_metadata.credits_consumed,dollarConversion:'not_performed',automaticBillingEnabled:false});
   await input.ledger.settleCredit(id,raw.key_metadata.credits_consumed,raw.request_id,evidenceDigest(JSON.stringify(after)));signal.removeEventListener('abort',aborted);
   return new Response(payload,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){await input.ledger.holdCredit(id);signal.removeEventListener('abort',aborted);throw error;}
 };
}
