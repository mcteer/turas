import {hiddenRecord,HttpFailure} from '../../contracts/http';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {lockExpansionActor,requireExpansionEnvironment,type ExpansionActor} from './policy';
import {admitExpansionRequest,expansionHash} from './commands';
import {captureExpansionAdviceContext,type ExpansionAdviceScope} from './context';
import {expansionSourcesSchema} from './schema';
import {validateExpansionAdviceResult} from '../../expansion/advice';
export async function readExpansionAdviceStatus(actor:ExpansionActor,customerId:string,attemptId:string){
 await admitExpansionRequest(actor,customerId,'read');return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);await requireExpansionEnvironment(db,false,true);
  const row=(await db.query(`SELECT a.*,c.owner_principal_id,c.context_login_session_id,c.creation_operation_id,c.eve_session_id AS bound_native_session_id,b.customer_id,b.workload_id,b.selected_engagement_ids,b.selected_hypothesis_ids
   FROM expansion_advice_attempts a JOIN conversations c ON c.id=a.conversation_id JOIN expansion_advice_bindings b ON b.id=a.binding_id
   WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.owner_membership_id=$4 AND b.customer_id=$5`,[attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,customerId])).rows[0];
  if(!row||row.owner_principal_id!==actor.principalId||row.context_login_session_id!==actor.sessionId)throw hiddenRecord();
  const payloads=(await db.query('SELECT kind,payload,content_digest FROM expansion_advice_payloads WHERE attempt_id=$1',[attemptId])).rows;
  const context=payloads.find(item=>item.kind==='context')?.payload,output=payloads.find(item=>item.kind==='output');
  const retained=row.created_at.getTime()+30*86400000>Date.now()&&!(await db.query('SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=$1',[attemptId])).rowCount;
  let current=false,result=null,currentEvidence:unknown[]=[];
  if(retained&&context&&payloads.every(item=>expansionHash(item.payload)===item.content_digest))try{
   const scope:ExpansionAdviceScope={bindingId:row.binding_id,scopeId:row.scope_id,conversationId:row.conversation_id,ownerMembershipId:actor.membershipId,customerId,workloadId:row.workload_id,audience:'internal',selectedEngagementIds:row.selected_engagement_ids,selectedHypothesisIds:row.selected_hypothesis_ids};
   const checked=await captureExpansionAdviceContext(db,actor,scope,expansionSourcesSchema.parse(context.fence.requestRefs),context.snapshot.question);
   currentEvidence=checked.snapshot.evidence;
   current=checked.digest===expansionHash(context.fence);
   if(current&&row.state==='completed'&&output&&output.content_digest===row.output_digest)result=validateExpansionAdviceResult(output.payload,checked.sourceRefs.map(ref=>({id:ref.id,kind:ref.kind})),scope.selectedHypothesisIds);
  }catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;}
  const usage=(await db.query(`SELECT sum(u.input_tokens) AS input_tokens,sum(u.output_tokens) AS output_tokens,
   count(*) FILTER(WHERE u.outcome='unknown' OR u.input_tokens IS NULL OR u.output_tokens IS NULL) AS unknown_steps
   FROM expansion_advice_usage u JOIN expansion_model_step_receipts s ON s.id=u.step_id WHERE s.attempt_id=$1`,[attemptId])).rows[0];
  const count=(value:unknown)=>value===null||value===undefined?null:Number.isSafeInteger(Number(value))?Number(value):null;
  return {contractVersion:'expansion-advice-status-v1',attemptId,conversationId:row.conversation_id as string,operationId:row.creation_operation_id as string,nativeRequestId:row.native_request_id as string,
   state:!retained?'expired':row.state==='prepared'&&row.created_at.getTime()+300000<=Date.now()?'expired':row.state as string,failureCode:row.failure_code as string|null,nativeSessionId:row.bound_native_session_id as string|null,nativeTurnId:row.native_turn_id as string|null,responseAttemptId:row.response_attempt_id as string|null,question:current?context.snapshot.question as string:null,outputDigest:result?row.output_digest as string:null,result,current,retained,sourceRefs:result?context.fence.sourceRefs:[],evidence:result?currentEvidence:[],selectedEngagementIds:row.selected_engagement_ids as string[],
   modelSteps:Number(row.model_steps),readCalls:Number(row.read_calls),contextBytes:Number(row.context_bytes),dependencyCount:Number(row.dependency_count),
   usage:{inputTokens:count(usage.input_tokens),outputTokens:count(usage.output_tokens),unknownSteps:Number(usage.unknown_steps)},
   deadlineAt:row.deadline_at?.toISOString()??null,createdAt:row.created_at.toISOString()};
 });
}
