import {createHash} from 'node:crypto';
import type {wrapLanguageModel} from 'ai';
import type {AppIdentity} from './identity';
import {withTransaction} from '../../db/client';
import {hiddenRecord} from '../../../contracts/http';
import {getServerConfig} from '../../config';
import {authorizeSpecialistWorker,type SpecialistWorkerIdentity} from './discussions';
import {reserveLockedSpecialistOperation,markSpecialistOperationCompleted} from './discussion-budget';
import {guardSpecialistProvider,currentPricing} from './discussion-provider';

type Model=Parameters<typeof wrapLanguageModel>[0]['model'];
export type SpecialistResearchGuard={
 beforeRequest:(fingerprint:string,embedding?:{inputTokens:number})=>Promise<{complete:()=>Promise<void>}>;
 wrapModel:(model:Model,fingerprint:string)=>Model;
};

/** Non-agent research jobs retain their existing governance. Worker calls have
 * an owned discussion and cannot omit that discussion's admission boundary. */
export async function specialistResearchGuard(identity:AppIdentity,callId:string):Promise<SpecialistResearchGuard|undefined>{
 if(!identity.workerSessionId)return undefined;
 if(!identity.responseAttemptId||!callId)throw hiddenRecord();
 const scope=await withTransaction(async db=>(await db.query<{parent_session_id:string;kind:SpecialistWorkerIdentity['kind']}>(`SELECT parent_session_id,kind FROM specialist_discussions
  WHERE child_session_id=$1 AND environment_id=$2 AND workspace_id=$3 AND owner_principal_id=$4`,
 [identity.workerSessionId,getServerConfig().TURAS_ENVIRONMENT_ID,identity.workspaceId,identity.principalId])).rows[0]);
 if(!scope)throw hiddenRecord();
 const runtime:SpecialistWorkerIdentity={attemptId:identity.responseAttemptId,principalId:identity.principalId,parentSessionId:scope.parent_session_id,workerSessionId:identity.workerSessionId,kind:scope.kind};
 const key=(fingerprint:string)=>createHash('sha256').update(JSON.stringify([identity.workerSessionId,identity.responseAttemptId,callId,fingerprint])).digest('hex');
 return {
  async beforeRequest(fingerprint,embedding){
   const price=embedding?await currentPricing('openai/text-embedding-3-small'):null;
   const inputTokens=embedding?.inputTokens??0;
   const ceilingMicroUsd=price?Math.ceil(inputTokens*price.input*1000000):10000;
   const operation=await withTransaction(async db=>{
    const bound=await authorizeSpecialistWorker(db,runtime);
    return reserveLockedSpecialistOperation(db,{discussionId:bound.discussion.id,assignmentId:bound.assignmentId,conversationId:bound.discussion.conversation_id},{nativeStepKey:'research:'+key(fingerprint),model:embedding?'openai/text-embedding-3-small':'context/standard-web',
     ceiling:{inputTokens,outputTokens:0,microUsd:ceilingMicroUsd},pricing:price??{unit:'request',ceilingMicroUsd,observedAt:new Date().toISOString()}});
   });
   return {complete:()=>markSpecialistOperationCompleted(operation.id)};
  },
  wrapModel:(model,fingerprint)=>guardSpecialistProvider(model,{...runtime,turnId:'research:'+key(fingerprint),stepIndex:0}),
 };
}
