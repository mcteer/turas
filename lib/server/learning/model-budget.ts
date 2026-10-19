import { wrapLanguageModel } from 'ai';
import { z } from 'zod';
import { HttpFailure } from '../../contracts/http';
import { learningDraftOutputSchema,learningArmOutputSchema } from '../../contracts/learning';
type Model=Parameters<typeof wrapLanguageModel>[0]['model'];
export type LearningModelAccounting={inputTokens:number;outputTokens:number;metadata:unknown;responseId?:string};
export type LearningModelCallbacks={purpose:'draft'|'evaluation_baseline'|'evaluation_candidate';chargeInput:(bytes:number)=>Promise<void>;settle:(accounting:LearningModelAccounting)=>Promise<void>;fail:()=>Promise<void>;rememberIdentity?:(kind:'provider_response'|'gateway_generation',value:string)=>Promise<void>};
const callbacks=new WeakMap<Date,LearningModelCallbacks>();
export function registerLearningModelCallbacks(deadline:Date,value:LearningModelCallbacks){callbacks.set(deadline,value);}
export const learningReadSchemas={learning_summary:z.object({}).strict(),learning_evidence:z.object({sourceKeys:z.array(z.string().min(1).max(80)).min(1).max(10).refine(keys=>new Set(keys).size===keys.length)}).strict(),load_skill:z.object({skill:z.literal('governed-learning')}).strict()};

