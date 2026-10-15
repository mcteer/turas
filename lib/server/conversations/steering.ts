import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {withTransaction} from '../db/client';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {lockOwnedBinding} from './binding';
import {conversationFeature} from './feature';
import {assertCustomerQuestionReads} from './customer-accounts';
import {readCurrentAttemptContext} from '../profiles/attempt-context';
import {messageDigest,normalizeMessageText} from './message-integrity';
import {getServerConfig} from '../config';
import {type OrdinaryNativeMessage,nativeMessageText} from '../../conversations/native-message';
import {parseOrdinaryNativeMessage,nativeMessageDigest,summarizeNativeMessage} from './native-message';
import {attachmentLimits,parseAttachmentMessage} from '../../conversations/attachment-text';

async function ready(db:PoolClient){return Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)>=68;}
type Receipt={native_receipt:unknown;native_status:number|null;dispatch_state:string};
function replay(row:Receipt,nativeSessionId:string){
 if(row.native_receipt && row.native_status)return Response.json(row.native_receipt,{status:row.native_status,headers:{'cache-control':'private, no-store','x-eve-session-id':nativeSessionId}});
 throw new HttpFailure(409,'steering_unconfirmed','The correction outcome is unconfirmed; it was not sent again');
}

/** A correction is a new immutable user message within the active response,
 * never another response allowance or a renewed deadline. The route checks
 * owner/CSRF before this admission. A settled-turn race falls back to normal
 * new-turn admission under the same conversation mutex. */
export async function prepareOrdinarySteering(actor:CurrentSession,conversationId:string,nativeSessionId:string,requestKey:string,rawText:string|OrdinaryNativeMessage):Promise<
 {kind:'replay';response:Response}|{kind:'dispatch';id:string;attemptId:string}|null>{
 const parts=typeof rawText==='string'?null:parseOrdinaryNativeMessage(rawText);
 const text=parts?summarizeNativeMessage(parts):normalizeMessageText(rawText as string);
 const digest=parts?nativeMessageDigest(parts):messageDigest(text);
 const documentMessage=parseAttachmentMessage(parts?nativeMessageText(parts):text);
 if(documentMessage&&process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED==='1')throw new HttpFailure(503,'attachments_unavailable','Document messages are temporarily unavailable');
 if(!z.uuid().safeParse(requestKey).success || !text.trim() || Buffer.byteLength(text)>(documentMessage||parts?attachmentLimits.messageBytes:16384))throw new HttpFailure(422,'invalid_message','Invalid correction');
 return withTransaction(async db=>{
  const conversation=await lockOwnedBinding(db,actor,conversationId);
  if(parts&&(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)<72||process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED!=='1'||process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED==='1'))throw new HttpFailure(503,'native_files_unavailable','Native file messages are not enabled');
  if(conversation.eve_session_id!==nativeSessionId || (await conversationFeature(db,conversationId)).kind!=='normal')throw hiddenRecord();
  if(!await ready(db))throw new HttpFailure(503,'steering_unavailable','Chat correction requires the current database release');
  const existing=(await db.query<Receipt&{body_digest:string}>(`SELECT d.*,m.body_digest FROM submitted_messages m
    JOIN ordinary_steering_deliveries d ON d.message_id=m.id WHERE m.conversation_id=$1 AND m.request_key=$2`,[conversationId,requestKey])).rows[0];
  if(existing){if(existing.body_digest!==digest)throw new HttpFailure(409,'request_key_conflict','Request key already used');return {kind:'replay',response:replay(existing,nativeSessionId)};}
  // A retry of a regular send must retain its original normal-send receipt.
  if((await db.query('SELECT 1 FROM submitted_messages WHERE conversation_id=$1 AND request_key=$2',[conversationId,requestKey])).rowCount)return null;
  const parent=(await db.query<{id:string;deadline_at:Date;native_turn_id:string|null;dispatch_state:string;response_state:string}>(`SELECT a.id,a.native_turn_id,a.dispatch_state,a.response_state,
    greatest(a.deadline_at,(SELECT max(deadline_at) FROM native_input_resume_windows WHERE attempt_id=a.id)) AS deadline_at
    FROM response_attempts a WHERE a.conversation_id=$1 AND a.response_state IN('pending','running','stopping')
      AND a.dispatch_state<>'rejected' FOR UPDATE OF a`,[conversationId])).rows[0];
  if(!parent)return null;
  if(parent.response_state!=='running' || !parent.native_turn_id || !['admitted','uncertain'].includes(parent.dispatch_state))throw new HttpFailure(409,'steering_not_ready','The original response is not accepting corrections');
  if(!parent.deadline_at || parent.deadline_at.getTime()<=Date.now())throw new HttpFailure(409,'steering_expired','The response deadline has elapsed; check its status');
  if((await db.query(`SELECT 1 FROM ordinary_steering_deliveries WHERE attempt_id=$1
    AND dispatch_state IN('dispatching','admitted','uncertain') AND native_event_id IS NULL`,[parent.id])).rowCount)throw new HttpFailure(409,'steering_pending','A correction is still being confirmed');
  const recent=Number((await db.query(`SELECT count(*) FROM submitted_messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE c.owner_principal_id=$1 AND m.created_at>clock_timestamp()-interval '1 minute'`,[actor.principalId])).rows[0].count);
  if(recent>=20)throw new HttpFailure(429,'send_limit','Send limit reached',60);
  await assertCustomerQuestionReads(db,actor,conversationId,parent.id);
  await db.query(`INSERT INTO ordinary_continuation_authorities(id,attempt_id,login_session_id,membership_id,owner_principal_id,workspace_id,environment_id,valid_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id,login_session_id) DO NOTHING`,[randomUUID(),parent.id,actor.sessionId,actor.membershipId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.expiresAt]);
  await readCurrentAttemptContext(db,parent.id,actor.principalId);
  const messageId=randomUUID(),id=randomUUID();
  if(parts)await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text,ordinary_native_parts) VALUES($1,$2,$3,$4,$5,$6)`,[messageId,conversationId,requestKey,digest,text,JSON.stringify(parts)]);
  else await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)`,[messageId,conversationId,requestKey,digest,text]);
  await db.query(`INSERT INTO ordinary_steering_deliveries(id,attempt_id,message_id,login_session_id,deadline_at,dispatch_state)
    VALUES($1,$2,$3,$4,$5,'dispatching')`,[id,parent.id,messageId,actor.sessionId,parent.deadline_at]);
  return {kind:'dispatch',id,attemptId:parent.id};
 });
}

