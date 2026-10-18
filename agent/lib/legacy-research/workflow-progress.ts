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

/** Terminal workflow failure releases only its pre-existing reservation. This
 * cleanup remains safe after logout: it cannot read facts or restart paid work. */
export async function failReservedResearch(kind:string,ctx:WorkflowStepToolContext){
 'use step';
 const principal=ctx.session.auth.current,attemptId=principal?.attributes?.turasAttemptId;
 if(!principal?.principalId || typeof attemptId!=='string')return;
 const {withTransaction}=await import('../../../lib/server/db/client');
 const {getServerConfig}=await import('../../../lib/server/config');
 await withTransaction(async db=>{
  const bound=(await db.query(`SELECT c.id,c.eve_session_id,g.as_of FROM conversations c
   JOIN general_context_receipts g ON g.conversation_id=c.id WHERE g.attempt_id=$1
    AND c.owner_principal_id=$2 AND g.owner_principal_id=$2 AND c.eve_session_id=$3 AND c.environment_id=$4`,[attemptId,principal.principalId,ctx.session.id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!bound || (await conversationFeature(db,bound.id)).kind!=='normal')return;
  await db.query(`UPDATE turas_research_requests r SET lease_until=least(r.lease_until,clock_timestamp())
   WHERE r.environment_id=$1 AND r.owner_user_id=$2 AND r.parent_session_id=$3 AND r.scope->>'kind'=$4
    AND r.receipt IS NULL AND r.started_at>=$5 AND NOT EXISTS(SELECT 1 FROM general_context_receipts later
      WHERE later.conversation_id=$6 AND later.as_of>$5 AND later.as_of<=r.started_at)`,[getServerConfig().TURAS_ENVIRONMENT_ID,principal.principalId,ctx.session.id,kind,bound.as_of,bound.id]);
 });
}

/** Supply canonical scope from the authorized reservation, not a UUID that the
 * root model may omit or transcribe incorrectly in free-form delegation text. */
export async function reservedSpecialistInvocation(kind:'customer-update'|'best-practices'|'solution',input:{message:string;agentId?:string},ctx:WorkflowStepToolContext){
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
