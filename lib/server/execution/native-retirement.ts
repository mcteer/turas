import {createHmac,timingSafeEqual} from "node:crypto";
import {getServerConfig} from "../config";
import {withTransaction} from "../db/client";
const signature=(session:string,attempt:string,at:number)=>createHmac("sha256",getServerConfig().TURAS_MAINTENANCE_SECRET)
  .update(`execution-retirement-v1\n${session}\n${attempt}\n${at}`).digest("hex");
export function signExecutionRetirement(session:string,attempt:string){const at=Date.now();return {
  "x-turas-execution-retire-at":String(at),"x-turas-execution-retire-attempt":attempt,"x-turas-execution-retire-signature":signature(session,attempt,at)};}
export async function authorizeExecutionRetirement(request:Request,session:string):Promise<string|null>{
  const attempt=request.headers.get("x-turas-execution-retire-attempt"),at=Number(request.headers.get("x-turas-execution-retire-at")),signed=request.headers.get("x-turas-execution-retire-signature");
  if(!attempt||!/^[a-f0-9-]{36}$/.test(attempt)||!Number.isSafeInteger(at)||Math.abs(Date.now()-at)>30000||!signed||!/^[a-f0-9]{64}$/.test(signed))return null;
  if(!timingSafeEqual(Buffer.from(signed,"hex"),Buffer.from(signature(session,attempt,at),"hex")))return null;
  return withTransaction(async db=>(await db.query(`SELECT c.owner_principal_id FROM execution_native_retirement_receipts n
    JOIN execution_advice_retirements r ON r.attempt_id=n.attempt_id JOIN execution_advice_attempts a ON a.id=r.attempt_id
    JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND a.environment_id=$2 AND c.eve_session_id=$3 AND n.state='pending'`,
    [attempt,getServerConfig().TURAS_ENVIRONMENT_ID,session])).rows[0]?.owner_principal_id??null);
}
/** Supported Eve reset retires the exact native ID. This receipt does not claim
 * physical erasure of framework archives or an external provider's storage. */
export async function processExecutionNativeRetirement():Promise<boolean>{
  const origin=process.env.TURAS_EVE_INTERNAL_ORIGIN;
  if(!origin||!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(origin))return false;
  const job=await withTransaction(async db=>{
    if(Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1",[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.schema_version??0)<38)return null;
    const row=(await db.query(`SELECT n.attempt_id,c.eve_session_id FROM execution_native_retirement_receipts n
      JOIN execution_advice_attempts a ON a.id=n.attempt_id JOIN conversations c ON c.id=a.conversation_id
      WHERE a.environment_id=$1 AND n.state='pending' AND n.next_attempt_at<=now() ORDER BY n.next_attempt_at,n.attempt_id FOR UPDATE OF n SKIP LOCKED LIMIT 1`,[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if(row)await db.query("UPDATE execution_native_retirement_receipts SET next_attempt_at=now()+interval '30 seconds',attempts=attempts+1 WHERE attempt_id=$1",[row.attempt_id]);return row;
  });
  if(!job)return false;
  try{
    const response=await fetch(`${origin}eve/v1/session/${encodeURIComponent(job.eve_session_id)}/reset`,{method:"POST",
      headers:{"content-type":"application/json",...signExecutionRetirement(job.eve_session_id,job.attempt_id)},
      body:JSON.stringify({reason:"Execution advice retention expired"}),signal:AbortSignal.timeout(5000)});
    const body=await response.text();
    if(response.ok||response.status===409&&body.includes("no_active_session"))await withTransaction(db=>db.query(
      "UPDATE execution_native_retirement_receipts SET state='done',completed_at=now() WHERE attempt_id=$1",[job.attempt_id]).then(()=>undefined));
  }catch{/* exact pending receipt permits bounded retirement retry, never paid redispatch */}
  return true;
}