/** Called by the native channel's onMessage authorization, before execution. */
export async function deriveSteeringAttempt(actor:CurrentSession,nativeSessionId:string,requestKey:string,message:string|OrdinaryNativeMessage){
 const parts=typeof message==='string'?null:parseOrdinaryNativeMessage(message);
 const digest=parts?nativeMessageDigest(parts):messageDigest(message as string);
 return withTransaction(async db=>{
  if(!await ready(db))return null;
  const row=(await db.query(`SELECT d.attempt_id,m.body_digest,c.id AS conversation_id FROM ordinary_steering_deliveries d
    JOIN response_attempts a ON a.id=d.attempt_id JOIN submitted_messages m ON m.id=d.message_id
    JOIN conversations c ON c.id=a.conversation_id AND c.id=m.conversation_id
    WHERE c.eve_session_id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4
      AND m.request_key=$5 AND d.login_session_id=$6 AND d.dispatch_state='dispatching'
      AND d.deadline_at>clock_timestamp() AND a.response_state IN('running','completed')`,
    [nativeSessionId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,requestKey,actor.sessionId])).rows[0];
  if(!row)return null;
  if(row.body_digest!==digest)throw hiddenRecord();
  await lockOwnedBinding(db,actor,row.conversation_id);
  if((await conversationFeature(db,row.conversation_id)).kind!=='normal')throw hiddenRecord();
  await readCurrentAttemptContext(db,row.attempt_id,actor.principalId);
  await assertCustomerQuestionReads(db,actor,row.conversation_id,row.attempt_id);
  return row.attempt_id as string;
 });
}

export async function recordSteeringReceipt(id:string,nativeSessionId:string,response:Response){
 const body:unknown=await response.clone().json().catch(()=>null);
 const accepted=z.object({ok:z.literal(true),sessionId:z.literal(nativeSessionId),status:z.literal('accepted'),deliveryId:z.string().min(1)}).passthrough().safeParse(body);
 const rejected=response.status===409 && z.object({ok:z.literal(false),code:z.enum(['session_not_ready','session_not_active'])}).passthrough().safeParse(body).success;
 await withTransaction(async db=>{
  await db.query(`UPDATE ordinary_steering_deliveries SET dispatch_state=CASE WHEN native_event_id IS NOT NULL OR $2 THEN 'admitted' WHEN $3 THEN 'rejected' ELSE 'uncertain' END,
    native_delivery_id=COALESCE(native_delivery_id,$4),native_receipt=$5::jsonb,native_status=$6,updated_at=clock_timestamp()
    WHERE id=$1 AND native_receipt IS NULL`,[id,response.ok&&accepted.success,rejected,accepted.success?accepted.data.deliveryId:null,body?JSON.stringify(body):null,response.status]);
  if(rejected){
   // A completed original turn can race a correction that native admission
   // then rejects. Reconcile from its actual terminal event, never a guess.
   const settled=(await db.query(`UPDATE response_attempts a SET response_state='completed',updated_at=clock_timestamp(),revision=revision+1
    WHERE a.id=(SELECT attempt_id FROM ordinary_steering_deliveries WHERE id=$1)
      AND a.response_state='running' AND EXISTS(SELECT 1 FROM event_projections e WHERE e.conversation_id=a.conversation_id AND e.turn_id=a.native_turn_id AND e.event_type='turn.completed')
      AND NOT EXISTS(SELECT 1 FROM ordinary_steering_deliveries d WHERE d.attempt_id=a.id AND d.dispatch_state IN('dispatching','admitted','uncertain') AND d.native_event_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM ordinary_steering_deliveries d WHERE d.attempt_id=a.id AND d.native_turn_id IS DISTINCT FROM a.native_turn_id AND d.native_event_id IS NOT NULL)
      RETURNING a.id`,[id])).rows;
   for(const row of settled)await db.query(`UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE attempt_id=$1`,[row.id]);
  }
 });
}

