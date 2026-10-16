import type {PoolClient} from 'pg';
import type {NativeEvent} from './projection';
import {messageDigest} from './message-integrity';

export type NativeInputReplayBinding={
 id:string;conversation_id:string;native_turn_id:string|null;input_event_id:string|null;
 native_delivery_id:string|null;input_digest:string;dispatch_state:string;response_state:string;
 deadline_at:Date|string|null;
};
type ReplayProof={retryOfInputEventId:string;admittedDeliveryId:string};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
/** Same public envelope used for stored file cards: never persist URL/data. */
export function sanitizeNativeInputParts(value:unknown):Record<string,unknown>[]{
 return Array.isArray(value)?value.flatMap<Record<string,unknown>>(part=>{
  if(!record(part))return [];
  if(part.type==='text'&&typeof part.text==='string')return [{type:'text',text:part.text}];
  if(part.type!=='file'||typeof part.mediaType!=='string')return [];
  return [{type:'file',mediaType:part.mediaType,...(typeof part.filename==='string'?{filename:part.filename}:{}),
   ...(typeof part.size==='number'&&Number.isSafeInteger(part.size)&&part.size>=0?{size:part.size}:{})}];
 }):[];
}
function fileEnvelope(value:unknown){const parts=sanitizeNativeInputParts(value);return parts.some(part=>part.type==='file')?parts:[];}
function incoming(event:NativeEvent,canonicalId:string|null,delivery:string|null){
 const data=event.data;
 return event.type==='message.received'&&typeof event.meta.id==='string'&&!!event.meta.id&&event.meta.id!==canonicalId&&
  !!canonicalId&&!!delivery&&Array.isArray(event.meta.deliveryIds)&&event.meta.deliveryIds.length===1&&event.meta.deliveryIds[0]===delivery&&
  record(data)&&data.kind===undefined&&typeof data.message==='string'&&typeof data.turnId==='string'&&!!data.turnId&&
  Number.isSafeInteger(data.sequence)&&Number(data.sequence)>=0;
}
async function schemaReady(db:PoolClient){
 return Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version)>=68;
}
async function canonical(db:PoolClient,conversationId:string,nativeSessionId:string,canonicalId:string){
 return (await db.query(`SELECT attempt.id AS attempt_id,event.turn_id,event.visible_payload,attempt.input_digest,attempt.native_delivery_id,
  message.text FROM event_projections event
  JOIN response_attempts attempt ON attempt.input_event_id=event.native_event_id AND attempt.conversation_id=event.conversation_id
  JOIN submitted_messages message ON message.id=attempt.message_id AND message.conversation_id=attempt.conversation_id
  JOIN conversations conversation ON conversation.id=attempt.conversation_id
  WHERE event.native_event_id=$1 AND event.conversation_id=$2 AND event.native_session_id=$3
   AND event.event_type='message.received' AND conversation.eve_session_id=$3 AND conversation.binding_state='bound'
   AND attempt.native_turn_id=event.turn_id`,[canonicalId,conversationId,nativeSessionId])).rows[0];
}
function matchesCanonical(row:Record<string,unknown>|undefined,event:NativeEvent,expectedDigest:string){
 if(!row||!record(row.visible_payload)||typeof row.text!=='string'||typeof event.data?.message!=='string')return false;
 const payload=row.visible_payload;
 return !('applicationInputReplay' in payload)&&Number.isSafeInteger(payload.sequence)&&Number(payload.sequence)>=0&&
  JSON.stringify(fileEnvelope(payload.parts))===JSON.stringify(fileEnvelope(event.data.parts))&&
  payload.sequence===event.data.sequence&&row.turn_id===event.data.turnId&&typeof payload.message==='string'&&
  row.input_digest===expectedDigest&&messageDigest(payload.message)===expectedDigest&&
  messageDigest(row.text)===expectedDigest&&messageDigest(event.data.message)===expectedDigest;
}
/** Caller holds conversation then attempt locks and has checked current owner/source
 * authority. This returns proof only: no new delivery, allowance or deadline. */
export async function admitNativeInputReplay(db:PoolClient,binding:NativeInputReplayBinding,nativeSessionId:string,event:NativeEvent,expectedDigest:string):Promise<ReplayProof|null>{
 if(!incoming(event,binding.input_event_id,binding.native_delivery_id)||binding.dispatch_state!=='admitted'||binding.response_state!=='running'||
  binding.input_digest!==expectedDigest||binding.native_turn_id!==event.data?.turnId||!binding.deadline_at||!await schemaReady(db))return null;
 const live=(await db.query('SELECT $1::timestamptz>clock_timestamp() AS live',[binding.deadline_at])).rows[0]?.live;
 if(!live)return null;
 const row=await canonical(db,binding.conversation_id,nativeSessionId,binding.input_event_id!);
 if(!matchesCanonical(row,event,expectedDigest)||row.attempt_id!==binding.id||row.native_delivery_id!==binding.native_delivery_id)return null;
 const proof=await db.query(`SELECT
  NOT EXISTS(SELECT 1 FROM ordinary_model_operations WHERE attempt_id=$1) AS unused,
  (SELECT count(*) FROM event_projections WHERE conversation_id=$2 AND native_session_id=$3
   AND event_type='message.received' AND visible_payload->'applicationInputReplay'->>'retryOfInputEventId'=$4) AS aliases`,
 [binding.id,binding.conversation_id,nativeSessionId,binding.input_event_id]);
 if(!proof.rows[0]?.unused||Number(proof.rows[0].aliases)>=3)return null;
 return {retryOfInputEventId:binding.input_event_id!,admittedDeliveryId:binding.native_delivery_id!};
}
/** Reconciliation recognizes only an already server-recorded exact alias, even
 * after usage settlement. It never authorizes a new alias or provider call. */
export async function savedNativeInputReplay(db:PoolClient,conversationId:string,nativeSessionId:string,canonicalInputEventId:string,event:NativeEvent):Promise<boolean>{
 if(!await schemaReady(db))return false;
 const row=await canonical(db,conversationId,nativeSessionId,canonicalInputEventId);
 if(!row||!incoming(event,canonicalInputEventId,row.native_delivery_id)||!matchesCanonical(row,event,row.input_digest))return false;
 const saved=(await db.query(`SELECT turn_id,visible_payload FROM event_projections
  WHERE native_event_id=$1 AND conversation_id=$2 AND native_session_id=$3 AND event_type='message.received'`,
 [event.meta.id,conversationId,nativeSessionId])).rows[0];
 if(!saved||saved.turn_id!==row.turn_id||!record(saved.visible_payload)||!record(saved.visible_payload.applicationInputReplay))return false;
 const payload=saved.visible_payload,proof=payload.applicationInputReplay as Record<string,unknown>;
 return Object.keys(proof).length===2&&proof.retryOfInputEventId===canonicalInputEventId&&proof.admittedDeliveryId===row.native_delivery_id&&
  JSON.stringify(fileEnvelope(payload.parts))===JSON.stringify(fileEnvelope(event.data?.parts))&&
  payload.sequence===event.data?.sequence&&typeof payload.message==='string'&&messageDigest(payload.message)===row.input_digest;
}
