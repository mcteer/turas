import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {exactHumanResponder} from './human-responder';
import {getServerConfig} from '../config';
/** A model resolver callback precedes the question's native resolution events.
 * Its auth may be the original workflow snapshot. Bind its actual turn only to
 * the exact immutable authenticated question POST, never the latest login. */
export async function bindPostedQuestionStep(db:PoolClient,principal:Parameters<typeof exactHumanResponder>[1],nativeSessionId:string,raw:unknown,turn?:{id:string;sequence:number}){
 if(!raw||typeof raw!=='object')return;const event=raw as {type?:unknown;data?:unknown};
 if(event.type!=='step.started'||!event.data||typeof event.data!=='object')return;
 const data=event.data as Record<string,unknown>,attemptId=principal?.attributes?.turasAttemptId;
 if(principal?.authenticator!=='turas-session'||principal.principalType!=='user'||!z.uuid().safeParse(principal.principalId).success||!z.uuid().safeParse(attemptId).success||typeof data.turnId!=='string'||!data.turnId||!Number.isSafeInteger(data.sequence)||Number(data.sequence)<1||(turn&&(data.turnId!==turn.id||data.sequence!==turn.sequence))||!Number.isSafeInteger(data.stepIndex))return;
 if(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)<77)return;
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['question-continuation:'+attemptId]);
 const existing=(await db.query(`SELECT bound.login_session_id,bound.membership_id FROM ordinary_question_continuations bound
 JOIN conversations c ON c.id=bound.conversation_id WHERE bound.attempt_id=$1 AND bound.native_session_id=$2 AND bound.native_turn_id=$3
 AND c.owner_principal_id=$4 AND c.environment_id=$5 AND c.eve_session_id=$2 AND c.binding_state='bound'`,[attemptId,nativeSessionId,data.turnId,principal!.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 const assertPosted=async(post:{login_session_id:string;membership_id:string})=>exactHumanResponder(db,{authenticator:'turas-session',principalType:'user',principalId:principal!.principalId,attributes:{turasLoginSessionId:post.login_session_id,turasMembershipId:post.membership_id}});
 if(existing){await assertPosted(existing);return;}
 const posted=(await db.query<{native_event_id:string;deadline_at:Date;conversation_id:string;login_session_id:string;membership_id:string}>(`SELECT request.native_event_id,posted_window.deadline_at,c.id AS conversation_id,post.login_session_id,post.membership_id
 FROM ordinary_question_posts post JOIN native_input_resume_windows posted_window ON posted_window.native_event_id=post.request_event_id AND posted_window.attempt_id=post.attempt_id
 JOIN event_projections request ON request.native_event_id=posted_window.native_event_id
 JOIN response_attempts a ON a.id=posted_window.attempt_id JOIN conversations c ON c.id=a.conversation_id
 WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3 AND c.eve_session_id=$4 AND c.binding_state='bound'
  AND a.response_state='running' AND request.conversation_id=c.id AND request.native_session_id=$4 AND request.event_type='input.requested'
  AND posted_window.deadline_at>clock_timestamp() AND a.native_turn_id<>$5
  AND NOT EXISTS(SELECT 1 FROM research_background_turns background WHERE background.attempt_id=a.id AND background.native_session_id=$4 AND background.turn_id=$5)
  AND NOT EXISTS(SELECT 1 FROM ordinary_steering_deliveries steering WHERE steering.attempt_id=a.id AND steering.native_turn_id=$5 AND steering.native_event_id IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM native_input_resume_windows known JOIN event_projections previous ON previous.native_event_id=known.native_event_id WHERE known.attempt_id=a.id AND previous.native_session_id=$4 AND previous.turn_id=$5 AND previous.event_type IN('input.resolved','turn.started'))
  AND NOT EXISTS(SELECT 1 FROM event_projections resolved CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) answer
   WHERE resolved.conversation_id=c.id AND resolved.native_session_id=$4 AND resolved.event_type='input.resolved'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(request.visible_payload->'requests') item WHERE item->>'requestId'=answer->>'requestId'))
  AND NOT EXISTS(SELECT 1 FROM ordinary_question_continuations bound WHERE bound.attempt_id=a.id AND (bound.request_event_id=request.native_event_id OR bound.native_turn_id=$5))
 ORDER BY request.emitted_at DESC LIMIT 1`,[attemptId,principal!.principalId,getServerConfig().TURAS_ENVIRONMENT_ID,nativeSessionId,data.turnId])).rows[0];
 if(!posted)return;
 await assertPosted(posted);
 await db.query(`INSERT INTO ordinary_question_continuations(id,attempt_id,request_event_id,conversation_id,native_session_id,native_turn_id,native_sequence,login_session_id,membership_id,deadline_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[randomUUID(),attemptId,posted.native_event_id,posted.conversation_id,nativeSessionId,data.turnId,data.sequence,posted.login_session_id,posted.membership_id,posted.deadline_at]);
}
