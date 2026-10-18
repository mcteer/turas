import {hiddenRecord,HttpFailure} from '../../contracts/http';
import {withTransaction} from '../db/client';
import {lockProfileActor} from '../profiles/policy';
import {readGovernedEvidenceContext} from '../profiles/context';
import {recordRetrievalConsumption} from '../retrieval/fences';
import {customerQuestionActor,assertCustomerQuestionReads} from './customer-accounts';
import {conversationFeature} from './feature';

type Principal=Parameters<typeof customerQuestionActor>[1];

/** The same governed search for a named account in an ordinary private chat. */
export async function searchNamedCustomerEvidence(principal:Principal,customerId:string|undefined,
 input:{query:string;scope:'customer'|'shared'|'combined';use:'discovery'|'accepted_fact'|'current_fact';limit:number}){
 if(input.scope!=='shared'&&!customerId)throw new HttpFailure(422,'invalid_query','Resolve the named account and supply accountId');
 const readScope=()=>withTransaction(async db=>{
  const scope=await customerQuestionActor(db,principal);
  const conversation=(await db.query<{conversation_id:string}>('SELECT conversation_id FROM response_attempts WHERE id=$1',[scope.attemptId])).rows[0];
  if(!conversation||(await conversationFeature(db,conversation.conversation_id)).kind!=='normal'||input.scope!=='shared'&&!scope.general&&scope.customerId!==customerId)throw hiddenRecord();
  if(input.scope!=='shared')await lockProfileActor(db,scope.actor,customerId!,undefined,true);
  await assertCustomerQuestionReads(db,scope.actor,conversation.conversation_id,scope.attemptId);
  return {actor:scope.actor,attemptId:scope.attemptId,conversationId:conversation.conversation_id};
 });
 const bound=await readScope();
 const response=await readGovernedEvidenceContext(bound.actor,customerId??'',input.query,input);
 await withTransaction(async db=>{
  const scope=await customerQuestionActor(db,principal);
  if((await conversationFeature(db,bound.conversationId)).kind!=='normal')throw hiddenRecord();
  if(scope.attemptId!==bound.attemptId||scope.actor.sessionId!==bound.actor.sessionId||scope.actor.membershipId!==bound.actor.membershipId||scope.actor.kind!==bound.actor.kind||scope.actor.role!==bound.actor.role||scope.actor.workspaceId!==bound.actor.workspaceId||input.scope!=='shared'&&!scope.general&&scope.customerId!==customerId)throw hiddenRecord();
  if(input.scope!=='shared')await lockProfileActor(db,scope.actor,customerId!,undefined,true);
  await assertCustomerQuestionReads(db,scope.actor,bound.conversationId,bound.attemptId);
  await recordRetrievalConsumption(db,scope.actor,response.receiptId,bound.conversationId);
 });
 return response;
}
