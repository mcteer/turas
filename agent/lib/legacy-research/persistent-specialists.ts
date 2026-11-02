import type {WorkflowServeContext,WorkflowServeReceive,WorkflowStepToolContext} from 'eve/tools';
import {getWorkflowMetadata,sleep,createHook,type WorkflowHook} from 'eve/workflow';
import type {SpecialistOutcome} from '../../../lib/server/research/specialists/discussion-results';
import type {SpecialistKind} from '../../../lib/contracts/specialist-discussions';
import {specialistResults} from './specialist-results';
import {logSpecialistFailure} from '../../../lib/server/research/specialists/discussion-diagnostics';

type Input={message:string};
type Context=WorkflowServeContext<SpecialistOutcome>;
const unavailable=(kind:SpecialistKind):SpecialistOutcome=>({kind,status:'unavailable',reference:null,reason:'This specialist call could not proceed. Use an eligible existing result or request a fresh authorized assignment. Do not automatically retry research.'});
const configurations={
 'customer-update':{worker:'customer-recon-worker',schema:specialistResults['customer-recon']},
 solution:{worker:'implementation-research-worker',schema:specialistResults['implementation-research']},
 'best-practices':{worker:'vercel-best-practices-worker',schema:specialistResults['vercel-best-practices']},
};

