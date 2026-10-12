import {z} from 'zod';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';

type Model='spacexai/grok-4.7'|'openai/text-embedding-3-small';
type Ceiling={modelId:Model;ceilingMicroUsd:number;pricingDigest:string};
type Accounting={chargedMicroUsd:number;inputTokens:number;outputTokens:number;generationId:string};
function accounting(value:unknown,responseId?:string):Accounting{
 const token=z.number().int().nonnegative().safe();
 const raw=z.object({providerMetadata:z.object({gateway:z.object({cost:z.union([z.number(),z.string()]).optional(),totalCost:z.union([z.number(),z.string()]).optional(),generationId:z.string().optional(),responseId:z.string().optional()}).optional()}).optional(),usage:z.object({inputTokens:z.object({total:token}).optional(),outputTokens:z.object({total:token}).optional(),tokens:token.optional()})}).parse(value);
 const gateway=raw.providerMetadata?.gateway,cost=gateway?.cost??gateway?.totalCost;
 if(!(typeof cost==='number'||typeof cost==='string'&&/^\d+(?:\.\d+)?$/.test(cost))||!Number.isFinite(Number(cost))||Number(cost)<0)throw Error('Gateway charge unavailable');
 const inputTokens=raw?.usage?.inputTokens?.total??raw?.usage?.tokens,outputTokens=raw?.usage?.outputTokens?.total??(raw?.usage?.tokens!==undefined?0:undefined),generationId=gateway?.generationId??gateway?.responseId??responseId;
 if(typeof inputTokens!=='number'||!Number.isSafeInteger(inputTokens)||inputTokens<0||typeof outputTokens!=='number'||!Number.isSafeInteger(outputTokens)||outputTokens<0||typeof generationId!=='string'||!generationId||generationId.length>256)throw Error('Gateway accounting identity unavailable');
 return {chargedMicroUsd:Math.ceil(Number(cost)*1000000),inputTokens,outputTokens,generationId};
}

/** Install only in the explicitly owned evaluation process. This does not
 * authorize live work, select a model, change requests or infer missing charges.
 * The trusted operator supplies a fresh published ceiling, not the model. */
