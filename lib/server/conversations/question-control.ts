import {lockProfileActor} from '../profiles/policy';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {exactHumanResponder} from './human-responder';
import {assertCustomerQuestionReads} from './customer-accounts';
import {getServerConfig} from '../config';
/** A real admitted follow-up may make the native question workflow replay its
 * empty control boundary before that follow-up receives a native turn. This
 * permits only that hook boundary; it grants no answer/provider window. */
export async function hasOwnedQuestionControl(db:PoolClient,principal:Parameters<typeof exactHumanResponder>[1],nativeSessionId:string){
 const attemptId=principal?.attributes?.turasAttemptId;
 if(principal?.authenticator!=='turas-session'||principal.principalType!=='user'||!z.uuid().safeParse(principal.principalId).success||!z.uuid().safeParse(attemptId).success)return false;
 const questionSchema=Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)>=77;
 const candidates=(await db.query(`SELECT c.id,c.customer_id,c.owner_principal_id,COALESCE(g.login_session_id,snapshot.login_session_id) AS login_session_id,COALESCE(g.membership_id,snapshot.membership_id) AS membership_id FROM response_attempts original
 JOIN conversations c ON c.id=original.conversation_id JOIN response_attempts followup ON followup.conversation_id=c.id AND followup.created_at>original.created_at
 LEFT JOIN general_context_receipts g ON g.attempt_id=followup.id AND g.conversation_id=c.id
 LEFT JOIN context_snapshot_receipts snapshot ON snapshot.attempt_id=followup.id AND snapshot.conversation_id=c.id
 WHERE original.id=$1 AND c.owner_principal_id=$2 AND c.eve_session_id=$3 AND c.environment_id=$4 AND c.binding_state='bound'
  AND original.response_state IN('waiting_input','running') AND followup.response_state IN('pending','running') AND followup.dispatch_state IN('dispatching','admitted') AND followup.dispatch_started_at IS NOT NULL
  AND followup.deadline_at>clock_timestamp() AND (g.valid_until>clock_timestamp() OR g.attempt_id IS NULL AND snapshot.valid_until>clock_timestamp())
  AND EXISTS(SELECT 1 FROM event_projections requested CROSS JOIN LATERAL jsonb_array_elements(COALESCE(requested.visible_payload->'requests','[]'::jsonb)) question
   WHERE requested.conversation_id=c.id AND requested.native_session_id=$3 AND (requested.turn_id=original.native_turn_id OR EXISTS(SELECT 1 FROM native_input_resume_windows resumed JOIN event_projections prior ON prior.native_event_id=resumed.native_event_id WHERE resumed.attempt_id=original.id AND prior.native_session_id=$3 AND prior.turn_id=requested.turn_id) ${questionSchema?`OR EXISTS(SELECT 1 FROM ordinary_question_continuations continuation WHERE continuation.attempt_id=original.id AND continuation.native_session_id=$3 AND continuation.native_turn_id=requested.turn_id)`:''}) AND requested.event_type='input.requested' AND question->>'kind'='question'
    ${questionSchema?`AND NOT EXISTS(SELECT 1 FROM ordinary_question_continuations settled WHERE settled.attempt_id=original.id AND settled.request_event_id=requested.native_event_id AND question->>'requestId'=ANY(settled.settled_request_ids)) AND NOT EXISTS(SELECT 1 FROM ordinary_question_reconstructions settled WHERE settled.attempt_id=original.id AND settled.request_event_id=requested.native_event_id AND question->>'requestId'=ANY(settled.settled_request_ids))`:''}
    AND NOT EXISTS(SELECT 1 FROM event_projections resolved CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) answer
     WHERE resolved.conversation_id=c.id AND resolved.native_session_id=$3 AND resolved.event_type='input.resolved' AND answer->>'requestId'=question->>'requestId'))`,[attemptId,principal!.principalId,nativeSessionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
 if(candidates.length!==1)return false;
 const row=candidates[0],actor=await exactHumanResponder(db,{authenticator:'turas-session',principalType:'user',principalId:row.owner_principal_id,attributes:{turasLoginSessionId:row.login_session_id,turasMembershipId:row.membership_id}});
 if(row.customer_id)await lockProfileActor(db,actor,row.customer_id,undefined,true);
 await assertCustomerQuestionReads(db,actor,row.id,attemptId as string);
 return true;
}
