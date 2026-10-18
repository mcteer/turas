import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {humanResponderScope} from './human-responder';
/** Eve 0.67.1's memory commit appends new user-role instructions after the
 * approval transcript. AI SDK requires its tool-approval-response to remain
 * the tail to execute the original held call. Keep existing durable context;
 * suppress only redundant emissions for this exact authenticated settled continuation.
 * Callers must perform all context reads and injection receipts first. */
export async function redundantApprovalInstructions(db:PoolClient,
 principal:Parameters<typeof humanResponderScope>[1],nativeSessionId:string,event:unknown){
 if(!event||typeof event!=='object'||!('data' in event)||!event.data||typeof event.data!=='object')return false;
 const data=event.data as Record<string,unknown>;
 if(typeof data.turnId!=='string'||!data.turnId||!Number.isSafeInteger(data.sequence)||Number(data.sequence)<1)return false;
 let scope:Awaited<ReturnType<typeof humanResponderScope>>;
 try{scope=await humanResponderScope(db,principal);}catch(error){if(error instanceof HttpFailure&&[401,403,404,409].includes(error.status))return false;throw error;}
 return !!(await db.query(`SELECT 1 FROM native_input_resume_windows resumed
 JOIN event_projections resolved ON resolved.native_event_id=resumed.native_event_id
 JOIN response_attempts a ON a.id=resumed.attempt_id JOIN conversations c ON c.id=a.conversation_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(resolved.visible_payload->'resolutions','[]'::jsonb)) answer
 JOIN native_input_resume_windows posted ON posted.attempt_id=resumed.attempt_id AND posted.deadline_at=resumed.deadline_at
 JOIN event_projections request ON request.native_event_id=posted.native_event_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(request.visible_payload->'requests','[]'::jsonb)) pending
 WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.eve_session_id=$4 AND c.binding_state='bound'
  AND resolved.conversation_id=c.id AND resolved.native_session_id=$4 AND resolved.event_type='input.resolved'
  AND EXISTS(SELECT 1 FROM native_input_resume_windows settled JOIN event_projections settlement ON settlement.native_event_id=settled.native_event_id
   WHERE settled.attempt_id=a.id AND settled.deadline_at=resumed.deadline_at AND settlement.native_session_id=$4 AND settlement.event_type='approval.settled'
    AND settlement.visible_payload->>'sequence'=$5::text AND settlement.visible_payload->>'requestId'=answer->>'requestId'
    AND settlement.visible_payload->>'outcome'=CASE WHEN answer->>'outcome'='approved' THEN 'approved' WHEN answer->>'outcome'='denied' THEN 'cancelled' ELSE '' END)
  AND answer->>'kind'='tool-approval' AND answer->>'outcome' IN('approved','denied')
  AND request.conversation_id=c.id AND request.native_session_id=$4 AND request.event_type='input.requested'
  AND pending->>'kind'='tool-approval' AND pending->>'requestId'=answer->>'requestId' AND resumed.deadline_at>clock_timestamp()
  AND EXISTS(SELECT 1 FROM ordinary_continuation_authorities authority WHERE authority.attempt_id=a.id
   AND authority.login_session_id=$6 AND authority.membership_id=$7 AND authority.owner_principal_id=c.owner_principal_id
   AND authority.workspace_id=c.workspace_id AND authority.environment_id=c.environment_id AND authority.valid_until>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM native_input_resume_windows binding JOIN event_projections started ON started.native_event_id=binding.native_event_id
   WHERE binding.attempt_id=a.id AND started.event_type='turn.started' AND started.visible_payload->>'resumeForEventId'=resolved.native_event_id AND started.turn_id<>$8)
 LIMIT 1`,[scope.attemptId,scope.actor.principalId,scope.actor.workspaceId,nativeSessionId,data.sequence,scope.actor.sessionId,scope.actor.membershipId,data.turnId])).rowCount;
}
