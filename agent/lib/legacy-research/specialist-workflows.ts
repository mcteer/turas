import type {WorkflowToolContext} from 'eve/tools';
import {sleep} from 'eve/workflow';
import {specialistResults} from './specialist-results';
import {researchProgress,assertOrdinaryWorkflow,failReservedResearch,reservedSpecialistInvocation} from './workflow-progress';
type Input={message:string;agentId?:string};
export async function runCustomerRecon(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const invocation=await reservedSpecialistInvocation('customer-update',input,ctx);
 const response=await ctx.agent('customer-recon-worker').send(invocation.message,{outputSchema:specialistResults['customer-recon']});
 const result=await response.result();
 if(result.status!=='completed')throw new Error('Research specialist did not complete');
 const output=specialistResults['customer-recon'].parse(result.data);
 if(!output.reference)await failReservedResearch('customer-update',ctx);
 return output;
 }catch(error){await failReservedResearch('customer-update',ctx);throw error;}
}
export async function runVercelBestPractices(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const invocation=await reservedSpecialistInvocation('best-practices',input,ctx);
 const response=await ctx.agent('vercel-best-practices-worker').send(invocation.message,{outputSchema:specialistResults['vercel-best-practices']});
 const result=await response.result();
 if(result.status!=='completed')throw new Error('Research specialist did not complete');
 const output=specialistResults['vercel-best-practices'].parse(result.data);
 if(!output.reference)await failReservedResearch('best-practices',ctx);
 return output;
 }catch(error){await failReservedResearch('best-practices',ctx);throw error;}
}
export async function runImplementationResearch(input:Input,ctx:WorkflowToolContext){
 'use workflow';
 try {
 await assertOrdinaryWorkflow(ctx);
 const invocation=await reservedSpecialistInvocation('solution',input,ctx);
 const response=await ctx.agent('implementation-research-worker').send(invocation.message,{outputSchema:specialistResults['implementation-research']});
 const result=await response.result();
 if(result.status!=='completed')throw new Error('Research specialist did not complete');
 const output=specialistResults['implementation-research'].parse(result.data);
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
