import {randomUUID} from 'node:crypto';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {expansionAdviceRequestSchema,expansionAdvicePrompt,expansionAdviceInstructions,expansionEvidenceTemporalStatus,EXPANSION_ADVICE_LIMITS} from '../../expansion/advice';
import {getServerConfig} from '../config';
import {createOwnedConversation} from '../conversations/repository';
import {expansionTransaction} from './service';
import {expansionHash} from './commands';
import {lockExpansionActor,requireExpansionEnvironment,type ExpansionActor} from './policy';
import {expansionScope} from './repository';
import {captureExpansionAdviceContext,type ExpansionAdviceScope} from './context';
/** Deterministic operation UUID keeps user-scoped advice keys out of the generic
 * globally unique creation-operation namespace. No customer prose enters it. */
function operationId(parts:unknown){const hash=expansionHash(parts).slice(0,32).split('');hash[12]='5';hash[16]=((parseInt(hash[16]!,16)&3)|8).toString(16);const value=hash.join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;}
export async function prepareExpansionAdvice(actor:ExpansionActor,customerId:string,raw:unknown){
 const parsed=expansionAdviceRequestSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(400,'invalid_input','Invalid expansion advice request');
 const input=parsed.data,env=getServerConfig().TURAS_ENVIRONMENT_ID,digest=expansionHash({customerId,input});
 return expansionTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);await requireExpansionEnvironment(db,true,true);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`expansion-advice:${env}:${actor.workspaceId}:${actor.membershipId}`]);
  const prior=(await db.query(`SELECT a.*,c.owner_principal_id,c.context_login_session_id,c.creation_operation_id,b.customer_id,b.workload_id,b.selected_engagement_ids,b.selected_hypothesis_ids
   FROM expansion_advice_attempts a JOIN conversations c ON c.id=a.conversation_id JOIN expansion_advice_bindings b ON b.id=a.binding_id
   WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.owner_membership_id=$3 AND a.request_key=$4`,[env,actor.workspaceId,actor.membershipId,input.requestKey])).rows[0];
  if(prior){
   if(prior.request_digest!==digest)throw new HttpFailure(409,'key_conflict','Request key has different input');
   if(prior.customer_id!==customerId||prior.owner_principal_id!==actor.principalId||prior.context_login_session_id!==actor.sessionId)throw hiddenRecord();
   if(!['prepared','running','completed'].includes(prior.state)||new Date(prior.created_at).getTime()+30*86400000<=Date.now()||prior.state==='prepared'&&new Date(prior.created_at).getTime()+EXPANSION_ADVICE_LIMITS.requestExpiryMs<=Date.now())throw new HttpFailure(409,'expansion_context_changed','Reconcile the previous advice request');
   const retained=(await db.query("SELECT payload FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='context'",[prior.id])).rows[0];
   if(!retained||(await db.query('SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=$1',[prior.id])).rowCount)throw new HttpFailure(409,'expansion_context_changed','Expansion advice is no longer retained');
   const bound:ExpansionAdviceScope={bindingId:prior.binding_id,scopeId:prior.scope_id,conversationId:prior.conversation_id,ownerMembershipId:actor.membershipId,customerId,workloadId:prior.workload_id,audience:'internal',selectedEngagementIds:prior.selected_engagement_ids,selectedHypothesisIds:prior.selected_hypothesis_ids};
   const current=await captureExpansionAdviceContext(db,actor,bound,input.sourceRefs,input.question);
   if(current.digest!==expansionHash(retained.payload.fence))throw new HttpFailure(409,'expansion_context_changed','Selected expansion inputs changed');
   return {attemptId:prior.id as string,conversationId:prior.conversation_id as string,operationId:prior.creation_operation_id as string,nativeRequestId:prior.native_request_id as string,state:prior.state as string};
  }
  const scope=await expansionScope(db,actor,customerId,input.workloadId,{create:true});if(!scope)throw hiddenRecord();if(scope.generation!==input.expectedVersion)throw new HttpFailure(409,'scope_changed','Expansion scope changed; refresh before requesting advice');
  if((await db.query("SELECT 1 FROM expansion_advice_attempts WHERE environment_id=$1 AND workspace_id=$2 AND owner_membership_id=$3 AND scope_id=$4 AND state IN ('prepared','running','unconfirmed')",[env,actor.workspaceId,actor.membershipId,scope.id])).rowCount)throw new HttpFailure(409,'advice_active','Finish or reconcile active expansion advice for this scope');
  const admissions=Number((await db.query("SELECT count(*) AS n FROM expansion_advice_attempts WHERE environment_id=$1 AND workspace_id=$2 AND owner_membership_id=$3 AND created_at>clock_timestamp()-interval '1 hour'",[env,actor.workspaceId,actor.membershipId])).rows[0].n);
  if(admissions>=EXPANSION_ADVICE_LIMITS.hourlyAdmissions)throw new HttpFailure(429,'advice_limit','Expansion advice admission limit reached',3600);
  await db.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[customerId,actor.workspaceId]);
  const operation=operationId(['expansion-advice',env,actor.workspaceId,actor.membershipId,input.requestKey]);
  const conversation=(await createOwnedConversation(actor,{customerId,requestKey:operation,title:'Product expansion advice'},db)).conversation;
  const bindingId=randomUUID(),attemptId=randomUUID(),nativeRequestId=randomUUID();
  const bound:ExpansionAdviceScope={bindingId,scopeId:scope.id,conversationId:conversation.id,ownerMembershipId:actor.membershipId,customerId,workloadId:input.workloadId,audience:'internal',selectedEngagementIds:input.selectedEngagementIds,selectedHypothesisIds:input.selectedHypothesisIds};
  const context=await captureExpansionAdviceContext(db,actor,bound,input.sourceRefs,input.question);
  const now=new Date(),snapshot={...context.snapshot,evidence:context.snapshot.evidence.map(item=>({...item,temporalStatus:expansionEvidenceTemporalStatus(item.quality?.validUntil,now)})),currentDate:now.toISOString().slice(0,10),proposalTimezone:'UTC',defaultNextReviewDate:new Date(now.getTime()+7*86400000).toISOString().slice(0,10)};
  const bytes=Buffer.byteLength(expansionAdviceInstructions(snapshot),'utf8')+Buffer.byteLength(expansionAdvicePrompt,'utf8')+Buffer.byteLength(JSON.stringify(context.sourceRefs),'utf8')+Buffer.byteLength(JSON.stringify(input),'utf8');
  if(bytes>EXPANSION_ADVICE_LIMITS.contextBytes)throw new HttpFailure(422,'scope_too_large','Narrow expansion advice context');
  await db.query(`INSERT INTO expansion_advice_bindings(id,scope_id,environment_id,workspace_id,customer_id,workload_id,audience,conversation_id,owner_membership_id,selected_engagement_ids,selected_hypothesis_ids)
   VALUES($1,$2,$3,$4,$5,$6,'internal',$7,$8,$9,$10)`,[bindingId,scope.id,env,actor.workspaceId,customerId,input.workloadId,conversation.id,actor.membershipId,input.selectedEngagementIds,input.selectedHypothesisIds]);
  await db.query(`INSERT INTO expansion_advice_attempts(id,binding_id,scope_id,environment_id,workspace_id,conversation_id,owner_membership_id,request_key,request_digest,native_request_id,context_bytes,dependency_count)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[attemptId,bindingId,scope.id,env,actor.workspaceId,conversation.id,actor.membershipId,input.requestKey,digest,nativeRequestId,bytes,context.dependencies.length]);
  for(const [kind,payload] of [['instruction',expansionAdvicePrompt],['context',{snapshot,fence:context.fence}],['source_map',context.sourceRefs],['question',input.question]] as const)await db.query('INSERT INTO expansion_advice_payloads(attempt_id,kind,content_digest,payload) VALUES($1,$2,$3,$4::jsonb)',[attemptId,kind,expansionHash(payload),JSON.stringify(payload)]);
  for(const selected of context.snapshot.hypotheses)if(selected.workingRevisionId)await db.query('INSERT INTO expansion_advice_revision_refs(attempt_id,revision_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[attemptId,selected.workingRevisionId]);
  for(const ref of context.dependencies)await db.query(`INSERT INTO expansion_advice_dependencies(id,attempt_id,kind,dependency_id,revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$4,$5,$6)`,[randomUUID(),attemptId,ref.kind,ref.revisionId,ref.generation,ref.contentDigest]);
  return {attemptId,conversationId:conversation.id,operationId:operation,nativeRequestId,state:'prepared'};
 });
}