export function budgetedGatewayFetch(input:{ledger:QualityBudgetLedger;attemptId?:string;fetch:typeof fetch;ceiling:(model:Model)=>Promise<Ceiling>;denied?:(ceiling:Ceiling)=>Promise<void>;observed?:(operation:{kind:'language'|'embedding'|'metadata'|'other';approvedModel:boolean})=>Promise<void>}):typeof fetch{
 return async(resource,init)=>{
  const url=new URL(resource instanceof Request?resource.url:String(resource));
  if(url.hostname!=='ai-gateway.vercel.sh')return input.fetch(resource,init);
  const request=new Request(resource,init);
  if(url.protocol!=='https:'||url.port||url.username||url.password)throw Error('Unexpected Gateway endpoint');
  // The public catalog is unauthenticated evidence; do not send the model
  // credential to it. Account-specific SDK config keeps its original auth.
  if(request.method==='GET'&&['/v1/models','/v1/models/catalog'].includes(url.pathname)&&!url.search){await input.observed?.({kind:'metadata',approvedModel:false});const headers=new Headers(request.headers);headers.delete('authorization');return input.fetch(new Request(request,{headers}));}
  if(request.method==='GET'){await input.observed?.({kind:'metadata',approvedModel:false});if(['/v1/models','/v4/ai/models','/v4/ai/config','/v3/ai/config'].includes(url.pathname)&&!url.search)return input.fetch(resource,init);}
  const modelId=request.headers.get(url.pathname==='/v4/ai/language-model'?'ai-language-model-id':'ai-model-id');
  const alternate=request.headers.get(url.pathname==='/v4/ai/language-model'?'ai-model-id':'ai-language-model-id');
  if(alternate&&alternate!==modelId)throw Error('Conflicting Gateway model identity');
  const language=url.pathname==='/v4/ai/language-model'&&modelId==='spacexai/grok-4.7',embedding=url.pathname==='/v4/ai/embedding-model'&&modelId==='openai/text-embedding-3-small';
  if(request.method==='POST')await input.observed?.({kind:url.pathname==='/v4/ai/language-model'?'language':url.pathname==='/v4/ai/embedding-model'?'embedding':'other',approvedModel:language||embedding});
  if(request.method!=='POST'||url.search||!language&&!embedding)throw Error('Unbudgeted Gateway operation denied');
  const body=await request.clone().arrayBuffer();if(body.byteLength>4*1024*1024)throw Error('Evaluation request exceeds bound');
  const payload=JSON.parse(Buffer.from(body).toString('utf8'));
  if(embedding&&(!Array.isArray(payload.values)||!payload.values.length||payload.values.length>2048||payload.values.some((v:unknown)=>typeof v!=='string'||!v)))throw Error('Embedding batch identity differs');
  request.signal.throwIfAborted();
  if(Array.isArray(payload.tools)&&payload.tools.some((tool:unknown)=>typeof tool==='object'&&tool!==null&&'type' in tool&&tool.type==='provider-defined'))throw Error('Unpriced provider tool denied');
  const ceiling=await input.ceiling(modelId as Model);if(ceiling.modelId!==modelId)throw Error('Evaluation pricing model differs');
  let id:string;
  try{id=await input.ledger.dispatch(ceiling,input.attemptId);}catch(error){if(error instanceof Error&&error.message==='Evaluation budget prevents dispatch')await input.denied?.(ceiling);throw error;}
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
  const aborted=()=>{void input.ledger.hold(id,'aborted').catch(()=>undefined);};signal.addEventListener('abort',aborted,{once:true});
  const held=async(reason:'provider_error'|'incomplete_stream'|'invalid_accounting')=>{await input.ledger.hold(id,reason);signal.removeEventListener('abort',aborted);};
  try{
   signal.throwIfAborted();const response=await input.fetch(resource,{...init,signal});
   if(!response.ok||!response.body){await held('provider_error');throw Error('Gateway dispatch requires cost review');}
   if(response.headers.get('content-type')?.includes('application/json')){
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20*1024*1024)throw Error('Evaluation response exceeds bound');chunks.push(part.value);}}
    finally{await reader.cancel();}
    const bytes=Buffer.concat(chunks),raw=JSON.parse(bytes.toString('utf8'));await input.ledger.settle(id,accounting(raw,raw.response?.id));signal.removeEventListener('abort',aborted);
    return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
   }
   if(!response.headers.get('content-type')?.includes('text/event-stream')){await held('invalid_accounting');throw Error('Gateway response accounting unsupported');}
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',size=0,finish:unknown,metadataId:string|undefined,finished=false;
   const observe=(text:string)=>{pending+=text;if(pending.length>4*1024*1024)throw Error('Evaluation stream frame exceeds bound');const lines=pending.split('\n');pending=lines.pop()!;for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;const part=JSON.parse(data);if(part.type==='response-metadata')metadataId=part.id;if(part.type==='finish'){if(finish)throw Error('Repeated Gateway accounting');finish=part;}if(part.type==='error')throw Error('Gateway stream failed');}};
   const stream=new ReadableStream<Uint8Array>({
    async pull(controller){try{const part=await reader.read();if(part.done){observe(decoder.decode()+'\n');if(!finish)throw Error('Gateway stream lacks final accounting');await input.ledger.settle(id,accounting(finish,metadataId));finished=true;signal.removeEventListener('abort',aborted);controller.close();return;}size+=part.value.byteLength;if(size>20*1024*1024)throw Error('Evaluation response exceeds bound');observe(decoder.decode(part.value,{stream:true}));controller.enqueue(part.value);}catch(error){await held('incomplete_stream');await reader.cancel().catch(()=>undefined);controller.error(error);}},
    async cancel(){if(!finished)await held('incomplete_stream');await reader.cancel();},
   });
   return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){await held('provider_error');throw error;}
 };
}
