import {Resend} from 'resend';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {reportConfig} from './config';
import {reportId} from './schema';
import {withTransaction} from '../db/client';
import {requireReportEnvironment} from './readiness';
import {projectDeliveryEvents} from './outbox';
import {normalizeReportAddress} from './recipients';
const eventSchema=z.object({type:z.enum(['email.sent','email.delivered','email.bounced','email.complained','email.failed']),created_at:z.iso.datetime({offset:true}),data:z.object({email_id:reportId,from:z.string().max(254),to:z.array(z.string().max(254)).length(1),subject:z.string().max(200),tags:z.record(z.string(),z.string()).optional()})});
export async function verifyReportWebhook(request:Request){
 const secret=reportConfig().webhookSecret;if(!secret)throw new HttpFailure(503,'webhook_unavailable','Report receipt verification unavailable');
 const id=request.headers.get('svix-id'),timestamp=request.headers.get('svix-timestamp'),signature=request.headers.get('svix-signature');
 if(!id || id.length>200 || !timestamp || !/^\d{1,12}$/.test(timestamp) || !signature || signature.length>2048)throw new HttpFailure(401,'invalid_signature','Invalid receipt signature');
 const reader=request.body?.getReader();if(!reader)throw new HttpFailure(400,'invalid_input','Receipt required');
 const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw new HttpFailure(413,'body_too_large','Receipt exceeds limit');chunks.push(value);}}finally{await reader.cancel();}
 let verified:unknown;
 try{verified=new Resend('re_webhook_verification_only').webhooks.verify({payload:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),headers:{id,timestamp,signature},webhookSecret:secret});}catch{throw new HttpFailure(401,'invalid_signature','Invalid receipt signature');}
 const parsed=eventSchema.safeParse(verified);if(!parsed.success){
  // Signed unrelated event types are acknowledged without storing their content.
  if(typeof verified==='object' && verified && 'type' in verified && typeof verified.type==='string' && !['email.sent','email.delivered','email.bounced','email.complained','email.failed'].includes(verified.type))return null;
  throw new HttpFailure(422,'invalid_input','Invalid report receipt');
 }
 return {providerEventId:id,event:parsed.data};
}
export async function acceptReportWebhook(request:Request){
 const verified=await verifyReportWebhook(request);if(!verified)return {accepted:true};
 const {providerEventId,event}=verified;
 const type=({'email.sent':'accepted','email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.failed':'failed'} as const)[event.type];
 const inserted=await withTransaction(async db=>{
  await requireReportEnvironment(db);
  const tag=event.data.tags?.turas_delivery;
  const row=reportId.safeParse(tag).success?(await db.query('SELECT id,payload_digest,provider_message_id FROM report_deliveries WHERE id=$1 AND environment_id=$2',[tag,process.env.TURAS_ENVIRONMENT_ID])).rows[0]:null;
  let deliveryId:string|null=null;
  if(row){
   const payload=(await db.query('SELECT request_bytes FROM report_delivery_payloads WHERE delivery_id=$1 AND expires_at>now()',[row.id])).rows[0];
   if(payload && createHash('sha256').update(payload.request_bytes).digest('hex')===row.payload_digest){
    const frozen=JSON.parse(payload.request_bytes.toString('utf8'));
    if(frozen.tags?.[0]?.value===row.id && frozen.from===normalizeReportAddress(event.data.from) && frozen.to?.[0]===normalizeReportAddress(event.data.to[0]) && frozen.subject===event.data.subject && (!row.provider_message_id || row.provider_message_id===event.data.email_id))deliveryId=row.id;
   }
  }
  // No raw receipt, sender, recipient, subject, IP, or bounce prose is retained.
  const prior=(await db.query('SELECT id,delivery_id,provider_message_id,event_type FROM report_delivery_events WHERE environment_id=$1 AND provider_event_id=$2',[process.env.TURAS_ENVIRONMENT_ID,providerEventId])).rows[0];
   if(prior){if(prior.provider_message_id!==event.data.email_id || prior.event_type!==type || prior.delivery_id!==deliveryId)throw new HttpFailure(409,'receipt_conflict','Receipt identity changed');return prior.delivery_id;}
   if(!deliveryId){
    // Signed unrelated receipt traffic cannot grow an unbounded quarantine.
    // Serialize only unmatched admission; matched receipt settlement remains free.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-unmatched-events:${process.env.TURAS_ENVIRONMENT_ID}`]);
    const count=Number((await db.query('SELECT count(*) AS n FROM report_delivery_events WHERE environment_id=$1 AND delivery_id IS NULL',[process.env.TURAS_ENVIRONMENT_ID])).rows[0].n);
    if(count>=1000)return null;
   }
   await db.query('INSERT INTO report_delivery_events(id,environment_id,provider_event_id,provider_message_id,delivery_id,event_type,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(environment_id,provider_event_id) DO NOTHING',[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,providerEventId,event.data.email_id,deliveryId,type,event.created_at]);
  return deliveryId;
 });
 // Commit verified facts before waiting on a dispatch lock. This handles events before POST acknowledgement.
 if(inserted)await withTransaction(db=>projectDeliveryEvents(db,inserted));
 return {accepted:true};
}
