import {z} from 'zod';
import {hiddenRecord} from '../../contracts/http';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {lockExpansionActor,requireExpansionEnvironment,type ExpansionActor} from './policy';
import {readExpansionAdviceStatus} from './advice-status';
export async function lookupExpansionAdvice(actor:ExpansionActor,customerId:string,requestKey:string){
 const id=await withTransaction(async db=>{await lockExpansionActor(db,actor,customerId);await requireExpansionEnvironment(db,false,true);
  const row=(await db.query(`SELECT a.id FROM expansion_advice_attempts a JOIN expansion_advice_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
   WHERE a.request_key=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.owner_membership_id=$4 AND b.customer_id=$5 AND c.owner_principal_id=$6 AND c.context_login_session_id=$7`,[requestKey,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,customerId,actor.principalId,actor.sessionId])).rows[0];if(!row)throw hiddenRecord();return row.id as string;
 });return readExpansionAdviceStatus(actor,customerId,id);
}
export async function stopExpansionAdvice(actor:ExpansionActor,customerId:string,attemptId:string,raw:unknown){
 z.object({}).strict().parse(raw);
 return withTransaction(async db=>{await lockExpansionActor(db,actor,customerId);await requireExpansionEnvironment(db,false,true);
  const row=(await db.query(`SELECT a.id,a.conversation_id,a.state,a.response_attempt_id,c.eve_session_id,a.native_turn_id FROM expansion_advice_attempts a
   JOIN expansion_advice_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
   WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.owner_membership_id=$4 AND b.customer_id=$5 AND c.owner_principal_id=$6 AND c.context_login_session_id=$7`,[attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,customerId,actor.principalId,actor.sessionId])).rows[0];if(!row)throw hiddenRecord();
  await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[row.conversation_id]);
  const latest=(await db.query('SELECT state,response_attempt_id FROM expansion_advice_attempts WHERE id=$1',[attemptId])).rows[0];
  if(latest.response_attempt_id)await db.query('SELECT id FROM response_attempts WHERE id=$1 FOR UPDATE',[latest.response_attempt_id]);
  const locked=(await db.query('SELECT state,response_attempt_id,native_turn_id FROM expansion_advice_attempts WHERE id=$1 FOR UPDATE',[attemptId])).rows[0];
  Object.assign(row,locked);
  if(['prepared','running','unconfirmed'].includes(row.state)){
   await db.query("UPDATE expansion_advice_attempts SET state='cancelled',failure_code='cancelled',settled_at=COALESCE(settled_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1",[attemptId]);
   if(row.response_attempt_id)await db.query("UPDATE response_attempts SET response_state='stopping',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND response_state IN ('pending','running','stopping')",[row.response_attempt_id]);
   row.state='cancelled';
  }
  return {attemptId,state:row.state as string,nativeSessionId:row.eve_session_id as string|null,nativeTurnId:row.native_turn_id as string|null};
 });
}
