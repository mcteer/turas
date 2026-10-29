import {failure,success,HttpFailure} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {readExecutionRecoveryBinding,readRecoveryExecution} from '../../../../../../lib/server/operations/recovery-execution-read';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Fixed, accepted-only canonical delivery read. Ordinary ingress stays locked. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,customerId,proof)=>{
   if(proof.readKind!=='execution'||!customerId||!proof.recordId)throw new HttpFailure(403,'forbidden','Recovery execution read unavailable');
   const binding=await readExecutionRecoveryBinding(db,{environmentId:proof.environmentId,workspaceId:actor.workspaceId,customerId,engagementId:proof.recordId});
   if(binding.bindingDigest!==proof.recordDigest)throw new HttpFailure(403,'source_changed','Recovery execution binding changed');
   const execution=await readRecoveryExecution(db,actor,binding);
   if(Buffer.byteLength(JSON.stringify(execution))>2097152)throw new HttpFailure(413,'too_large','Recovery response exceeds bound');
   return execution;
  }));
  request.signal.throwIfAborted();return success(result);
 }catch(error){if(!(error instanceof HttpFailure))console.error(JSON.stringify({kind:'recovery_execution_read_failed',databaseCode:error&&typeof error==='object'&&'code' in error&&/^[0-9A-Z]{5}$/.test(String(error.code))?String(error.code):null,errorName:error instanceof Error&&['TypeError','ReferenceError','ZodError'].includes(error.name)?error.name:'other'}));return failure(error);}
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
