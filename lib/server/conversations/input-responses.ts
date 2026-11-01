import {randomUUID} from "node:crypto";
import {lockWorkspaceActor,lockProfileActor} from "../profiles/policy";
import {conversationFeature} from "./feature";
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {HttpFailure} from '../../contracts/http';
import type {PoolClient} from 'pg';

export async function nativeInputDeadline(db:PoolClient,attemptId:string,nativeSessionId:string,turnId:string,current=true):Promise<Date|null>{
 const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
 if((marker?.schema_version??0)<67)return null;
 return (await db.query<{deadline_at:Date}>(`SELECT resume.deadline_at FROM native_input_resume_windows resume
  JOIN event_projections event ON event.native_event_id=resume.native_event_id
  JOIN response_attempts a ON a.id=resume.attempt_id
  JOIN conversations c ON c.id=a.conversation_id AND c.eve_session_id=event.native_session_id
  WHERE a.id=$1 AND c.eve_session_id=$2 AND event.conversation_id=c.id
   AND ($4::boolean=false OR resume.deadline_at>clock_timestamp())
   AND ((event.event_type='input.requested' AND ($3='' OR event.turn_id=$3))
    OR (event.event_type IN('input.resolved','turn.started') AND event.turn_id=$3)
    ${(marker?.schema_version??0)>=77?`OR EXISTS(SELECT 1 FROM ordinary_question_continuations continuation WHERE continuation.attempt_id=a.id AND continuation.request_event_id=event.native_event_id AND continuation.native_session_id=$2 AND continuation.native_turn_id=$3 AND continuation.deadline_at=resume.deadline_at AND EXISTS(SELECT 1 FROM login_sessions login JOIN memberships membership ON membership.id=continuation.membership_id AND membership.principal_id=c.owner_principal_id AND membership.workspace_id=c.workspace_id JOIN principals owner ON owner.id=c.owner_principal_id WHERE login.id=continuation.login_session_id AND login.principal_id=c.owner_principal_id AND login.revoked_at IS NULL AND login.expires_at>clock_timestamp() AND membership.active AND owner.active))`:''}) ORDER BY resume.deadline_at DESC LIMIT 1`,[attemptId,nativeSessionId,turnId,current])).rows[0]?.deadline_at??null;
}
export async function hasNativeInputWindow(db:PoolClient,attemptId:string,nativeSessionId:string,turnId:string,current=true){
 return !!await nativeInputDeadline(db,attemptId,nativeSessionId,turnId,current);
}
const legacyInputResponsesSchema=z.object({inputResponses:z.array(z.object({
 requestId:z.string().min(1).max(300),optionId:z.string().min(1).max(300).optional(),
 text:z.string().max(16384).optional(),
}).strict().refine(value=>value.optionId!==undefined||value.text!==undefined)).min(1).max(20)}).strict();
export const inputResponsesSchema=z.union([
 legacyInputResponsesSchema,
 z.object({answers:z.array(z.object({interactionId:z.string().min(1).max(300),optionId:z.string().min(1).max(300).optional(),text:z.string().max(16384).optional()}).strict().refine(value=>value.optionId!==undefined||value.text!==undefined)).min(1).max(20)}).strict()
  .transform(value=>({inputResponses:value.answers.map(({interactionId,...answer})=>({requestId:interactionId,...answer}))})),
]);
export function nativeInteractionAnswers(value:z.infer<typeof inputResponsesSchema>){
 return {answers:value.inputResponses.map(({requestId,...answer})=>({interactionId:requestId,...answer}))};
}
/** Match the durable native pending request, including an older open question.
 * The runtime still validates its option/text and performs the actual resolution. */
