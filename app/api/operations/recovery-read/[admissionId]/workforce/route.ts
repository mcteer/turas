import {createHash} from 'node:crypto';
import {failure,HttpFailure,versionedHeaders} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {readImportOriginal} from '../../../../../../lib/server/staffing/imports';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Workspace personnel authority stays distinct from customer delivery access.
 * The bounded canonical reader rechecks manager/session/source after file IO. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,customerId,proof)=>{
   if(proof.readKind!=='workforce'||customerId!==null||!proof.recordId||!proof.recordDigest||!proof.recordSize)throw new HttpFailure(403,'forbidden','Recovery read unavailable');
   const original=await readImportOriginal(actor,proof.recordId,read=>read(db));
   if(original.bytes.length!==proof.recordSize||original.bytes.length>10485760||createHash('sha256').update(original.bytes).digest('hex')!==proof.recordDigest)throw new HttpFailure(503,'dependency_unavailable','Original unavailable');
   return {bytes:original.bytes,mime:original.mime};
  }));
  request.signal.throwIfAborted();return new Response(result.bytes,{headers:versionedHeaders({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':result.mime,'Content-Disposition':'attachment; filename="workforce-original"','Content-Length':String(result.bytes.length)})});
 }catch(error){return failure(error);}
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
