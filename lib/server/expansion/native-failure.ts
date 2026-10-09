import type {ExpansionModelFailure} from './model-failure';
import type {ExecutionModelIdentity} from '../execution/native-admission';
import type {FeaturePrincipal} from '../conversations/feature';
import {expansionId} from '../../contracts/expansion';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {hiddenRecord} from '../../contracts/http';
import {lockExpansionActor,type ExpansionActor} from './policy';
/** Metadata settlement does not retrieve failed or withdrawn source prose. */
export async function failExpansionNativeAttempt(principal:FeaturePrincipal,code='invalid_native_step',identity?:ExecutionModelIdentity,usage?:ExpansionModelFailure){
 const responseId=principal?.attributes?.turasAttemptId;if(!expansionId.safeParse(responseId).success||!expansionId.safeParse(principal?.principalId).success)throw hiddenRecord();
 return withTransaction(async db=>{
  const row=(await db.query(`SELECT a.id,b.customer_id,c.owner_principal_id,c.context_login_session_id,c.workspace_id,c.context_membership_id,
   s.expires_at,p.login_name,p.display_name,m.kind,m.role FROM expansion_advice_attempts a JOIN expansion_advice_bindings b ON b.id=a.binding_id
   JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id
   JOIN principals p ON p.id=c.owner_principal_id JOIN memberships m ON m.id=c.context_membership_id
   WHERE a.response_attempt_id=$1 AND a.environment_id=$2 AND c.owner_principal_id=$3`,[responseId,getServerConfig().TURAS_ENVIRONMENT_ID,principal!.principalId])).rows[0];
  if(!row)throw hiddenRecord();
  const actor:ExpansionActor={sessionId:row.context_login_session_id,token:'',expiresAt:row.expires_at,principalId:row.owner_principal_id,membershipId:row.context_membership_id,workspaceId:row.workspace_id,loginName:row.login_name,displayName:row.display_name,kind:row.kind,role:row.role};
  await lockExpansionActor(db,actor,row.customer_id);
  if(identity && usage && Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens) && usage.inputTokens!>=0 && usage.outputTokens!>=0){
   const receipt=(await db.query(`SELECT id FROM expansion_model_step_receipts WHERE attempt_id=$1 AND step_token=$2
    AND native_session_id=$3 AND response_attempt_id=$4 AND native_turn_id=$5`,
    [row.id,`${identity.turnId}/${identity.stepIndex}`,identity.nativeSessionId,identity.responseAttemptId,identity.turnId])).rows[0];
   if(!receipt)throw hiddenRecord();
   await db.query(`INSERT INTO expansion_advice_usage(step_id,outcome,input_tokens,output_tokens) VALUES($1,'failed',$2,$3)
    ON CONFLICT(step_id) DO NOTHING`,[receipt.id,usage.inputTokens,usage.outputTokens]);
  }
  await db.query("UPDATE expansion_advice_attempts SET state='failed',failure_code=$2,settled_at=COALESCE(settled_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1 AND state IN ('prepared','running')",[row.id,/^[a-z][a-z0-9_]{0,79}$/.test(code)?code:'invalid_native_step']);
 });
}