/** Shared invocation flag covers both SDK paths, including retry after failure. */
export function wrapLearningModel(model:Model,governance?:{deadlineAt:Date;beforeProvider:()=>Promise<void>}){
 let invoked=false,dispatched=false,settled=false;
 const bound=governance?callbacks.get(governance.deadlineAt):undefined;
 const fail=async()=>{if(dispatched&&!settled)await bound?.fail();};
 const rememberGateway=async(metadata:unknown)=>{const generation=(metadata as {gateway?:{generationId?:unknown}}|undefined)?.gateway?.generationId;if(typeof generation==='string')await bound?.rememberIdentity?.('gateway_generation',generation);};
 const rememberError=async(error:unknown)=>{const generation=(error as {generationId?:unknown}|null)?.generationId;if(typeof generation==='string')await bound?.rememberIdentity?.('gateway_generation',generation);};
 const failure=async(error:unknown)=>{const errors=[error];try{await rememberError(error);}catch(cause){errors.push(cause);}try{await fail();}catch(cause){errors.push(cause);}return errors.length===1?error:new AggregateError(errors,'Learning provider failure and accounting retention incomplete');};
 const toolCall=(name:string,input:unknown)=>{
  if(bound?.purpose!=='draft'||!(name in learningReadSchemas))throw new HttpFailure(403,'learning_tool_denied','Forbidden learning tool');
  let value=input;if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw new HttpFailure(422,'invalid_tool_input','Malformed learning read');}}
  if(!learningReadSchemas[name as keyof typeof learningReadSchemas].safeParse(value).success)throw new HttpFailure(422,'invalid_tool_input','Malformed learning read');
 };
 const account=async(usage:{inputTokens:{total:number|undefined};outputTokens:{total:number|undefined}},metadata:unknown,responseId?:string)=>{
  const input=usage.inputTokens.total,output=usage.outputTokens.total;
  if(!Number.isSafeInteger(input)||input===undefined||input<0||!Number.isSafeInteger(output)||output===undefined||output<0)throw new HttpFailure(409,'accounting_unknown','Complete actual token usage required');
  await bound!.settle({inputTokens:input,outputTokens:output,metadata,responseId});settled=true;
  if(output>8192)throw new HttpFailure(429,'learning_output_budget','Actual output exceeds the learning limit');
 };
 return wrapLanguageModel({model,middleware:{
  transformParams:async({params})=>{
   if(!governance||!bound)throw new HttpFailure(403,'learning_step_unadmitted','Durable learning admission required');
   if(invoked)throw new HttpFailure(409,'learning_step_uncertain','A paid model step cannot be retried');invoked=true;
   if(model.modelId!=='spacexai/grok-4.7')throw new HttpFailure(409,'learning_model_changed','Learning model contract changed');
   const allowed=bound.purpose==='draft'?new Set(Object.keys(learningReadSchemas)):new Set<string>();
   const tools=(params.tools??[]).filter(t=>t.type==='function'&&allowed.has(t.name)).map(t=>t.type==='function'?{...t,inputSchema:z.toJSONSchema(learningReadSchemas[t.name as keyof typeof learningReadSchemas])}:t);
   if(params.toolChoice?.type==='tool'&&!allowed.has(params.toolChoice.toolName))throw new HttpFailure(403,'learning_tool_denied','Forbidden forced tool');
   const bytes=Buffer.byteLength(JSON.stringify(params.prompt));if(bytes>24576)throw new HttpFailure(413,'scope_too_large','Narrow learning input');
   params.abortSignal?.throwIfAborted();
   const remaining=governance.deadlineAt.getTime()-Date.now();if(!Number.isFinite(remaining)||remaining<=0)throw new HttpFailure(409,'learning_expired','Learning deadline reached');
   await bound.chargeInput(bytes);await governance.beforeProvider();dispatched=true;
   const afterClaim=governance.deadlineAt.getTime()-Date.now();
   if(afterClaim<=0){await fail();throw new HttpFailure(409,'learning_expired','Learning deadline reached');}
   const deadline=AbortSignal.timeout(Math.min(afterClaim,120000));
   return {...params,tools,maxOutputTokens:4096,responseFormat:{type:'json',name:bound.purpose==='draft'?'learning_draft_v1':'learning_arm_v1',schema:z.toJSONSchema(bound.purpose==='draft'?learningDraftOutputSchema:learningArmOutputSchema)},abortSignal:params.abortSignal?AbortSignal.any([params.abortSignal,deadline]):deadline};
  },
  wrapGenerate:async({doGenerate,params})=>{try{params.abortSignal?.throwIfAborted();const result=await doGenerate();await rememberGateway(result.providerMetadata);if(result.response?.id)await bound?.rememberIdentity?.('provider_response',result.response.id);await account(result.usage,result.providerMetadata,result.response?.id);for(const item of result.content)if(item.type==='tool-call')toolCall(item.toolName,item.input);return result;}catch(error){throw await failure(error);}},
  wrapStream:async({doStream,params})=>{try{params.abortSignal?.throwIfAborted();const result=await doStream();let finished=false,responseId:string|undefined,generationId:string|undefined;return {...result,stream:result.stream.pipeThrough(new TransformStream({async transform(chunk,controller){try{
   // Gateway injects its ID on the first content frame; it need not be repeated
   // on finish. Keep it distinct from response-metadata's upstream identity.
   const observed=('providerMetadata' in chunk?chunk.providerMetadata?.gateway as {generationId?:unknown}|undefined:undefined)?.generationId;
   if(typeof observed==='string'){
    await bound?.rememberIdentity?.('gateway_generation',observed);
    if(generationId!==undefined&&generationId!==observed)throw new HttpFailure(409,'accounting_unknown','Provider generation identity changed');
    generationId=observed;
   }
   if(chunk.type==='response-metadata'){responseId=chunk.id;if(responseId)await bound?.rememberIdentity?.('provider_response',responseId);}
   if(chunk.type==='error')await rememberError(chunk.error);
   if(chunk.type==='finish'){
    const metadata=generationId===undefined?chunk.providerMetadata:{...chunk.providerMetadata,gateway:{...chunk.providerMetadata?.gateway,generationId}};
    await account(chunk.usage,metadata,responseId);finished=true;
   }
   if(chunk.type==='tool-input-start'&&(bound?.purpose!=='draft'||!(chunk.toolName in learningReadSchemas)))throw new HttpFailure(403,'learning_tool_denied','Forbidden learning tool');if(chunk.type==='tool-call')toolCall(chunk.toolName,chunk.input);controller.enqueue(chunk);
  }catch(error){controller.error(await failure(error));}},async flush(){if(!finished){await fail();throw new HttpFailure(409,'accounting_unknown','Provider stream ended without accounting');}}}))};}catch(error){throw await failure(error);}},
 }});
}
