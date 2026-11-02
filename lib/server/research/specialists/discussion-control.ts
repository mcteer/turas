import {z} from 'zod';
import {resumeHook} from 'eve/workflow/api';
import {getCurrentSession} from '../../auth/sessions';
import {checkSessionCsrf} from '../../auth/csrf';
import {failure,success,HttpFailure} from '../../../contracts/http';
import {cancelSpecialistSchema} from '../../../contracts/specialist-discussions';
import {fenceSpecialistCancellation} from './discussions';

/** Execute inside the Eve service, which owns the workflow world. The durable Stop
 * hook belongs to this service; a Next.js process has its own SDK world. */
export async function cancelSpecialistInRuntime(request:Request,discussionId:string){
 try{
  const actor=await getCurrentSession(request,'cancellation');
  if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
  checkSessionCsrf(request,actor);
  if(!z.uuid().safeParse(discussionId).success)throw new HttpFailure(422,'invalid_input','Invalid request');
  const raw=await request.text();if(Buffer.byteLength(raw)>1024)throw new HttpFailure(413,'too_large','Request too large');
  let decoded:unknown;try{decoded=JSON.parse(raw);}catch{throw new HttpFailure(422,'invalid_input','Invalid request');}
  const input=cancelSpecialistSchema.extend({conversationId:z.uuid()}).safeParse(decoded);
  if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');
  const discussion=await fenceSpecialistCancellation(actor,input.data.conversationId,discussionId);
  if(discussion.closedAt)return success({state:discussion.terminalState??'closed'});
  try{await resumeHook(discussion.controlHookToken,{stop:true});}catch{return success({state:'stopping'},202);}
  return success({state:'stopping'},202);
 }catch(error){return failure(error);}
}
