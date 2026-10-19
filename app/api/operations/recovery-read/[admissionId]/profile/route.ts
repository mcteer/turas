import {failure,success,HttpFailure} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {readProfile} from '../../../../../../lib/server/profiles/read';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Fixed canonical maintenance read. Ordinary login/routes remain locked. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  // Commit the finite reservation before the read, so a failed reader cannot
  // restore request allowance by rolling its transaction back.
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,customerId)=>{
   const profile=await readProfile(actor,customerId,db,undefined,undefined,false,true);
   if(Buffer.byteLength(JSON.stringify(profile))>2097152)throw new HttpFailure(413,'too_large','Recovery response exceeds bound');
   return profile;
  }));
  request.signal.throwIfAborted();return success(result);
 }catch(error){
  if(!(error instanceof HttpFailure))console.error(JSON.stringify({kind:'recovery_http_read_failed',databaseCode:error&&typeof error==='object'&&'code' in error&&/^[0-9A-Z]{5}$/.test(String(error.code))?String(error.code):null}));
  return failure(error);
 }
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
