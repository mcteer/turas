import {hiddenRecord} from '../../contracts/http';
import {withTransaction} from '../db/client';
import {researchIdentity} from '../research/specialists/identity';
import {searchVercelPracticeSourceReceipts} from '../research/specialists/research-cache/practice-library';
import {customerQuestionActor,assertCustomerQuestionReads} from './customer-accounts';
import {conversationFeature} from './feature';
import {practiceCitationPrefix,practiceSnapshotIsCurrent} from './practice-consumption';
import {lockProfileActor} from '../profiles/policy';

type Principal=Parameters<typeof customerQuestionActor>[1];
/** Reuse only an exact current-turn read, never a model name, picker, or a
 * customer mentioned in an older turn. Ambiguity requires an explicit ID. */
export async function ordinaryPracticeAccount(principal:Principal){
 return withTransaction(async db=>{
  const scope=await customerQuestionActor(db,principal);
  const conversation=(await db.query<{conversation_id:string}>('SELECT conversation_id FROM response_attempts WHERE id=$1',[scope.attemptId])).rows[0];
  if(!conversation||(await conversationFeature(db,conversation.conversation_id)).kind!=='normal')throw hiddenRecord();
  const ids=scope.general?(await db.query<{customer_id:string}>('SELECT customer_id FROM general_customer_read_scopes WHERE attempt_id=$1 ORDER BY customer_id LIMIT 2',[scope.attemptId])).rows.map(row=>row.customer_id):[scope.customerId];
  if(ids.length!==1)return undefined;
  await lockProfileActor(db,scope.actor,ids[0],undefined,true);
  return ids[0];
 });
}
/** Read the original public-practice library without exposing private request
 * product/topic metadata or treating documentation as customer adoption. */
export async function readOrdinaryPracticeEvidence(principal:Principal,accountId:string|undefined,query:string,signal:AbortSignal,maximumBytes=24576){
 if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1024||maximumBytes>24576)throw Error('Bounded practice response required');
 const identity=await researchIdentity(principal);
 // Reading retained public references also supports authorized synthetic pilot
 // context. Starting new research still requires a canonical research account.
 if(accountId)await withTransaction(db=>lockProfileActor(db,identity,accountId,undefined,true));
 signal.throwIfAborted();
 // Public product references use the original workspace-public library. Even
 // without a customer, authorize the ordinary owner/session before embedding.
 await withTransaction(async db=>{
  const scope=await customerQuestionActor(db,principal);
  const conversation=(await db.query<{conversation_id:string}>('SELECT conversation_id FROM response_attempts WHERE id=$1',[scope.attemptId])).rows[0];
  if(!conversation||(await conversationFeature(db,conversation.conversation_id)).kind!=='normal'||scope.actor.sessionId!==identity.sessionId||scope.actor.workspaceId!==identity.workspaceId||scope.actor.membershipId!==identity.membershipId||scope.actor.kind!==identity.kind||scope.actor.role!==identity.role||!scope.general&&scope.customerId!==accountId)throw hiddenRecord();
  await assertCustomerQuestionReads(db,scope.actor,conversation.conversation_id,scope.attemptId);
 });
 const found=await searchVercelPracticeSourceReceipts(identity,query,signal,!accountId);
 return withTransaction(async db=>{
  signal.throwIfAborted();const scope=await customerQuestionActor(db,principal);
  const conversation=(await db.query<{conversation_id:string}>('SELECT conversation_id FROM response_attempts WHERE id=$1',[scope.attemptId])).rows[0];
  if(!conversation||(await conversationFeature(db,conversation.conversation_id)).kind!=='normal'||scope.actor.sessionId!==identity.sessionId||scope.actor.workspaceId!==identity.workspaceId||scope.actor.membershipId!==identity.membershipId||scope.actor.kind!==identity.kind||scope.actor.role!==identity.role||!scope.general&&scope.customerId!==accountId)throw hiddenRecord();
  await assertCustomerQuestionReads(db,scope.actor,conversation.conversation_id,scope.attemptId);
  const selected:typeof found=[];
  for(const row of found)if(await practiceSnapshotIsCurrent(db,scope.actor,accountId,row.snapshotId))selected.push(row);
  const safe=(rows:typeof selected)=>rows.map(({source})=>({url:source.url,title:source.title,sourceType:source.sourceType,
   informationType:source.informationType,publishedAt:source.publishedAt,checkedAt:source.checkedAt,refreshAfter:source.refreshAfter,
   stale:source.stale,passages:source.passages}));
  const omitted:typeof found=[];
  const metadata=()=>omitted.map(({source})=>({url:source.url,title:source.title,checkedAt:source.checkedAt,stale:source.stale,passagesOmitted:true as const}));
  const result={omittedReferences:metadata(),kind:'public_product_reference' as const,sources:safe(selected),completenessWarnings:['Complete retained passages for each included public reference (the cached source itself can be partial); these do not establish that the customer uses the product or configuration. Stale references are historical evidence, not current guidance.']};
  while(Buffer.byteLength(JSON.stringify(result),'utf8')>maximumBytes){
   if(selected.length)omitted.unshift(selected.pop()!);
   else if(omitted.length)omitted.pop();
   else throw Error('Practice response metadata exceeds its bound');
   result.sources=safe(selected);result.omittedReferences=metadata();
   if(!result.completenessWarnings.includes('Lower-ranked public references omitted to fit the response limit'))result.completenessWarnings.push('Lower-ranked public references omitted to fit the response limit');
  }
  const returned=[...selected,...omitted];
  if(accountId&&returned.length)await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
   SELECT $1,customer_id,$3,CASE WHEN $3='internal' THEN internal_generation ELSE delivery_generation END,$4::text[]
   FROM customer_profile_state WHERE customer_id=$2 AND workspace_id=$5
   ON CONFLICT(attempt_id,customer_id) DO UPDATE SET citation_ids=ARRAY(SELECT DISTINCT unnest(general_customer_read_scopes.citation_ids||EXCLUDED.citation_ids)),checked_at=clock_timestamp()`,
   [scope.attemptId,accountId,scope.actor.kind==='internal'?'internal':'delivery',returned.map(row=>practiceCitationPrefix+row.snapshotId),scope.actor.workspaceId]);
  if(!accountId&&returned.length)await db.query('SELECT turas_record_workspace_practice_content($1,$2,$3,$4)',[scope.attemptId,scope.actor.principalId,scope.actor.sessionId,returned.map(row=>row.snapshotId)]);
  if(accountId&&returned.length)await db.query('SELECT turas_record_customer_practice_support($1,$2,$3,$4,$5)',[scope.attemptId,scope.actor.principalId,scope.actor.sessionId,accountId,returned.map(row=>row.snapshotId)]);
  return result;
 });
}
