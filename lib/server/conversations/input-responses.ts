import {randomUUID} from "node:crypto";
import {lockWorkspaceActor,lockProfileActor} from "../profiles/policy";
import {conversationFeature} from "./feature";
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {HttpFailure} from '../../contracts/http';
export const inputResponsesSchema=z.object({inputResponses:z.array(z.object({
 requestId:z.string().min(1).max(300),optionId:z.string().min(1).max(300).optional(),
 text:z.string().max(16384).optional(),
}).strict().refine(value=>value.optionId!==undefined||value.text!==undefined)).min(1).max(20)}).strict();
/** Match the durable native pending request, including an older open question.
 * The runtime still validates its option/text and performs the actual resolution. */
export async function ownedInputResponseAttempt(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 const input=inputResponsesSchema.parse(raw),ids=input.inputResponses.map(response=>response.requestId);
 if(new Set(ids).size!==ids.length)throw new HttpFailure(422,'duplicate_response','Answer each request once');
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  const background=(marker?.schema_version??0)>=61;
  const rows=(await db.query<{request_id:string;attempt_id:string}>(`SELECT DISTINCT request->>'requestId' AS request_id,a.id AS attempt_id
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
  return rows[0].attempt_id;
 });
}

/** Called only after the route's current owner and CSRF checks. A fresh login
 * appends authority to resume its own pending input; original receipts stay intact. */
export async function authorizeOwnedInputResponse(actor:CurrentSession,nativeSessionId:string,raw:unknown){
 const attemptId=await ownedInputResponseAttempt(actor,nativeSessionId,raw);
 await withTransaction(async db=>{
  await lockWorkspaceActor(db,actor);
  const conversation=(await db.query(`SELECT c.id,c.customer_id,c.context_audience FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
    WHERE a.id=$1 AND c.eve_session_id=$2 AND c.owner_principal_id=$3 AND c.workspace_id=$4`,[attemptId,nativeSessionId,actor.principalId,actor.workspaceId])).rows[0];
  if(!conversation || (await conversationFeature(db,conversation.id)).kind!=='normal')return;
  if(conversation.customer_id){await lockProfileActor(db,actor,conversation.customer_id);if(conversation.context_audience!==(actor.kind==='internal'?'internal':'delivery'))throw new HttpFailure(404,'not_found','Not found');}
  await db.query(`INSERT INTO ordinary_continuation_authorities(id,attempt_id,login_session_id,membership_id,owner_principal_id,workspace_id,environment_id,valid_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id,login_session_id) DO NOTHING`,[randomUUID(),attemptId,actor.sessionId,actor.membershipId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.expiresAt]);
 });
 return attemptId;
}
