import {withOperationalIo} from '../operations/admission';
import {executionBackend} from './backend';
export {executionBackend} from './backend';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {withTransaction} from '../db/client';
import {LocalJobExecutor} from './local-executor';
import {SandboxJobExecutor} from './sandbox-executor';
import {validateExecution,type ExecutionRequest,type ExecutionOutput} from './executor';
import {admitHostedJob,startHostedJob,hostedSandboxLease,withHostedHeartbeat,publishHostedOutput,cancelHostedJob,type JobAdmission,type SourceFence} from '../operations/hosted-jobs';
import {reserveServiceCost,serviceBudgetAuthority,sandboxOperationDigest} from '../operations/cost';
import {costOperationDigest} from '../../contracts/pilot-cost';
import {admitLocalJob,fenceLocalJob,settleLocalJob,withLocalHeartbeat} from '../operations/local-jobs';
import {hostedExecutionCredentials,hostedExecutionIdentity} from './credentials';
export {hostedExecutionCredentials} from './credentials';

const costConfig=z.strictObject({budgetId:z.uuid(),scopeDigest:z.string().regex(/^[a-f0-9]{64}$/),pricingDigest:z.string().regex(/^[a-f0-9]{64}$/),costSourceDigest:z.string().regex(/^[a-f0-9]{64}$/),maximumDispatches:z.number().int().min(1).max(100000).optional(),bounds:z.strictObject({
 'artifact-scan':z.number().int().min(0).max(1e12),'artifact-parse':z.number().int().min(0).max(1e12),'workforce-parse':z.number().int().min(0).max(1e12),'report-render':z.number().int().min(0).max(1e12),'report-office-check':z.number().int().min(0).max(1e12),
})});
export function sandboxScopeDigest(env:NodeJS.ProcessEnv=process.env){
 const {projectId,teamId}=hostedExecutionIdentity(env),images=[env.TURAS_PILOT_SCANNER_IMAGE,env.TURAS_PILOT_PARSER_IMAGE,env.TURAS_PILOT_RENDERER_IMAGE];
 if(!env.TURAS_ENVIRONMENT_ID||images.some(image=>!image||!/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/.test(image)))throw Error('Exact hosted execution scope required');
 return costOperationDigest({contract:'pilot-sandbox-scope-v1',environmentId:env.TURAS_ENVIRONMENT_ID,projectId,teamId,images,maximumDeadlineMs:300000,maximumInputBytes:10485760,maximumOutputBytes:52428800,scannerVcpus:2,otherVcpus:1,persistent:false,networkPolicy:'deny-all',ports:[]});
}
export function hostedCostConfiguration(env:NodeJS.ProcessEnv=process.env){
 const raw=env.TURAS_PILOT_JOB_COST_JSON;if(!raw||Buffer.byteLength(raw)>8192)throw Error('Explicit hosted cost configuration required');
 const costs=costConfig.parse(JSON.parse(raw));
 if(costs.scopeDigest!==sandboxScopeDigest(env)||costs.pricingDigest!==costOperationDigest({contract:'pilot-sandbox-bounds-v1',costSourceDigest:costs.costSourceDigest,bounds:costs.bounds,...(costs.maximumDispatches===undefined?{}:{maximumDispatches:costs.maximumDispatches})}))throw Error('Hosted pricing or provider scope differs');return costs;
}
type DomainExecution={domainKind:JobAdmission['domainKind'];domainJobId:string;sourceGeneration:number;sourceDigest:string};
/** IO is outside SQL locks; publication and current source/lease checks share one transaction. */
export async function runGovernedExecution<T>(input:{request:ExecutionRequest;domain:DomainExecution;sourceCurrent:SourceFence;prepareOutput?:(output:ExecutionOutput)=>Promise<void>;complete:(db:PoolClient,output:ExecutionOutput)=>Promise<T>;localAssets:{signaturesPath:string;ocrAssetsPath:string}}):Promise<T>{
 validateExecution(input.request);
 if(executionBackend()==='local'){
  const handle=await withTransaction(db=>admitLocalJob(db,{id:input.request.id,...input.domain,imageDigest:input.request.imageDigest,deadlineAt:input.request.deadlineAt},input.sourceCurrent));let stopped=false;
  try{return await withLocalHeartbeat(handle,input.sourceCurrent,input.request.signal,async signal=>{
   const output=await new LocalJobExecutor(input.localAssets,()=>{stopped=true;}).execute({...input.request,signal});
   if(input.prepareOutput)await withOperationalIo(()=>input.prepareOutput!(output));signal.throwIfAborted();
   return withTransaction(async db=>{if(!await fenceLocalJob(db,handle,input.sourceCurrent))throw Error('Execution source changed');const result=await input.complete(db,output);signal.throwIfAborted();if(!await fenceLocalJob(db,handle,async()=>true))throw Error('Execution lease changed');await db.query("UPDATE operations_local_jobs SET state='succeeded',finished_at=clock_timestamp() WHERE id=$1",[handle.id]);return result;});
  });}catch(error){await settleLocalJob(handle,stopped?'failed':'reconciling');throw error;}
 }
 const credentials=hostedExecutionCredentials(),costs=hostedCostConfiguration(),environmentId=process.env.TURAS_ENVIRONMENT_ID;
 if(!environmentId)throw Error('Explicit execution environment required');
 const admission={environmentId,...input.domain,imageDigest:input.request.imageDigest,inputDigest:input.request.inputs[0].digest,inputBytes:input.request.inputs[0].sizeBytes,deadlineAt:input.request.deadlineAt};
 const binding={budgetId:costs.budgetId,environmentId,category:'sandbox' as const,scopeDigest:costs.scopeDigest,pricingDigest:costs.pricingDigest,operationDigest:sandboxOperationDigest(admission,input.request.kind),maximumDispatches:costs.maximumDispatches};
 const budget=serviceBudgetAuthority(binding);
 const handle=await withTransaction(async db=>{const reservationId=await reserveServiceCost(db,binding,costs.bounds[input.request.kind]);return admitHostedJob(db,{...admission,reservationId},budget,input.sourceCurrent);});
 try{
  await withTransaction(db=>startHostedJob(db,handle,budget,input.sourceCurrent));
  return await withHostedHeartbeat(handle,withTransaction,input.sourceCurrent,async signal=>{
   const output=await new SandboxJobExecutor(credentials,hostedSandboxLease(handle,withTransaction,budget,input.sourceCurrent)).execute({...input.request,id:handle.id,signal});
   if(output.exitCode!==0)throw Error(input.request.kind==='artifact-scan'?(output.exitCode===1?'unsafe_content':output.safeFailure??'scan_unavailable'):output.safeFailure??'parser_failed');
   if(input.prepareOutput)await withOperationalIo(()=>input.prepareOutput!(output));signal.throwIfAborted();let result:T|undefined;
   await withTransaction(db=>publishHostedOutput(db,handle,output,input.sourceCurrent,async(db,verified)=>{result=await input.complete(db,verified);}));return result as T;
  },input.request.signal);
 }catch(error){await withTransaction(db=>cancelHostedJob(db,handle,budget));throw error;}
}
