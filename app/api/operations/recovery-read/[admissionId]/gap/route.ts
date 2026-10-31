import {createHash} from 'node:crypto';
import {failure,HttpFailure} from '../../../../../../lib/contracts/http';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {gapExportResponse} from '../../../../../../lib/server/gaps/report-artifacts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Fully consume the canonical, rechecked stream inside the live admission.
 * Returning this bounded buffer does not claim continuous network revocation. */
export async function GET(request:Request,context:{params:Promise<{admissionId:string}>}){
 try{
  const {admissionId}=await context.params;
  await withTransaction(db=>authenticateRecoveryHttpRead(db,request,admissionId,true));
  const result=await withTransaction(db=>withRecoveryHttpReadCapability(db,request,admissionId,async(actor,_customerId,proof)=>{
   if(proof.readKind!=='gap'||!proof.recordParentId||!proof.recordId||!proof.recordDigest||!proof.recordSize)throw new HttpFailure(403,'forbidden','Recovery read unavailable');
   // Explicitly inject the same authenticated transaction, retaining canonical
   // authorization and per-chunk source checks without a global bypass flag.
   const response=await gapExportResponse(actor,proof.recordParentId!,proof.recordId,read=>read(db));
   const reader=response.body?.getReader();if(!reader)throw new HttpFailure(503,'dependency_unavailable','Original unavailable');
   const parts:Buffer[]=[];let size=0;const hash=createHash('sha256');
   try{for(;;){request.signal.throwIfAborted();const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>proof.recordSize||size>5242880)throw new HttpFailure(503,'dependency_unavailable','Original unavailable');const bytes=Buffer.from(item.value);parts.push(bytes);hash.update(bytes);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(size!==proof.recordSize||hash.digest('hex')!==proof.recordDigest)throw new HttpFailure(503,'dependency_unavailable','Original unavailable');
   return {bytes:Buffer.concat(parts,size),headers:response.headers};
  }));
  request.signal.throwIfAborted();return new Response(result.bytes,{headers:result.headers});
 }catch(error){if(!(error instanceof HttpFailure))console.error(JSON.stringify({kind:'recovery_gap_read_failed',databaseCode:error&&typeof error==='object'&&'code' in error&&/^[0-9A-Z]{5}$/.test(String(error.code))?String(error.code):null}));return failure(error);}
}
export async function HEAD(){return failure(new HttpFailure(403,'forbidden','Recovery read unavailable'));}
