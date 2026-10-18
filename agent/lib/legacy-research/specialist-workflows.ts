import type {WorkflowToolContext} from 'eve/tools';
import {z} from 'zod';
import {sleep} from 'workflow';
import {specialistResults} from './specialist-results';
import {researchProgress,assertOrdinaryWorkflow,failReservedResearch,reservedSpecialistInvocation} from './workflow-progress';
type Input={message:string;agentId?:string};
export async function runCustomerRecon(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('customer-recon-worker',{...await reservedSpecialistInvocation('customer-update',input,ctx),outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['customer-recon']))});
 const output=specialistResults['customer-recon'].parse(result);
 if(!output.reference)await failReservedResearch('customer-update',ctx);
 return output;
 }catch(error){await failReservedResearch('customer-update',ctx);throw error;}
}
export async function runVercelBestPractices(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('vercel-best-practices-worker',{...await reservedSpecialistInvocation('best-practices',input,ctx),outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['vercel-best-practices']))});
 const output=specialistResults['vercel-best-practices'].parse(result);
 if(!output.reference)await failReservedResearch('best-practices',ctx);
 return output;
 }catch(error){await failReservedResearch('best-practices',ctx);throw error;}
}
export async function runImplementationResearch(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const result=await ctx.agent('implementation-research-worker',{...await reservedSpecialistInvocation('solution',input,ctx),outputSchema:z.record(z.string(),z.json()).parse(z.toJSONSchema(specialistResults['implementation-research']))});
 const output=specialistResults['implementation-research'].parse(result);
 if(!output.reference)await failReservedResearch('solution',ctx);
 return output;
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
