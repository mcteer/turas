import type {PoolClient} from 'pg';
import {parseOrdinaryNativeMessage} from './native-message';
import {sanitizeNativeInputParts} from './native-input-replay';

/** Display metadata comes from the exact consumed application message. It is
 * separate from the native envelope used to validate durable-step replays. */
export async function projectNativeInputDisplay(db:PoolClient,conversationId:string,nativeSessionId:string,eventId:string,canonicalEventId=eventId){
 if(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version)<74)return;
 const rows=(await db.query(`SELECT m.ordinary_native_parts FROM submitted_messages m
  JOIN conversations c ON c.id=m.conversation_id
  WHERE c.id=$1 AND c.eve_session_id=$2 AND m.ordinary_native_parts IS NOT NULL
   AND (EXISTS(SELECT 1 FROM response_attempts a WHERE a.message_id=m.id AND a.conversation_id=c.id AND a.input_event_id=$3)
    OR EXISTS(SELECT 1 FROM ordinary_steering_deliveries d JOIN response_attempts a ON a.id=d.attempt_id
     WHERE d.message_id=m.id AND a.conversation_id=c.id
     AND d.native_event_id=$3 AND d.dispatch_state='admitted')) LIMIT 2`,[conversationId,nativeSessionId,canonicalEventId])).rows;
 if(rows.length>1)throw Error('Native display message association ambiguous');
 if(!rows.length)return;
 const parts=sanitizeNativeInputParts(parseOrdinaryNativeMessage(rows[0].ordinary_native_parts));
 if(!parts.some(part=>part.type==='file'))return;
 await db.query(`UPDATE event_projections SET visible_payload=visible_payload||jsonb_build_object('applicationInputParts',$4::jsonb)
  WHERE conversation_id=$1 AND native_session_id=$2 AND native_event_id=$3 AND event_type='message.received'`,
 [conversationId,nativeSessionId,eventId,JSON.stringify(parts)]);
}
