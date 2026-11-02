import type {WorkflowToolContext,WorkflowServeContext,WorkflowServeReceive} from 'eve/tools';
import {sleep} from 'eve/workflow';
import {researchProgress,assertOrdinaryWorkflow,isOwnedNativeResearch} from './workflow-progress';
import {serveSpecialist} from './persistent-specialists';
import type {SpecialistOutcome} from '../../../lib/server/research/specialists/discussion-results';
type Input={message:string};
export async function runCustomerRecon(receive:WorkflowServeReceive<Input>,ctx:WorkflowServeContext<SpecialistOutcome>){
 'use workflow';
 return serveSpecialist('customer-update',receive,ctx);
}
export async function runVercelBestPractices(receive:WorkflowServeReceive<Input>,ctx:WorkflowServeContext<SpecialistOutcome>){
 'use workflow';
 return serveSpecialist('best-practices',receive,ctx);
}
export async function runImplementationResearch(receive:WorkflowServeReceive<Input>,ctx:WorkflowServeContext<SpecialistOutcome>){
 'use workflow';
 return serveSpecialist('solution',receive,ctx);
}
export async function joinCustomerResearch({key}:{key:string},ctx:WorkflowToolContext){
 'use workflow';
 await assertOrdinaryWorkflow(ctx);
 if(await isOwnedNativeResearch(key,ctx)){
  const result=await researchProgress(key,ctx);
  return result.status==='working'?{...result,reason:'This chat already owns the native task. Its result arrives automatically; do not poll, restart or commission duplicate work.'}:result;
 }
 for(let attempt=0;attempt<60;attempt++){
  const result=await researchProgress(key,ctx);if(result.status!=='working')return result;
  await sleep('10s');
 }
 return {status:'unavailable' as const,reference:null,reason:'The shared research did not complete within ten minutes. Do not automatically restart it.'};
}
