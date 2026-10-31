import {failure,success,HttpFailure} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {getOwnedConversation} from '../../../../../../lib/server/conversations/repository';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Exact finite private-reference read, with the ordinary owner/source policy. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,_customerId,proof)=>{
   if(proof.readKind!=='conversation'||!proof.recordId)throw new HttpFailure(403,'forbidden','Recovery conversation read unavailable');
   const conversation=await getOwnedConversation(actor,proof.recordId,db);
   if(conversation.version!==proof.recordGeneration)throw new HttpFailure(403,'source_changed','Recovery conversation changed');
   if(Buffer.byteLength(JSON.stringify(conversation))>2097152)throw new HttpFailure(413,'too_large','Recovery response exceeds bound');
   return conversation;
  }));
  request.signal.throwIfAborted();return success(result);
 }catch(error){return failure(error);}
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
