import {gateway,wrapLanguageModel} from 'ai';
import {withTransaction} from '../../db/client';
import {HttpFailure} from '../../../contracts/http';
import {authorizeSpecialistWorker,type SpecialistWorkerIdentity} from './discussions';
import {reserveLockedSpecialistOperation,settleSpecialistOperation,remainingLockedSpecialistAllowance,markSpecialistOperationCompleted} from './discussion-budget';
import {specialistPolicies} from './discussion-policy';
import {logSpecialistFailure} from './discussion-diagnostics';

type Model=Parameters<typeof wrapLanguageModel>[0]['model'];
type Pricing={input:number;output:number;observedAt:string};
export async function currentPricing(modelId:string):Promise<Pricing>{
 const metadata=await gateway.getAvailableModels();
 const price=metadata.models.find(model=>model.id===modelId)?.pricing;
 const input=Math.max(Number(price?.input),Number(price?.cachedInputTokens??0),Number(price?.cacheCreationInputTokens??0));
 const output=Number(price?.output);
 if(!price||![input,output].every(value=>Number.isFinite(value)&&value>=0))
  throw new HttpFailure(503,'specialist_pricing_unavailable','Current specialist pricing is unavailable.');
 return {input,output,observedAt:new Date().toISOString()};
}

/** One instance per native model step. Fresh domain authority is checked at the
 * actual provider boundary; SDK retries cannot spend the same reservation twice.
 * The optional pricing reader is an internal fixture dependency, never a client
 * option or environment bypass. */
export function guardSpecialistProvider(model:Model,identity:SpecialistWorkerIdentity&{turnId:string;stepIndex:number},pricing:()=>Promise<Pricing>=()=>currentPricing(model.modelId)):Model{
 let called=false,operationId:string|undefined,externalFeeMicroUsd=0;
 return wrapLanguageModel({model,middleware:{
  async transformParams({params}){
   try{
   if(called)throw new HttpFailure(409,'specialist_dispatch_uncertain','This provider operation cannot be sent again.');
   called=true;params.abortSignal?.throwIfAborted();
   const price=await pricing();params.abortSignal?.throwIfAborted();
   if(![price.input,price.output].every(value=>Number.isFinite(value)&&value>=0))throw new HttpFailure(503,'specialist_pricing_unavailable','Current specialist pricing is unavailable.');
   const input=Buffer.byteLength(JSON.stringify({prompt:params.prompt,tools:params.tools}))+8192+128*params.prompt.length;
   externalFeeMicroUsd=params.tools?.some(tool=>tool.name==='exa_search')?7000:0;
   const requestedOutput=Math.min(params.maxOutputTokens??specialistPolicies[identity.kind].outputTokens,specialistPolicies[identity.kind].outputTokens);
   const admitted=await withTransaction(async db=>{
    const bound=await authorizeSpecialistWorker(db,identity);
    const remaining=await remainingLockedSpecialistAllowance(db,bound.discussion.id,bound.discussion.conversation_id);
    const affordable=price.output===0?requestedOutput:Math.floor(((remaining.microUsd-externalFeeMicroUsd)/1000000-input*price.input)/price.output);
    const output=Math.min(requestedOutput,remaining.outputTokens,affordable);
    if(input>remaining.inputTokens||output<1)throw new HttpFailure(429,'specialist_budget_unavailable','Specialist allowance is exhausted.');
    const microUsd=Math.ceil((input*price.input+output*price.output)*1000000)+externalFeeMicroUsd;
    const operation=await reserveLockedSpecialistOperation(db,{discussionId:bound.discussion.id,assignmentId:bound.assignmentId,conversationId:bound.discussion.conversation_id},{
     nativeStepKey:JSON.stringify([identity.workerSessionId,identity.turnId,identity.stepIndex]),model:model.modelId,
     ceiling:{inputTokens:input,outputTokens:output,microUsd},pricing:price,
    });
    return {operation,output,expiresAt:bound.discussion.expires_at.getTime()};
   });
   operationId=admitted.operation.id;
   const deadline=AbortSignal.timeout(Math.max(1,admitted.expiresAt-Date.now()));
   return {...params,maxOutputTokens:admitted.output,abortSignal:params.abortSignal?AbortSignal.any([params.abortSignal,deadline]):deadline};
   }catch(error){logSpecialistFailure(identity.kind,'model-admission',error);throw error;}
  },
  async wrapGenerate({doGenerate}){
   const result=await doGenerate();
   if(operationId&&result.finishReason.unified!=='error'){
    if(externalFeeMicroUsd)await markSpecialistOperationCompleted(operationId);
    else await settleSpecialistOperation(operationId,result.usage,result.providerMetadata);
   }
   return result;
  },
  async wrapStream({doStream}){
   const result=await doStream();
   return {...result,stream:result.stream.pipeThrough(new TransformStream({
    async transform(part,controller){
     if(part.type==='finish'&&part.finishReason.unified!=='error'&&operationId){
      if(externalFeeMicroUsd)await markSpecialistOperationCompleted(operationId);
      else await settleSpecialistOperation(operationId,part.usage,part.providerMetadata);
     }
     controller.enqueue(part);
    },
   }))};
  },
 }});
}
