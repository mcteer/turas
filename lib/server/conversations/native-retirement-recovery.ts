import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import type {CurrentSession} from '../auth/sessions';
import {lockOwnedOrdinaryCleanup} from './binding';
import {markNativeUploadsRetired} from './native-uploads';
import {conversationFeature} from './feature';
import {reconcileRetiredSpecialists} from '../research/specialists/discussion-retirement';
const prefix='ordinary-native-retirement-v1';
function signature(id:string,native:string,timestamp:number){return createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(`${prefix}\n${id}\n${native}\n${timestamp}`).digest('hex');}
export function signOrdinaryNativeRetirement(id:string,native:string){const timestamp=Date.now();return {'x-turas-ordinary-retirement-id':id,'x-turas-ordinary-retirement-at':String(timestamp),'x-turas-ordinary-retirement-signature':signature(id,native,timestamp)};}
async function intent(db:import('pg').PoolClient,native:string,id?:string){
 const row=(await db.query<{id:string;conversation_id:string;owner_principal_id:string}>(`SELECT r.id,r.conversation_id,r.owner_principal_id FROM ordinary_native_retirements r JOIN conversations c
 ON c.id=r.conversation_id AND c.eve_session_id=r.native_session_id AND c.owner_principal_id=r.owner_principal_id AND c.workspace_id=r.workspace_id AND c.environment_id=r.environment_id
 WHERE r.environment_id=$1 AND r.native_session_id=$2 AND ($3::uuid IS NULL OR r.id=$3) AND c.binding_state='bound' FOR UPDATE OF r,c`,[getServerConfig().TURAS_ENVIRONMENT_ID,native,id??null])).rows[0];
 return row&&(await conversationFeature(db,row.conversation_id)).kind==='normal'?row:undefined;
}
export async function requestOrdinaryNativeRetirement(actor:CurrentSession,native:string){return withTransaction(async db=>{
 const conversation=await lockOwnedOrdinaryCleanup(db,actor,native);
 await db.query(`INSERT INTO ordinary_native_retirements(id,environment_id,workspace_id,owner_principal_id,conversation_id,native_session_id)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(conversation_id) DO NOTHING`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,conversation.id,native]);
});}
export async function authorizeOrdinaryNativeRetirementRecovery(request:Request,native:string){
 const id=request.headers.get('x-turas-ordinary-retirement-id'),timestamp=Number(request.headers.get('x-turas-ordinary-retirement-at')),signed=request.headers.get('x-turas-ordinary-retirement-signature');
 if(!id||!z.uuid().safeParse(id).success||!Number.isSafeInteger(timestamp)||Math.abs(Date.now()-timestamp)>30000||!signed||!/^[a-f0-9]{64}$/.test(signed))return null;
 if(!timingSafeEqual(Buffer.from(signed,'hex'),Buffer.from(signature(id,native,timestamp),'hex')))return null;
 return withTransaction(async db=>(await intent(db,native,id))?.owner_principal_id??null);
}
export function terminalNativeRetirementReceipt(native:string,value:unknown){return z.discriminatedUnion('status',[
 z.object({ok:z.literal(true),status:z.literal('reset'),previousSessionId:z.literal(native)}),z.object({ok:z.literal(true),status:z.literal('ended'),sessionId:z.literal(native),confirmationBasis:z.literal('native-end-returned-after-inbox-release')}),z.object({ok:z.literal(true),status:z.literal('no_active_session')})]).safeParse(value).success;}
/** Receipt, terminal response admission and durable byte-purge eligibility commit together. */
export async function confirmOrdinaryNativeRetirement(native:string,id?:string){return withTransaction(async db=>{
 const row=await intent(db,native,id);if(!row)return false;
 await db.query(`UPDATE response_attempts SET response_state='cancelled',updated_at=now(),revision=revision+1 WHERE conversation_id=$1 AND response_state IN('pending','running','waiting_input','stopping')`,[row.conversation_id]);
 await db.query(`UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE attempt_id IN(SELECT id FROM response_attempts WHERE conversation_id=$1 AND response_state='cancelled')`,[row.conversation_id]);
 await db.query("UPDATE ordinary_native_retirements SET state='confirmed',confirmed_at=COALESCE(confirmed_at,clock_timestamp()),safe_error_code=NULL WHERE id=$1",[row.id]);
  await reconcileRetiredSpecialists(db,native);
 await markNativeUploadsRetired(db,row.conversation_id);return true;
});}
/** Retry one recorded reset using the same narrowly signed native service authority as source retirement. */
export async function processOrdinaryNativeRetirement(){
 const job=await withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];if(Number(marker?.schema_version??0)<76)return null;
  const row=(await db.query<{id:string;native_session_id:string}>(`SELECT id,native_session_id FROM ordinary_native_retirements WHERE environment_id=$1 AND state='requested' AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(row)await db.query("UPDATE ordinary_native_retirements SET attempts=attempts+1,next_attempt_at=now()+interval '30 seconds' WHERE id=$1",[row.id]);return row;
 });if(!job)return false;
 try{
  const configured=process.env.TURAS_EVE_INTERNAL_ORIGIN||getServerConfig().TURAS_DEPLOYMENT_ORIGIN||getServerConfig().TURAS_APP_ORIGIN;
  const target=new URL(configured);if(target.username||target.password||target.hash||target.search||target.pathname!=='/'||!(target.protocol==='https:'||target.protocol==='http:'&&['127.0.0.1','localhost'].includes(target.hostname)))throw Error();
  const origin=target.origin+'/';
  const response=await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.native_session_id)}/end`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',...(target.protocol==='https:'&&process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{}),...signOrdinaryNativeRetirement(job.id,job.native_session_id)},body:JSON.stringify({reason:'Owner-requested conversation retirement recovery'}),signal:AbortSignal.timeout(5000)});
  if(!response.ok||!terminalNativeRetirementReceipt(job.native_session_id,await response.json()))throw Error();
  await confirmOrdinaryNativeRetirement(job.native_session_id,job.id);
 }catch{await withTransaction(async db=>{await db.query("UPDATE ordinary_native_retirements SET safe_error_code='native_retirement_unconfirmed' WHERE id=$1 AND state='requested'",[job.id]);});}
 return true;
}
