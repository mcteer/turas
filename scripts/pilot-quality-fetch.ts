import{createHash}from'node:crypto';
import {z} from 'zod';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';

export type QualityFailureEvidence={dispatchId:string;phase:'transport'|'http'|'accounting'|'stream';status?:number;responseBodyDigest?:string;responseBodyBytes?:number;responseBodyComplete?:boolean;gatewayGenerationId?:string;upstreamResponseId?:string;providerCode?:string};
type Model='anthropic/claude-sonnet-5.5'|'openai/text-embedding-3-small';
type Ceiling={modelId:Model;ceilingMicroUsd:number;pricingDigest:string};
type Accounting={chargedMicroUsd:number;inputTokens:number;outputTokens:number;generationId:string};
function accounting(value:unknown,responseId?:string):Accounting{
 const token=z.number().int().nonnegative().safe();
 const raw=z.object({providerMetadata:z.object({gateway:z.object({cost:z.union([z.number(),z.string()]).optional(),totalCost:z.union([z.number(),z.string()]).optional(),generationId:z.string().optional(),responseId:z.string().optional()}).optional()}).optional(),usage:z.object({inputTokens:z.object({total:token}).optional(),outputTokens:z.object({total:token}).optional(),tokens:token.optional()})}).parse(value);
 const gateway=raw.providerMetadata?.gateway,costs=[gateway?.cost,gateway?.totalCost].filter(cost=>cost!==undefined);
 if(!costs.length||costs.some(cost=>!(typeof cost==='number'||typeof cost==='string'&&/^\d+(?:\.\d+)?$/.test(cost))||!Number.isFinite(Number(cost))||Number(cost)<0))throw Error('Gateway charge unavailable');
 const cost=Number(costs[0]);
 if(costs.some(value=>Number(value)!==cost))throw Error('Gateway charge fields disagree');
 const inputTokens=raw?.usage?.inputTokens?.total??raw?.usage?.tokens,outputTokens=raw?.usage?.outputTokens?.total??(raw?.usage?.tokens!==undefined?0:undefined),generationId=gateway?.generationId??gateway?.responseId??responseId;
 if(typeof inputTokens!=='number'||!Number.isSafeInteger(inputTokens)||inputTokens<0||typeof outputTokens!=='number'||!Number.isSafeInteger(outputTokens)||outputTokens<0||typeof generationId!=='string'||!generationId||generationId.length>256)throw Error('Gateway accounting identity unavailable');
 // generationId is the historical deduplication receipt ID. A response-ID
 // fallback is not a Gateway generation-lookup identity.
 return {chargedMicroUsd:Math.ceil(Number(cost)*1000000),inputTokens,outputTokens,generationId};
}

/** Install only in the explicitly owned evaluation process. This does not
 * authorize live work, select a model, change requests or infer missing charges.
 * The trusted operator supplies a fresh published ceiling, not the model. */
