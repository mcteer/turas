import type {WorkflowToolContext} from 'eve/tools';
import {z} from 'zod';
import {sleep} from 'workflow';
import {specialistResults} from './specialist-results';
import {researchProgress,assertOrdinaryWorkflow,failReservedResearch} from './workflow-progress';
type Input={message:string;agentId?:string};
export async function runCustomerRecon(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('customer-recon-worker',{...input,outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['customer-recon']))});
 return specialistResults['customer-recon'].parse(result);
 }catch(error){await failReservedResearch('customer-update',ctx);throw error;}
}
export async function runVercelBestPractices(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('vercel-best-practices-worker',{...input,outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['vercel-best-practices']))});
 return specialistResults['vercel-best-practices'].parse(result);
 }catch(error){await failReservedResearch('best-practices',ctx);throw error;}
}
export async function runImplementationResearch(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('implementation-research-worker',{...input,outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['implementation-research']))});
 return specialistResults['implementation-research'].parse(result);
 }catch(error){await failReservedResearch('solution',ctx);throw error;}
}
export async function joinCustomerResearch({key}:{key:string},ctx:WorkflowToolContext){
 'use workflow';
 await assertOrdinaryWorkflow(ctx);
 for(let attempt=0;attempt<60;attempt++){
  const result=await researchProgress(key,ctx);if(result.status!=='working')return result;
  await sleep('10s');
 }
 return {status:'unavailable' as const,reference:null,reason:'The shared research did not complete within ten minutes. Do not automatically restart it.'};
}
