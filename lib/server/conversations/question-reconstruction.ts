import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {exactHumanResponder} from './human-responder';
import {assertCustomerQuestionReads} from './customer-accounts';
import {lockProfileActor} from '../profiles/policy';
import {getServerConfig} from '../config';
/** Actual typed held-tool results may precede public native resolution events.
 * A dismissed result plus a real owned follow-up authorizes only this original
 * workflow reconstruction, with its original cumulative token allowance. */
export async function admitQuestionReconstruction(db:PoolClient,principal:Parameters<typeof exactHumanResponder>[1],nativeSessionId:string,raw:unknown,messages:unknown):Promise<Date|null>{
 if(!raw||typeof raw!=='object'||!Array.isArray(messages))return null;const event=raw as {type?:unknown;data?:unknown};
 if(event.type!=='step.started'||!event.data||typeof event.data!=='object')return null;
 const data=event.data as Record<string,unknown>,attemptId=principal?.attributes?.turasAttemptId;
 if(principal?.authenticator!=='turas-session'||principal.principalType!=='user'||!z.uuid().safeParse(principal.principalId).success||!z.uuid().safeParse(attemptId).success||typeof data.turnId!=='string'||!data.turnId||!Number.isSafeInteger(data.sequence)||Number(data.sequence)<1||!Number.isSafeInteger(data.stepIndex))return null;
 if(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)<77)return null;
 const dismissed:Array<{callId:string;toolName:string}>=[];
 for(const message of messages){if(!message||typeof message!=='object'||message.role!=='tool'||!Array.isArray(message.content))continue;
  for(const part of message.content){if(!part||typeof part!=='object'||part.type!=='tool-result'||typeof part.toolCallId!=='string'||typeof part.toolName!=='string'||!part.output||typeof part.output!=='object'||part.output.type!=='json'||!part.output.value||typeof part.output.value!=='object'||part.output.value.status!=='dismissed')continue;dismissed.push({callId:part.toolCallId,toolName:part.toolName});}
 }
 if(!dismissed.length)return null;
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['question-reconstruction:'+attemptId]);
 const rows=(await db.query(`SELECT original.id,followup.id AS followup_attempt_id,c.id AS conversation_id,c.customer_id,c.workspace_id,c.environment_id,
 g.login_session_id,g.membership_id,request.native_event_id AS request_event_id,question->>'requestId' AS request_id,least(followup.deadline_at,g.valid_until) AS deadline_at,
 (SELECT row_to_json(saved) FROM ordinary_question_reconstructions saved WHERE saved.attempt_id=original.id AND saved.followup_attempt_id=followup.id AND saved.request_event_id=request.native_event_id) AS saved
 FROM response_attempts original JOIN conversations c ON c.id=original.conversation_id
 JOIN response_attempts followup ON followup.conversation_id=c.id AND followup.created_at>original.created_at
 JOIN general_context_receipts g ON g.attempt_id=followup.id AND g.conversation_id=c.id
 JOIN event_projections request ON request.conversation_id=c.id AND request.native_session_id=$3 AND request.event_type='input.requested'
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(request.visible_payload->'requests','[]'::jsonb)) question
 WHERE original.id=$1 AND c.owner_principal_id=$2 AND c.eve_session_id=$3 AND c.environment_id=$4 AND c.binding_state='bound'
  AND original.response_state IN('waiting_input','running') AND followup.response_state IN('pending','running')
  AND followup.dispatch_state IN('dispatching','admitted') AND followup.dispatch_started_at IS NOT NULL AND followup.deadline_at>clock_timestamp() AND g.valid_until>clock_timestamp()
  AND (request.turn_id=original.native_turn_id OR EXISTS(SELECT 1 FROM ordinary_question_continuations continuation WHERE continuation.attempt_id=original.id AND continuation.native_session_id=$3 AND continuation.native_turn_id=request.turn_id)
   OR EXISTS(SELECT 1 FROM native_input_resume_windows resumed_window JOIN event_projections prior ON prior.native_event_id=resumed_window.native_event_id WHERE resumed_window.attempt_id=original.id AND prior.native_session_id=$3 AND prior.turn_id=request.turn_id))
  AND NOT EXISTS(SELECT 1 FROM ordinary_question_continuations settled WHERE settled.attempt_id=original.id AND settled.request_event_id=request.native_event_id AND question->>'requestId'=ANY(settled.settled_request_ids))
  AND NOT EXISTS(SELECT 1 FROM ordinary_question_reconstructions settled WHERE settled.attempt_id=original.id AND settled.request_event_id=request.native_event_id AND settled.followup_attempt_id<>followup.id AND question->>'requestId'=ANY(settled.settled_request_ids))
  AND question->>'kind'='question' AND EXISTS(SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS result("callId" text,"toolName" text) WHERE result."callId"=question->'action'->>'callId' AND result."toolName"=question->'action'->>'toolName')
  AND NOT EXISTS(SELECT 1 FROM event_projections resolved CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) answer WHERE resolved.conversation_id=c.id AND resolved.native_session_id=$3 AND resolved.event_type='input.resolved' AND answer->>'requestId'=question->>'requestId')`,[attemptId,principal!.principalId,nativeSessionId,getServerConfig().TURAS_ENVIRONMENT_ID,JSON.stringify(dismissed)])).rows;
 if(!rows.length||new Set(rows.map(row=>row.followup_attempt_id)).size!==1)return null;const row=rows[0];
 const groups=[...new Set(rows.map(row=>row.request_event_id))].map(id=>({...rows.find(row=>row.request_event_id===id),request_ids:[...new Set(rows.filter(row=>row.request_event_id===id).map(row=>row.request_id))]}));
 const actor=await exactHumanResponder(db,{authenticator:'turas-session',principalType:'user',principalId:principal!.principalId,attributes:{turasLoginSessionId:row.login_session_id,turasMembershipId:row.membership_id}});
 if(row.customer_id)await lockProfileActor(db,actor,row.customer_id,undefined,true);
 await assertCustomerQuestionReads(db,actor,row.conversation_id,attemptId as string);
 for(const group of groups)if(group.saved&&(group.saved.callback_turn_id!==data.turnId||group.saved.native_sequence!==data.sequence||group.saved.step_index!==data.stepIndex||new Date(group.saved.deadline_at).getTime()<=Date.now()||JSON.stringify([...group.saved.settled_request_ids].sort())!==JSON.stringify([...group.request_ids].sort())))return null;
 await db.query(`INSERT INTO ordinary_continuation_authorities(id,attempt_id,login_session_id,membership_id,owner_principal_id,workspace_id,environment_id,valid_until)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id,login_session_id) DO NOTHING`,[randomUUID(),attemptId,actor.sessionId,actor.membershipId,actor.principalId,actor.workspaceId,row.environment_id,actor.expiresAt]);
 for(const group of groups){if(group.saved)continue;await db.query(`INSERT INTO ordinary_question_reconstructions(id,attempt_id,followup_attempt_id,request_event_id,native_session_id,callback_turn_id,native_sequence,step_index,login_session_id,membership_id,deadline_at,settled_request_ids)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[randomUUID(),attemptId,group.followup_attempt_id,group.request_event_id,nativeSessionId,data.turnId,data.sequence,data.stepIndex,actor.sessionId,actor.membershipId,group.deadline_at,group.request_ids]);}
 return new Date(Math.min(...groups.map(group=>new Date(group.saved?.deadline_at??group.deadline_at).getTime())));
}
export async function questionReconstructionEventWindow(db:PoolClient,attemptId:string,nativeSessionId:string,data:Record<string,unknown>){
 if(data.turnId!==''||!Number.isSafeInteger(data.sequence)||data.stepIndex!==undefined&&!Number.isSafeInteger(data.stepIndex))return false;
 if(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)<77)return false;
 const rows=(await db.query(`SELECT receipt.login_session_id,receipt.membership_id,c.owner_principal_id,c.id AS conversation_id,c.customer_id FROM ordinary_question_reconstructions receipt JOIN response_attempts a ON a.id=receipt.attempt_id JOIN conversations c ON c.id=a.conversation_id
 WHERE receipt.attempt_id=$1 AND receipt.native_session_id=$2 AND receipt.native_sequence=$3 AND ($4::integer IS NULL OR receipt.step_index=$4) AND receipt.deadline_at>clock_timestamp() AND c.eve_session_id=$2
 UNION ALL SELECT receipt.login_session_id,receipt.membership_id,c.owner_principal_id,c.id AS conversation_id,c.customer_id FROM ordinary_question_continuations receipt JOIN response_attempts a ON a.id=receipt.attempt_id JOIN conversations c ON c.id=a.conversation_id
 WHERE receipt.attempt_id=$1 AND receipt.native_session_id=$2 AND receipt.native_sequence=$3 AND receipt.deadline_at>clock_timestamp() AND c.eve_session_id=$2`,[attemptId,nativeSessionId,data.sequence,data.stepIndex??null])).rows;
 if(!rows.length)return false;
 for(const row of rows){const actor=await exactHumanResponder(db,{authenticator:'turas-session',principalType:'user',principalId:row.owner_principal_id,attributes:{turasLoginSessionId:row.login_session_id,turasMembershipId:row.membership_id}});
 if(row.customer_id)await lockProfileActor(db,actor,row.customer_id,undefined,true);
 await assertCustomerQuestionReads(db,actor,row.conversation_id,attemptId);}return true;
}
