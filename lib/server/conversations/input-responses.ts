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
   AND ((event.event_type='input.requested' AND $3='')
    OR (event.event_type='input.resolved' AND event.turn_id=$3)) ORDER BY resume.deadline_at DESC LIMIT 1`,[attemptId,nativeSessionId,turnId,current])).rows[0]?.deadline_at??null;
}
export async function hasNativeInputWindow(db:PoolClient,attemptId:string,nativeSessionId:string,turnId:string,current=true){
 return !!await nativeInputDeadline(db,attemptId,nativeSessionId,turnId,current);
}
export const inputResponsesSchema=z.object({inputResponses:z.array(z.object({
 requestId:z.string().min(1).max(300),optionId:z.string().min(1).max(300).optional(),
 text:z.string().max(16384).optional(),
}).strict().refine(value=>value.optionId!==undefined||value.text!==undefined)).min(1).max(20)}).strict();
/** Match the durable native pending request, including an older open question.
 * The runtime still validates its option/text and performs the actual resolution. */
async function ownedInputResponseBinding(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 const input=inputResponsesSchema.parse(raw),ids=input.inputResponses.map(response=>response.requestId);
 if(new Set(ids).size!==ids.length)throw new HttpFailure(422,'duplicate_response','Answer each request once');
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  const background=(marker?.schema_version??0)>=61;
  const rows=(await db.query<{request_id:string;attempt_id:string;native_event_id:string}>(`SELECT DISTINCT request->>'requestId' AS request_id,a.id AS attempt_id,event.native_event_id
   FROM event_projections event JOIN conversations c ON c.id=event.conversation_id
   JOIN response_attempts a ON a.conversation_id=c.id AND (a.native_turn_id=event.turn_id
    ${background?`OR EXISTS(SELECT 1 FROM research_background_turns bg WHERE bg.native_session_id=c.eve_session_id AND bg.turn_id=event.turn_id AND bg.attempt_id=a.id)`:''}
    ${(marker?.schema_version??0)>=65?`OR EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections prior ON prior.native_event_id=resume.native_event_id
      WHERE resume.attempt_id=a.id AND prior.turn_id=event.turn_id AND prior.native_session_id=c.eve_session_id)`:''})
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(event.visible_payload->'requests','[]'::jsonb)) request
   WHERE c.eve_session_id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4 AND c.binding_state='bound'
    AND event.event_type='input.requested' AND request->>'requestId'=ANY($5::text[])
    AND a.response_state NOT IN('cancelled','stopping','failed')
    AND NOT EXISTS(SELECT 1 FROM event_projections resolved
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) resolution
      WHERE resolved.conversation_id=c.id AND resolved.event_type='input.resolved'
       AND resolution->>'requestId'=request->>'requestId')`,[nativeSessionId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,ids])).rows;
  if(rows.length!==ids.length || new Set(rows.map(row=>row.attempt_id)).size!==1)throw new HttpFailure(409,'input_request_changed','This request is no longer pending in this conversation');
  return {attemptId:rows[0].attempt_id,eventIds:[...new Set(rows.map(row=>row.native_event_id))]};
 });
}

export async function ownedInputResponseAttempt(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 return (await ownedInputResponseBinding(actor,nativeSessionId,raw)).attemptId;
}

/** Called only after the route's current owner and CSRF checks. A fresh login
 * appends authority to resume its own pending input; original receipts stay intact. */
export async function authorizeOwnedInputResponse(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 const {attemptId,eventIds}=await ownedInputResponseBinding(actor,nativeSessionId,raw);
 await withTransaction(async db=>{
  await lockWorkspaceActor(db,actor);
  const conversation=(await db.query(`SELECT c.id,c.customer_id,c.context_audience FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
    WHERE a.id=$1 AND c.eve_session_id=$2 AND c.owner_principal_id=$3 AND c.workspace_id=$4`,[attemptId,nativeSessionId,actor.principalId,actor.workspaceId])).rows[0];
  if(!conversation || (await conversationFeature(db,conversation.id)).kind!=='normal')return;
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
  const window=(await db.query(`SELECT min(deadline_at) AS deadline_at FROM native_input_resume_windows
    WHERE attempt_id=$1 AND native_event_id=ANY($2::text[])`,[attemptId,eventIds])).rows[0];
  if(!window?.deadline_at || window.deadline_at.getTime()<=Date.now())throw new HttpFailure(409,'input_resume_expired','This question continuation expired');
  await db.query(`UPDATE response_attempts SET response_state='running',updated_at=now(),revision=revision+1
    WHERE id=$1 AND response_state IN('waiting_input','completed')`,[attemptId]);
  await db.query(`UPDATE watchdog_jobs SET deadline_at=$2,state='pending',next_attempt_at=$2,
    lease_owner=NULL,lease_expires_at=NULL,failure_count=0,last_error_code=NULL,updated_at=now() WHERE attempt_id=$1`,[attemptId,window.deadline_at]);
 });
 return attemptId;
}