async function ownedInputResponseBinding(actor:CurrentSession,nativeSessionId:string,raw:unknown,inspect=false){
 const ids=inspect?[]:inputResponsesSchema.parse(raw).inputResponses.map(response=>response.requestId);
 if(new Set(ids).size!==ids.length)throw new HttpFailure(422,'duplicate_response','Answer each request once');
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  const background=(marker?.schema_version??0)>=61;
  const rows=(await db.query<{request_id:string;attempt_id:string;native_event_id:string;conversation_id:string;request:Record<string,unknown>}>(`SELECT DISTINCT c.id AS conversation_id,request,request->>'requestId' AS request_id,a.id AS attempt_id,event.native_event_id
   FROM event_projections event JOIN conversations c ON c.id=event.conversation_id
   JOIN response_attempts a ON a.conversation_id=c.id AND (a.native_turn_id=event.turn_id
    ${background?`OR EXISTS(SELECT 1 FROM research_background_turns bg WHERE bg.native_session_id=c.eve_session_id AND bg.turn_id=event.turn_id AND bg.attempt_id=a.id)`:''}
    ${(marker?.schema_version??0)>=65?`OR EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections prior ON prior.native_event_id=resume.native_event_id
      WHERE resume.attempt_id=a.id AND prior.turn_id=event.turn_id AND prior.native_session_id=c.eve_session_id)`:''}
    ${(marker?.schema_version??0)>=77?`OR EXISTS(SELECT 1 FROM ordinary_question_continuations question WHERE question.attempt_id=a.id AND question.native_session_id=c.eve_session_id AND question.native_turn_id=event.turn_id)`:''}
    ${(marker?.schema_version??0)>=68?`OR EXISTS(SELECT 1 FROM ordinary_steering_deliveries steer WHERE steer.attempt_id=a.id AND steer.native_turn_id=event.turn_id AND steer.native_event_id IS NOT NULL)`:''})
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(event.visible_payload->'requests','[]'::jsonb)) request
   WHERE c.eve_session_id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4 AND c.binding_state='bound'
    AND event.event_type='input.requested' AND (event.visible_payload->>'applicationAttemptId' IS NULL OR event.visible_payload->>'applicationAttemptId'=a.id::text) AND ($6::boolean OR request->>'requestId'=ANY($5::text[]))
    AND a.response_state NOT IN('cancelled','stopping','failed')
    ${(marker?.schema_version??0)>=77?`AND NOT EXISTS(SELECT 1 FROM ordinary_question_continuations settled WHERE settled.attempt_id=a.id AND settled.request_event_id=event.native_event_id AND request->>'requestId'=ANY(settled.settled_request_ids)) AND NOT EXISTS(SELECT 1 FROM ordinary_question_reconstructions settled WHERE settled.attempt_id=a.id AND settled.request_event_id=event.native_event_id AND request->>'requestId'=ANY(settled.settled_request_ids))`:''}
    AND NOT EXISTS(SELECT 1 FROM event_projections resolved
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) resolution
      WHERE resolved.conversation_id=c.id AND resolved.event_type='input.resolved'
       AND resolution->>'requestId'=request->>'requestId') LIMIT 21`,[nativeSessionId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,ids,inspect])).rows;
  if(inspect)return {attemptId:'',eventIds:[] as string[],pending:rows};
  if(rows.length!==ids.length || new Set(rows.map(row=>row.attempt_id)).size!==1)throw new HttpFailure(409,'input_request_changed','This request is no longer pending in this conversation');
  return {attemptId:rows[0].attempt_id,eventIds:[...new Set(rows.map(row=>row.native_event_id))],pending:rows};
 });
}

export async function ownedInputResponseAttempt(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 return (await ownedInputResponseBinding(actor,nativeSessionId,raw)).attemptId;
}

/** Preserve native single blocking-question freeform/option semantics for the
 * main composer, before allocating a new chat attempt. Native still validates
 * the actual structured answer and owns resolution. Files never become text. */
export async function implicitOwnedQuestionResponse(actor:CurrentSession,nativeSessionId:string,message:unknown){
 const nativeFiles=Array.isArray(message)&&message.some(part=>part&&typeof part==='object'&&part.type==='file');
 if(Array.isArray(message)&&!nativeFiles&&message.every(part=>part?.type==='text'&&typeof part.text==='string'))message=message.map(part=>part.text).join('\n');
 if(typeof message!=='string'&&!nativeFiles)return null;
 const pending=(await ownedInputResponseBinding(actor,nativeSessionId,null,true)).pending;
 if(pending.length>1)throw new HttpFailure(422,'question_answer_ambiguous','Answer each pending question separately, or send this as a correction.');
 if(pending.length!==1)return null;const request=pending[0].request;
 if(request.kind!=='question'||!request.action||typeof request.action!=='object'||!('kind' in request.action)||request.action.kind!=='tool-call'||!('toolName' in request.action)||request.action.toolName!=='ask_question')return null;
 if((await withTransaction(db=>conversationFeature(db,pending[0].conversation_id))).kind!=='normal')return null;
 if(nativeFiles)throw new HttpFailure(422,'question_answer_with_files','Answer the pending question separately before sending files');
 const text=(message as string).trim();if(!text)return null;const options=Array.isArray(request.options)?request.options:[];
 const option=options.find((option,index)=>option&&typeof option==='object'&&('id' in option&&String(option.id).toLocaleLowerCase('en-US')===text.toLocaleLowerCase('en-US')||'label' in option&&String(option.label).toLocaleLowerCase('en-US')===text.toLocaleLowerCase('en-US')||text===String(index+1)));
 if(option&&typeof option==='object'&&'id' in option&&typeof option.id==='string')return {inputResponses:[{requestId:pending[0].request_id,optionId:option.id}]};
 if(request.allowFreeform!==true)return null;
 if(text.length>16384)throw new HttpFailure(422,'too_large','Question answers must be at most 16384 characters');
 return {inputResponses:[{requestId:pending[0].request_id,text}]};
}

/** Called only after the route's current owner and CSRF checks. A fresh login
 * appends authority to resume its own pending input; original receipts stay intact. */
