import {defineDynamic,type DynamicModelContext} from 'eve';
import {runs} from 'eve/events';
import {withTransaction} from '../../lib/server/db/client';
import {authorizeSpecialistWorker} from '../../lib/server/research/specialists/discussions';
import {guardSpecialistProvider} from '../../lib/server/research/specialists/discussion-provider';
import {budgetedResearchModel} from '../../lib/server/research/specialists/evaluation-budget';
import {getServerConfig} from '../../lib/server/config';
import {hiddenRecord} from '../../lib/contracts/http';

export function specialistModel(kind:'customer-update'|'best-practices'|'solution'){
 return defineDynamic(async(ctx:DynamicModelContext)=>{
  const principal=ctx.session.auth.current,attemptId=principal?.attributes?.turasAttemptId,turnId=ctx.turn?.id;
  if(!principal?.principalId||typeof attemptId!=='string'||!turnId)throw hiddenRecord();
  const parent=await withTransaction(async db=>{
   const parent=(await db.query<{parent:string}>(`SELECT c.eve_session_id AS parent FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
     WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3 AND c.binding_state='bound'`,[attemptId,principal.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.parent;
   if(!parent||parent===ctx.session.id)throw hiddenRecord();
   await authorizeSpecialistWorker(db,{attemptId,principalId:principal.principalId!,parentSessionId:parent,workerSessionId:ctx.session.id,kind});
   return parent;
  });
  const requested=runs(ctx.view,{turnId});
  const stepIndex=requested.length-(requested.at(-1)?.status==='requested'?1:0);
  return guardSpecialistProvider(budgetedResearchModel('openai/gpt-5.6-terra'),{
   principalId:principal.principalId,attemptId,parentSessionId:parent,workerSessionId:ctx.session.id,kind,turnId,stepIndex,
  });
 });
}