export function budgetedGatewayFetch(input:{ledger:QualityBudgetLedger;attemptId?:string;fetch:typeof fetch;ceiling:(model:Model)=>Promise<Ceiling>;denied?:(ceiling:Ceiling)=>Promise<void>;failed?:(failure:QualityFailureEvidence)=>Promise<void>;observed?:(operation:{kind:'language'|'embedding'|'metadata'|'other';approvedModel:boolean})=>Promise<void>;parameters?:(parameters:{modelId:Model;maxOutputTokens:number|null})=>Promise<void>}):typeof fetch{
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
  const language=url.pathname==='/v4/ai/language-model'&&modelId==='anthropic/claude-sonnet-5.5',embedding=url.pathname==='/v4/ai/embedding-model'&&modelId==='openai/text-embedding-3-small';
  if(request.method==='POST')await input.observed?.({kind:url.pathname==='/v4/ai/language-model'?'language':url.pathname==='/v4/ai/embedding-model'?'embedding':'other',approvedModel:language||embedding});
  if(request.method!=='POST'||url.search||!language&&!embedding)throw Error('Unbudgeted Gateway operation denied');
  const body=await request.clone().arrayBuffer();if(body.byteLength>4*1024*1024)throw Error('Evaluation request exceeds bound');
  const payload=JSON.parse(Buffer.from(body).toString('utf8'));
  if(embedding&&(!Array.isArray(payload.values)||!payload.values.length||payload.values.length>2048||payload.values.some((v:unknown)=>typeof v!=='string'||!v)))throw Error('Embedding batch identity differs');
  if(language)await input.parameters?.({modelId:modelId as Model,maxOutputTokens:Number.isSafeInteger(payload.maxOutputTokens)&&payload.maxOutputTokens>0&&payload.maxOutputTokens<=32000?payload.maxOutputTokens:null});
  request.signal.throwIfAborted();
  if(Array.isArray(payload.tools)&&payload.tools.some((tool:unknown)=>typeof tool==='object'&&tool!==null&&'type' in tool&&tool.type==='provider-defined'))throw Error('Unpriced provider tool denied');
  const ceiling=await input.ceiling(modelId as Model);if(ceiling.modelId!==modelId)throw Error('Evaluation pricing model differs');
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
  let id:string;
  try{id=await input.ledger.dispatchWhenAvailable(ceiling,input.attemptId,signal);}catch(error){if(error instanceof Error&&error.message==='Evaluation budget prevents dispatch')await input.denied?.(ceiling);throw error;}
  const aborted=()=>{void input.ledger.hold(id,'aborted').catch(()=>undefined);};signal.addEventListener('abort',aborted,{once:true});
  let accountingComplete=false,settled=false,terminalSettlement:Promise<void>|undefined;
  const held=async(reason:'provider_error'|'incomplete_stream'|'invalid_accounting')=>{if(!settled)await input.ledger.hold(id,reason);signal.removeEventListener('abort',aborted);};
  const settleKnown=(receipt:Accounting)=>{
   // A complete terminal receipt ends transport uncertainty before the durable
   // journal write. An earlier queued hold still wins; failed writes still hold.
   accountingComplete=true;signal.removeEventListener('abort',aborted);
   return terminalSettlement=(async()=>{
    try{await input.ledger.settle(id,receipt);settled=true;}catch(error){await held('invalid_accounting');throw error;}
    // Persist the known charge without turning caller cancellation into success.
    signal.throwIfAborted();
   })();
  };
  let phase:QualityFailureEvidence['phase']='transport',status:number|undefined,metadataId:string|undefined,gatewayGenerationId:string|undefined,failureCaptured=false;const failed=async(extra:Partial<QualityFailureEvidence>={})=>{if(failureCaptured)return;failureCaptured=true;await input.failed?.({dispatchId:id,phase,...(status!==undefined?{status}:{}),...(gatewayGenerationId?{gatewayGenerationId}:{}),...(metadataId&&/^[A-Za-z0-9_:-]{1,256}$/.test(metadataId)?{upstreamResponseId:metadataId}:{}),...extra});};
  try{
   signal.throwIfAborted();const response=await input.fetch(resource,{...init,signal});
   status=response.status;phase='http';
   if(!response.ok||!response.body){await held('provider_error');const chunks:Uint8Array[]=[];let bytes=0,complete=false,timedOut=false,providerCode:string|undefined,generation:string|undefined;const reader=response.body?.getReader(),timer=setTimeout(()=>{timedOut=true;void reader?.cancel().catch(()=>undefined);},5000);try{if(reader)for(;;){const item=await reader.read();if(item.done){complete=!timedOut;break;}if(bytes+item.value.length>16384)break;bytes+=item.value.length;chunks.push(item.value);}}catch{/* Status and digest remain observable without inventing a body. */}finally{clearTimeout(timer);await reader?.cancel().catch(()=>undefined);}const body=Buffer.concat(chunks);if(complete)try{const raw=JSON.parse(body.toString()),code=raw.error?.code??raw.code,known=['rate_limit_exceeded','rate_limited','insufficient_quota','insufficient_funds','invalid_request','invalid_request_error','model_not_found','provider_error','authentication_error','invalid_api_key','gateway_error','timeout','budget_exceeded'];providerCode=typeof code==='string'?(known.includes(code)?code:'other'):undefined;const candidate=raw.providerMetadata?.gateway?.generationId??raw.error?.providerMetadata?.gateway?.generationId;if(typeof candidate==='string'&&/^[A-Za-z0-9_:-]{1,256}$/.test(candidate))generation=candidate;}catch{}await failed({responseBodyDigest:createHash('sha256').update(body).digest('hex'),responseBodyBytes:bytes,responseBodyComplete:complete,...(providerCode?{providerCode}:{}),...(generation?{gatewayGenerationId:generation}:{})});throw Error('Gateway dispatch requires cost review');}
   phase='accounting';
   if(response.headers.get('content-type')?.includes('application/json')){
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20*1024*1024)throw Error('Evaluation response exceeds bound');chunks.push(part.value);}}
    finally{await reader.cancel();}
    const bytes=Buffer.concat(chunks),raw=JSON.parse(bytes.toString('utf8'));
    const observedGatewayId=raw.providerMetadata?.gateway?.generationId;
    if(typeof observedGatewayId==='string'&&/^[A-Za-z0-9_:-]{1,256}$/.test(observedGatewayId))gatewayGenerationId=observedGatewayId;
    if(typeof raw.response?.id==='string')metadataId=raw.response.id;
    await settleKnown(accounting(raw,raw.response?.id));
    return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
   }
   if(!response.headers.get('content-type')?.includes('text/event-stream')){await held('invalid_accounting');throw Error('Gateway response accounting unsupported');}
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',size=0,finish:unknown,finished=false;phase='stream';
   const observe=(text:string)=>{pending+=text;if(pending.length>4*1024*1024)throw Error('Evaluation stream frame exceeds bound');const lines=pending.split('\n');pending=lines.pop()!;for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;const part=JSON.parse(data);const observedGatewayId=part.providerMetadata?.gateway?.generationId??part.error?.providerMetadata?.gateway?.generationId;if(typeof observedGatewayId==='string'&&/^[A-Za-z0-9_:-]{1,256}$/.test(observedGatewayId))gatewayGenerationId=observedGatewayId;if(part.type==='response-metadata')metadataId=part.id;if(part.type==='finish'){if(finish)throw Error('Repeated Gateway accounting');finish=part;}if(part.type==='error')throw Error('Gateway stream failed');}};
   const stream=new ReadableStream<Uint8Array>({
    async pull(controller){try{const part=await reader.read();if(part.done){observe(decoder.decode()+'\n');if(!finish)throw Error('Gateway stream lacks final accounting');await settleKnown(accounting(finish,metadataId));finished=true;controller.close();return;}size+=part.value.byteLength;if(size>20*1024*1024)throw Error('Evaluation response exceeds bound');observe(decoder.decode(part.value,{stream:true}));controller.enqueue(part.value);}catch(error){await held('incomplete_stream');await failed();await reader.cancel().catch(()=>undefined);controller.error(error);}},
    async cancel(){if(accountingComplete)await terminalSettlement?.catch(()=>undefined);if(!finished&&!accountingComplete){await held('incomplete_stream');await failed();}await reader.cancel();},
   });
   return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){await held('provider_error');await failed();throw error;}
 };
}