export async function authorizeOwnedInputResponse(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 const {attemptId,eventIds}=await ownedInputResponseBinding(actor,nativeSessionId,raw);
 await withTransaction(async db=>{
  await lockWorkspaceActor(db,actor);
  const conversation=(await db.query(`SELECT c.id,c.customer_id,c.context_audience FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
    WHERE a.id=$1 AND c.eve_session_id=$2 AND c.owner_principal_id=$3 AND c.workspace_id=$4 FOR UPDATE OF c`,[attemptId,nativeSessionId,actor.principalId,actor.workspaceId])).rows[0];
  if(!conversation || (await conversationFeature(db,conversation.id)).kind!=='normal')return;
  const otherActive=!!(await db.query("SELECT 1 FROM response_attempts WHERE conversation_id=$1 AND id<>$2 AND response_state IN('pending','running','stopping') LIMIT 1",[conversation.id,attemptId])).rowCount;
  if(otherActive){const questions=(await db.query(`SELECT count(*)::int n FROM event_projections request WHERE request.native_event_id=ANY($1::text[]) AND jsonb_array_length(COALESCE(request.visible_payload->'requests','[]'::jsonb))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(request.visible_payload->'requests') item WHERE item->>'kind'<>'question')`,[eventIds])).rows[0].n;if(Number(questions)!==eventIds.length)throw new HttpFailure(409,'conversation_busy','Wait for the current response before answering this request');}
  if(conversation.customer_id){await lockProfileActor(db,actor,conversation.customer_id);if(conversation.context_audience!==(actor.kind==='internal'?'internal':'delivery'))throw new HttpFailure(404,'not_found','Not found');}
  await db.query(`INSERT INTO ordinary_continuation_authorities(id,attempt_id,login_session_id,membership_id,owner_principal_id,workspace_id,environment_id,valid_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id,login_session_id) DO NOTHING`,[randomUUID(),attemptId,actor.sessionId,actor.membershipId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.expiresAt]);
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  if(marker?.schema_version<67)throw new HttpFailure(503,'input_resume_unavailable','Question continuation requires the current database release');
  // A real owner POST grants one window per actual native request batch. The
  // runtime may resume its model before publishing input.resolved. A retry
  // cannot replace this receipt or extend its deadline or token allowance.
  for(const eventId of eventIds)await db.query(`INSERT INTO native_input_resume_windows(attempt_id,native_event_id,deadline_at)
    VALUES($1,$2,date_trunc('milliseconds',clock_timestamp())+interval '120 seconds') ON CONFLICT(native_event_id) DO NOTHING`,[attemptId,eventId]);
  if(marker?.schema_version>=77)for(const eventId of eventIds){
   const question=(await db.query(`SELECT 1 FROM event_projections request WHERE request.native_event_id=$1
    AND jsonb_array_length(COALESCE(request.visible_payload->'requests','[]'::jsonb))>0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(request.visible_payload->'requests') item WHERE item->>'kind'<>'question')`,[eventId])).rowCount;
   if(!question)continue;
   await db.query('INSERT INTO ordinary_question_posts(request_event_id,attempt_id,login_session_id,membership_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[eventId,attemptId,actor.sessionId,actor.membershipId]);
   const posted=(await db.query('SELECT login_session_id,membership_id FROM ordinary_question_posts WHERE request_event_id=$1',[eventId])).rows[0];
   if(posted.login_session_id!==actor.sessionId||posted.membership_id!==actor.membershipId)throw new HttpFailure(409,'input_request_changed','This question response is already bound to another login; reload to check its outcome');
  }
  const window=(await db.query(`SELECT min(deadline_at) AS deadline_at FROM native_input_resume_windows
    WHERE attempt_id=$1 AND native_event_id=ANY($2::text[])`,[attemptId,eventIds])).rows[0];
  if(!window?.deadline_at || window.deadline_at.getTime()<=Date.now())throw new HttpFailure(409,'input_resume_expired','This question continuation expired');
  await db.query(`UPDATE response_attempts SET response_state='running',updated_at=now(),revision=revision+1
    WHERE id=$1 AND response_state IN('waiting_input','completed') AND NOT $2::boolean`,[attemptId,otherActive]);
  await db.query(`UPDATE watchdog_jobs SET deadline_at=$2,state='pending',next_attempt_at=$2,
    lease_owner=NULL,lease_expires_at=NULL,failure_count=0,last_error_code=NULL,updated_at=now() WHERE attempt_id=$1`,[attemptId,window.deadline_at]);
 });
 return attemptId;
}

/** Only owned, unresolved ordinary questions may be replaced by an explicit
 * correction. Keep the original attempt/turn identity for terminal proof. */
export async function pendingOwnedQuestionTurn(actor:CurrentSession,nativeSessionId:string){
 const {pending}=await ownedInputResponseBinding(actor,nativeSessionId,null,true);
 if(!pending.length||pending.some(item=>item.request.kind!=='question'))return null;
 if(new Set(pending.map(item=>item.attempt_id)).size!==1)throw new HttpFailure(409,'question_turn_ambiguous','Stop the pending response before starting a new message.');
 return withTransaction(async db=>{
  if((await conversationFeature(db,pending[0].conversation_id)).kind!=='normal')return null;
  const row=(await db.query<{native_turn_id:string|null;response_state:string}>('SELECT native_turn_id,response_state FROM response_attempts WHERE id=$1',[pending[0].attempt_id])).rows[0];
  return row?.native_turn_id&&row.response_state==='waiting_input'?{attemptId:pending[0].attempt_id,turnId:row.native_turn_id}:null;
 });
}