export async function markSteeringUncertain(id:string){await withTransaction(db=>db.query(`UPDATE ordinary_steering_deliveries SET dispatch_state='uncertain',updated_at=clock_timestamp()
 WHERE id=$1 AND dispatch_state='dispatching' AND native_event_id IS NULL`).then(()=>{}));}

/** Event insertion precedes this call so the native identity is a real FK. */
export async function projectSteeringMessage(db:PoolClient,nativeSessionId:string,attemptId:string,event:{meta:{id?:string;deliveryIds?:readonly string[]};data?:Record<string,unknown>}){
 if(!await ready(db) || typeof event.data?.message!=='string' || typeof event.data.turnId!=='string')return false;
 const rows=(await db.query(`SELECT d.id,d.deadline_at,a.conversation_id FROM ordinary_steering_deliveries d
  JOIN submitted_messages m ON m.id=d.message_id JOIN response_attempts a ON a.id=d.attempt_id
  JOIN conversations c ON c.id=a.conversation_id AND c.id=m.conversation_id
  WHERE d.attempt_id=$1 AND c.eve_session_id=$2 AND (m.body_digest=$3 OR (to_jsonb(m)->'ordinary_native_parts' IS NOT NULL AND to_jsonb(m)->'ordinary_native_parts'<>'null'::jsonb AND m.text=$4)) AND d.native_event_id IS NULL
    AND (d.native_delivery_id IS NULL OR d.native_delivery_id=ANY($5::text[]) OR (cardinality($5::text[])=0 AND (to_jsonb(m)->'ordinary_native_parts' IS NULL OR to_jsonb(m)->'ordinary_native_parts'='null'::jsonb)))
    AND d.dispatch_state IN('dispatching','admitted','uncertain') AND a.response_state IN('running','completed') FOR UPDATE OF d`,
  [attemptId,nativeSessionId,messageDigest(event.data.message),event.data.message,event.meta.deliveryIds??[]])).rows;
 if(!rows.length)return false;
 if(rows.length!==1 || rows[0].deadline_at.getTime()<=Date.now())throw new HttpFailure(409,'steering_changed','Correction no longer matches an active response');
 await db.query(`UPDATE ordinary_steering_deliveries SET native_event_id=$2,native_turn_id=$3,dispatch_state='admitted',updated_at=clock_timestamp() WHERE id=$1`,[rows[0].id,event.meta.id,event.data.turnId]);
 await db.query(`UPDATE response_attempts SET response_state='running',updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND response_state='completed'`,[attemptId]);
 await db.query(`UPDATE watchdog_jobs SET state='pending',lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=deadline_at,updated_at=now() WHERE attempt_id=$1 AND state='settled'`,[attemptId]);
 return true;
}

export async function steeringTurnDeadline(db:PoolClient,attemptId:string,nativeSessionId:string,turnId:string){
 if(!await ready(db))return null;
 return (await db.query<{deadline_at:Date}>(`SELECT d.deadline_at FROM ordinary_steering_deliveries d JOIN response_attempts a ON a.id=d.attempt_id
  JOIN conversations c ON c.id=a.conversation_id WHERE d.attempt_id=$1 AND c.eve_session_id=$2 AND d.native_turn_id=$3
   AND d.native_event_id IS NOT NULL ORDER BY d.deadline_at DESC LIMIT 1`,[attemptId,nativeSessionId,turnId])).rows[0]?.deadline_at??null;
}

export async function pendingSteering(db:PoolClient,attemptId:string){
 return await ready(db) && !!(await db.query(`SELECT 1 FROM ordinary_steering_deliveries WHERE attempt_id=$1
  AND dispatch_state IN('dispatching','admitted','uncertain') AND native_event_id IS NULL AND deadline_at>clock_timestamp() LIMIT 1`,[attemptId])).rowCount;
}

/** Only actually consumed corrections join the initiating human message.
 * Prepared, failed or unconfirmed deliveries cannot become quoted context. */
export async function currentAttemptUserMessages(db:PoolClient,attemptId:string,principalId:string,workspaceId:string){
 const steering=await ready(db);
 return (await db.query<{id:string;text:string}>(`SELECT m.id,m.text FROM response_attempts a
  JOIN conversations c ON c.id=a.conversation_id JOIN submitted_messages m ON m.conversation_id=c.id
  WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4
    AND (m.id=a.message_id ${steering?`OR EXISTS(SELECT 1 FROM ordinary_steering_deliveries d
      WHERE d.attempt_id=a.id AND d.message_id=m.id AND d.native_event_id IS NOT NULL AND d.dispatch_state='admitted')`:''})
  ORDER BY m.created_at DESC,m.id DESC LIMIT 101`,[attemptId,principalId,workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
}
