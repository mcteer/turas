import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {validateExpansionAdviceResult} from '../../expansion/advice';
import {getServerConfig} from '../config';
import {expansionCommandSchema,expansionSourceSchema,expansionSourcesSchema,type ExpansionSource} from './schema';
import {lockExpansionActor,requireExpansionEnvironment,type ExpansionActor} from './policy';
import {expansionHash,lockExpansionCommandKey,expansionReceipt,admitExpansionCommand} from './commands';
import {saveExpansionRevision,expansionTransaction} from './service';
import {captureExpansionAdviceContext,type ExpansionAdviceScope} from './context';
const unavailable=()=>new HttpFailure(409,'suggestion_unavailable','Only completed retained current advice can supply a suggestion');
const original=(ref:ExpansionSource)=>{const {citationId:_permission,...identity}='citationId' in ref?ref:{...ref,citationId:undefined};return identity;};
export async function saveExpansionSuggestion(actor:ExpansionActor,customerId:string,raw:unknown){
 const command=expansionCommandSchema.parse(raw);if(command.operation!=='save_suggestion')throw new HttpFailure(400,'invalid_input','Use an exact retained expansion suggestion');
 const digest=expansionHash({customerId,command});await admitExpansionCommand(actor,customerId,command.requestKey,digest);
 return expansionTransaction(async db=>{
  const owners=[...(command.content.nextStep.owner.kind==='membership'?[command.content.nextStep.owner.membershipId]:[]),...command.content.prerequisites.flatMap(item=>item.ownerMembershipId?[item.ownerMembershipId]:[])];
  await lockExpansionActor(db,actor,customerId,owners,false);await lockExpansionCommandKey(db,actor,command.requestKey);
  const prior=await expansionReceipt(db,actor,customerId,command.requestKey,digest);if(prior)return prior;
  await requireExpansionEnvironment(db,true,true);
  const row=(await db.query(`SELECT a.*,b.customer_id,b.workload_id,b.selected_engagement_ids,b.selected_hypothesis_ids,c.owner_principal_id,c.context_login_session_id
   FROM expansion_advice_attempts a JOIN expansion_advice_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
   WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.owner_membership_id=$4 AND b.customer_id=$5`,[command.attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,customerId])).rows[0];
  if(!row||row.owner_principal_id!==actor.principalId||row.context_login_session_id!==actor.sessionId||row.workload_id!==command.workloadId)throw hiddenRecord();
  if(row.state!=='completed'||row.output_digest!==command.outputDigest||row.created_at.getTime()+30*86400000<=Date.now()||(await db.query('SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=$1',[row.id])).rowCount)throw unavailable();
  const payloads=(await db.query('SELECT kind,payload,content_digest FROM expansion_advice_payloads WHERE attempt_id=$1',[row.id])).rows;
  const context=payloads.find(item=>item.kind==='context')?.payload,output=payloads.find(item=>item.kind==='output');
  if(!context||!output||payloads.some(item=>expansionHash(item.payload)!==item.content_digest)||output.content_digest!==command.outputDigest)throw unavailable();
  const sourceMap=z.array(expansionSourceSchema).max(200).parse(payloads.find(item=>item.kind==='source_map')?.payload);
  const scope:ExpansionAdviceScope={bindingId:row.binding_id,scopeId:row.scope_id,conversationId:row.conversation_id,ownerMembershipId:actor.membershipId,customerId,workloadId:row.workload_id,audience:'internal',selectedEngagementIds:row.selected_engagement_ids,selectedHypothesisIds:row.selected_hypothesis_ids};
  const suggestion=validateExpansionAdviceResult(output.payload,sourceMap.map(ref=>({id:ref.id,kind:ref.kind})),scope.selectedHypothesisIds).proposals[command.suggestionIndex];if(!suggestion)throw unavailable();
  const required=sourceMap.filter(ref=>suggestion.citationKeys.includes(ref.id)),refs=[...command.sourceRefs];
  for(const ref of required){const supplied=refs.find(candidate=>candidate.id===ref.id);if(supplied&&expansionHash(original(supplied))!==expansionHash(original(ref)))throw new HttpFailure(422,'invalid_source','Original suggestion citation identity cannot be replaced');if(!supplied)refs.push(ref);}
  const checked=await captureExpansionAdviceContext(db,actor,scope,expansionSourcesSchema.parse(context.fence.requestRefs),context.snapshot.question,{refs:command.sourceRefs,selected:command.selectedEngagementIds,links:command.deliveryLinks});
  if(checked.digest!==expansionHash(context.fence))throw new HttpFailure(409,'expansion_context_changed','Selected expansion inputs changed');
  const selectedEngagementIds=[...new Set([...command.selectedEngagementIds,...required.flatMap(ref=>'engagementId' in ref?[ref.engagementId]:[])])];
  // Bounded governed authoring performs current human content, original-source,
  // member, duplicate and scope-version checks. It always creates a proposed head.
  return saveExpansionRevision(db,actor,customerId,{...command,operation:'save_hypothesis',sourceRefs:expansionSourcesSchema.parse(refs),selectedEngagementIds},
   {digest,operation:'save_suggestion',attemptId:row.id,outputDigest:command.outputDigest,suggestionIndex:command.suggestionIndex});
 });
}
