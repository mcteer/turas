import {failure,success,HttpFailure} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {readPlan} from '../../../../../../lib/server/plans/read';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Fixed canonical accepted-head read; ordinary routes remain locked. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,customerId,proof)=>{
   if(proof.readKind!=='plan'||!customerId||!proof.recordId||!proof.recordRevisionId)throw new HttpFailure(403,'forbidden','Recovery plan read unavailable');
   const plan=await readPlan(actor,proof.recordId,proof.recordRevisionId,db);
   if(plan.acceptedRevisionId!==proof.recordRevisionId||plan.revisionId!==proof.recordRevisionId||plan.aggregateVersion!==proof.recordGeneration||plan.contentDigest!==proof.recordDigest)throw new HttpFailure(403,'source_changed','Recovery plan binding changed');
   if(Buffer.byteLength(JSON.stringify(plan))>2097152)throw new HttpFailure(413,'too_large','Recovery response exceeds bound');
   return plan;
  }));
  request.signal.throwIfAborted();return success(result);
 }catch(error){return failure(error);}
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