async function prepare(kind:SpecialistKind,input:Input,callId:string,workflowRunId:string,ctx:Context){
 'use step';
 const {admitSpecialistCall}=await import('../../../lib/server/research/specialists/discussions');
 const {responseFeature}=await import('../../../lib/server/conversations/feature');
 // Eve replaces a directly passed serve context with the current call's step
 // context here (documented WorkflowServeContext contract).
 const step=ctx as unknown as WorkflowStepToolContext;
 step.abortSignal.throwIfAborted();
 if((await responseFeature(step.session.auth.current))?.kind!=='normal')throw Error('Ordinary research authority required');
 const principal=step.session.auth.current,attemptId=principal?.attributes?.turasAttemptId;
 if(!principal?.principalId||typeof attemptId!=='string')throw Error('Research identity unavailable');
 const admitted=await admitSpecialistCall({kind,message:input.message,callId,workflowRunId,attemptId,principalId:principal.principalId,parentSessionId:step.session.id});
 const contextTool=kind==='best-practices'?'get_practice_context':'get_research_context',finalizerTool=kind==='best-practices'?'finalize_vercel_practices':kind==='customer-update'?'finalize_customer_update':'finalize_research';
 return {...admitted,message:`Server-bound research reservation: ${JSON.stringify(admitted.scope)}\nCall ${contextTool} first using this exact accountId. The reservation supplies the current question and workload. This is a new admitted assignment, even when this child already completed earlier work. Reuse eligible prior evidence, but successfully finalize the current assignment once using ${finalizerTool} with its current context/reservation, including a refinement that only reorganizes stored guidance. Follow its pre-execution validation-correction rules. Return that finalizer's current receipt unchanged. An earlier assignment's stored reference does not complete this reservation. Do not restart discovery unless this assignment requires it.\n\nParent research instructions:\n${input.message}`};
}
async function publish(kind:SpecialistKind,conversationId:string,discussionId:string,assignmentId:string,output:{status:string;reference:unknown},ctx:Context){
 'use step';
 const {researchIdentity}=await import('../../../lib/server/research/specialists/identity');
 const {publishSpecialistResult}=await import('../../../lib/server/research/specialists/discussion-results');
 const step=ctx as unknown as WorkflowStepToolContext;
 try{const identity=await researchIdentity(step.session.auth.current);
 return await publishSpecialistResult(identity,conversationId,discussionId,assignmentId,output,step.abortSignal);
 }catch(error){logSpecialistFailure(kind,'publish',error);throw error;}
}
async function close(workflowRunId:string,parentSessionId:string,owner:string,reason:'expired'|'failed'|'cancelled'){
 'use step';
 const {closeSpecialistWorkflow}=await import('../../../lib/server/research/specialists/discussions');
 await closeSpecialistWorkflow(workflowRunId,parentSessionId,owner,reason);
}
async function parentConversation(ctx:Context){
 'use step';
 const {withTransaction}=await import('../../../lib/server/db/client');
 const {getServerConfig}=await import('../../../lib/server/config');
 const row=await withTransaction(async db=>(await db.query('SELECT id FROM conversations WHERE eve_session_id=$1 AND owner_principal_id=$2 AND environment_id=$3',[ctx.session.id,ctx.session.auth.current?.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]);
 if(!row)throw Error('Owned parent conversation unavailable');
 return row.id as string;
}

export async function serveSpecialist(kind:SpecialistKind,receive:WorkflowServeReceive<Input>,ctx:Context){
 const workflowRunId=getWorkflowMetadata().workflowRunId,parentSessionId=ctx.session.id;
 const configuration=configurations[kind];
 let current=await receive();
 const owner=ctx.session.auth.current?.principalId;
 if(!owner){ctx.reply(unavailable(kind));return;}
 let child:ReturnType<Context['agent']>|undefined;
 let deadline:Promise<{expired:true}>|undefined;
 let control:WorkflowHook<{stop:true}>|undefined;
 let stopped:Promise<{stopped:true}>|undefined;
 try{
 for(;;){
  let accepted=false;
  if(ctx.session.auth.current?.principalId!==owner){ctx.reply(unavailable(kind));}
  else try{
   const admitted=await prepare(kind,current.input,current.callId,workflowRunId,ctx);
   accepted=true;
   if(!control){
    control=createHook<{stop:true}>({token:admitted.controlHookToken});
    const conflict=await control.getConflict();
    if(conflict&&conflict.runId!==workflowRunId)throw Error('Specialist control binding conflict');
    stopped=Promise.resolve(control).then(()=>({stopped:true as const}));
   }
   child??=ctx.agent(configuration.worker);
   deadline??=sleep(new Date(admitted.expiresAt)).then(()=>({expired:true as const}));
   if(admitted.duplicate){
    if(admitted.resultReference){ctx.reply(admitted.resultReference as SpecialistOutcome);}
    else {await close(workflowRunId,parentSessionId,owner,'failed');ctx.reply(unavailable(kind));return;}
   }else{
    const work=child.send<unknown>(admitted.message,{outputSchema:configuration.schema,signal:current.abortSignal}).then(response=>response.result());
    const outcome=await Promise.race([work,deadline,stopped!]);
    if('stopped' in outcome){await close(workflowRunId,parentSessionId,owner,'cancelled');ctx.reply({...unavailable(kind),reason:'This specialist was stopped at its owner’s request. Do not automatically restart it.'});return;}
    if('expired' in outcome){await close(workflowRunId,parentSessionId,owner,'expired');ctx.reply(unavailable(kind));return;}
    if(outcome.status!=='completed'){logSpecialistFailure(kind,'child-result',outcome.error);await close(workflowRunId,parentSessionId,owner,'failed');ctx.reply(unavailable(kind));return;}
    const output=configuration.schema.parse(outcome.data);
    const result=await publish(kind,await parentConversation(ctx),admitted.discussionId,admitted.assignmentId,output,ctx);
    ctx.reply(result);
    if(result.status==='unavailable')return;
   }
  }catch(error){
   if(!current.abortSignal.aborted)logSpecialistFailure(kind,'workflow',error);
   if(current.abortSignal.aborted){await close(workflowRunId,parentSessionId,owner,'cancelled');throw error;}
   ctx.reply(unavailable(kind));
   if(accepted||!deadline){await close(workflowRunId,parentSessionId,owner,'failed');return;}
  }
  // Keep the exact receive promise until it resolves; Eve counts a received call
  // even if it loses a race. The absolute timer never renews on follow-up.
  const incoming=receive();
  const next=deadline?await Promise.race([incoming,deadline,stopped!]):await incoming;
  if('stopped' in next){await close(workflowRunId,parentSessionId,owner,'cancelled');return;}
  if('expired' in next){await close(workflowRunId,parentSessionId,owner,'expired');ctx.reply(unavailable(kind));return;}
  current=next;
 } }finally{control?.dispose();}
}
