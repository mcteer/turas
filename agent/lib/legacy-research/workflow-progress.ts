import {conversationFeature,responseFeature} from "../../../lib/server/conversations/feature";
import type {WorkflowStepToolContext} from 'eve/tools';
import {researchIdentity} from '../../../lib/server/research/specialists/identity';
import {researchRequestProgress,researchProgressSchema} from '../../../lib/server/research/specialists/research-cache/requests';
export async function researchProgress(key:string,ctx:WorkflowStepToolContext){
 'use step';
 const identity=await researchIdentity(ctx.session.auth.current);
 if(!identity || ctx.abortSignal.aborted)return {status:'unavailable' as const,reference:null,reason:'Authenticated, uncancelled research is required.'};
 return researchProgressSchema.parse(await researchRequestProgress(identity,key,ctx.abortSignal));
}

export async function assertOrdinaryWorkflow(ctx:WorkflowStepToolContext){
 'use step';
 if((await responseFeature(ctx.session.auth.current))?.kind!=='normal')throw new Error('Research workflows are available only in ordinary chat');
 await researchIdentity(ctx.session.auth.current);
 ctx.abortSignal.throwIfAborted();
}

/** Supply canonical scope from the authorized reservation, not a UUID that the
 * root model may omit or transcribe incorrectly in free-form delegation text. */
export async function reservedSpecialistInvocation(kind:'customer-update'|'best-practices'|'solution',input:{message:string},ctx:WorkflowStepToolContext){
 'use step';
 ctx.abortSignal.throwIfAborted();
 const principal=ctx.session.auth.current,attemptId=principal?.attributes?.turasAttemptId;
 if(!principal?.principalId || typeof attemptId!=='string')throw new Error('Research identity unavailable');
 const {withTransaction}=await import('../../../lib/server/db/client');
 const {readResearchRuntimeAuthority}=await import('../../../lib/server/research/specialists/runtime-authority');
 const {requestScopeSchema}=await import('../../../lib/server/research/specialists/research-cache/schema');
 const scope=await withTransaction(async db=>{
   const authority=await readResearchRuntimeAuthority(db,attemptId,principal.principalId!,{parentSessionId:ctx.session.id,kind});
   const pending=authority?.requests.filter(request=>!request.completed)??[];
   if(pending.length!==1)throw new Error('No unique pending specialist reservation');
   return requestScopeSchema.parse(pending[0].scope);
 });
 return {...input,message:`Server-bound research reservation: ${JSON.stringify(scope)}\nCall get_research_context first using this exact accountId. The reservation supplies the question and workload.\n\nParent research instructions:\n${input.message}`};
}

/** Native serve results already arrive once through Eve. Only an independently
 * joined cache request needs the older durable polling join. */
export async function isOwnedNativeResearch(key:string,ctx:WorkflowStepToolContext){
 'use step';
 const identity=await researchIdentity(ctx.session.auth.current);
 const {withTransaction}=await import('../../../lib/server/db/client');
 return withTransaction(async db=>Boolean((await db.query(`SELECT 1 FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id
  WHERE a.research_key=$1 AND d.parent_session_id=$2 AND d.environment_id=$3 AND d.workspace_id=$4 AND d.owner_principal_id=$5 LIMIT 1`,
 [key,ctx.session.id,identity.environmentId,identity.workspaceId,identity.principalId])).rowCount));
}
