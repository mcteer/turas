import type {AttachSessionFn} from 'eve/channels';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { getServerConfig } from '../config';
import { learningTransaction } from './repository';
import { learningId } from '../../contracts/learning';
const signature=(session:string,attempt:string,at:number)=>createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(`learning-retirement-v1\n${session}\n${attempt}\n${at}`).digest('hex');
export function signLearningRetirement(session:string,attempt:string){const at=Date.now();return {'x-turas-learning-retire-at':String(at),'x-turas-learning-retire-attempt':attempt,'x-turas-learning-retire-signature':signature(session,attempt,at)};}
export async function authorizeLearningRetirement(request:Request,session:string):Promise<string|null>{
 const attempt=request.headers.get('x-turas-learning-retire-attempt'),rawAt=request.headers.get('x-turas-learning-retire-at'),signed=request.headers.get('x-turas-learning-retire-signature'),at=Number(rawAt);
 if(!learningId.safeParse(attempt).success||!rawAt||!/^\d{13}$/.test(rawAt)||!Number.isSafeInteger(at)||Math.abs(Date.now()-at)>30000||!signed||!/^[a-f0-9]{64}$/.test(signed)||!timingSafeEqual(Buffer.from(signed,'hex'),Buffer.from(signature(session,attempt!,at),'hex')))return null;
 return learningTransaction(async db=>(await db.query(`SELECT c.owner_principal_id FROM learning_cleanup_jobs j JOIN learning_attempts a ON a.id=j.owner_id JOIN conversations c ON c.id=a.conversation_id
  WHERE j.owner_kind='attempt' AND j.owner_id=$1 AND j.environment_id=$2 AND a.environment_id=j.environment_id AND a.workspace_id=j.workspace_id AND c.eve_session_id=$3 AND a.native_session_id=$3 AND j.state='running' AND a.state IN('completed','failed','cancelled','unconfirmed','invalidated')`,[attempt,getServerConfig().TURAS_ENVIRONMENT_ID,session])).rows[0]?.owner_principal_id??null);
}
/** A bounded cleanup retry resets storage only, never provider generation. */
export async function processLearningNativeRetirement(options:{at?:Date;ownerId?:string;attachSession?:AttachSessionFn}={}):Promise<boolean>{
 const origin=process.env.TURAS_EVE_INTERNAL_ORIGIN;if(!options.attachSession&&(!origin||!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(origin)))return false;
 const at=options.at??new Date();if(!Number.isFinite(at.getTime()))throw Error('Valid retirement clock required');if(options.ownerId)learningId.parse(options.ownerId);
 const job=await learningTransaction(async db=>{
  const env=getServerConfig().TURAS_ENVIRONMENT_ID;
  if(Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[env])).rows[0]?.schema_version??0)<54)return null;
  const exhausted=(await db.query(`UPDATE learning_cleanup_jobs SET state='review_required' WHERE id IN(SELECT id FROM learning_cleanup_jobs WHERE environment_id=$1 AND owner_kind='attempt' AND state='running' AND attempts>=4 AND next_attempt_at<=$2 AND($3::uuid IS NULL OR owner_id=$3) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`,[env,at,options.ownerId??null])).rows[0];if(exhausted)return {...exhausted,reviewRequired:true};
  const row=(await db.query(`SELECT j.*,a.native_session_id FROM learning_cleanup_jobs j JOIN learning_attempts a ON a.id=j.owner_id
   WHERE j.environment_id=$1 AND j.owner_kind='attempt' AND j.state IN('pending','running') AND j.due_at<=$2 AND j.next_attempt_at<=$2 AND j.attempts<4 AND($3::uuid IS NULL OR j.owner_id=$3)
   AND a.state IN('completed','failed','cancelled','unconfirmed','invalidated') ORDER BY j.next_attempt_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[env,at,options.ownerId??null])).rows[0];
  if(!row)return null;
  if(!row.native_session_id){await db.query("UPDATE learning_cleanup_jobs SET state='completed',completed_at=clock_timestamp() WHERE id=$1",[row.id]);return row;}
  await db.query("UPDATE learning_cleanup_jobs SET state='running',attempts=attempts+1,next_attempt_at=$2::timestamptz+CASE attempts WHEN 0 THEN interval '1 minute' WHEN 1 THEN interval '5 minutes' ELSE interval '15 minutes' END WHERE id=$1",[row.id,at]);return {...row,attempts:Number(row.attempts)+1};
 });
 if(!job)return false;if(job.reviewRequired||!job.native_session_id)return true;
 let success=false;
 try{
  if(options.attachSession){let timeout:ReturnType<typeof setTimeout>|undefined;try{const result=await Promise.race([options.attachSession(job.native_session_id).reset({reason:'Governed learning context retired'}),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Native retirement timed out')),5000);})]);success=result.status==='no_active_session'||result.status==='reset'&&result.previousSessionId===job.native_session_id;}finally{clearTimeout(timeout);}}else{
  const response=await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.native_session_id)}/reset`,{method:'POST',headers:{'content-type':'application/json',...signLearningRetirement(job.native_session_id,job.owner_id)},body:JSON.stringify({reason:'Governed learning context retired'}),signal:AbortSignal.timeout(5000)});
  if(response.ok){success=true;await response.body?.cancel();}
  else if(response.status===409&&response.body){
   const reader=response.body.getReader();let bytes=0,body='';try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4096)break;body+=new TextDecoder().decode(chunk.value,{stream:true});}success=bytes<=4096&&body.includes('no_active_session');}finally{await reader.cancel();}
  }else await response.body?.cancel();
 }
 }catch{/* Unknown cleanup remains durable; it cannot admit a paid retry. */}
 await learningTransaction(async db=>{
  if(success){
   await db.query('INSERT INTO learning_native_retirement_receipts(attempt_id,native_session_id) VALUES($1,$2) ON CONFLICT(attempt_id) DO NOTHING',[job.owner_id,job.native_session_id]);
   await db.query("UPDATE learning_cleanup_jobs SET state='completed',completed_at=clock_timestamp() WHERE id=$1",[job.id]);
  }else await db.query(`UPDATE learning_cleanup_jobs SET state=CASE WHEN attempts>=4 THEN 'review_required' ELSE 'pending' END,next_attempt_at=$2::timestamptz+CASE attempts WHEN 1 THEN interval '1 minute' WHEN 2 THEN interval '5 minutes' ELSE interval '15 minutes' END WHERE id=$1`,[job.id,at]);
 });return true;
}
