import {responseFeature} from "../../../lib/server/conversations/feature";
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
