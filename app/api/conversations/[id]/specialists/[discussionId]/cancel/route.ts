import {z} from 'zod';
import {getServerConfig} from '../../../../../../../lib/server/config';
import {getCurrentSession} from '../../../../../../../lib/server/auth/sessions';
import {checkSessionCsrf} from '../../../../../../../lib/server/auth/csrf';
import {failure,success,HttpFailure} from '../../../../../../../lib/contracts/http';
import {cancelSpecialistSchema} from '../../../../../../../lib/contracts/specialist-discussions';
import {fenceSpecialistCancellation} from '../../../../../../../lib/server/research/specialists/discussions';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string;discussionId:string}>}){
 try{
  const actor=await getCurrentSession(request,'cancellation');
  if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
  checkSessionCsrf(request,actor);
  const {id,discussionId}=await context.params;
  if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(discussionId).success)throw new HttpFailure(422,'invalid_input','Invalid request');
  if(Number(request.headers.get('content-length')??0)>1024)throw new HttpFailure(413,'too_large','Request too large');
  const text=await request.text();
  if(Buffer.byteLength(text)>1024)throw new HttpFailure(413,'too_large','Request too large');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new HttpFailure(422,'invalid_input','Invalid request');}
  if(!cancelSpecialistSchema.safeParse(body).success)throw new HttpFailure(422,'invalid_input','Invalid request');
  const discussion=await fenceSpecialistCancellation(actor,id,discussionId);
  if(discussion.closedAt)return success({state:discussion.terminalState??'closed'});
  // The durable fence precedes this request. An uncertain acknowledgement stays
  // stopping; only native facts can claim cancelled or refund settled usage.
  const config=getServerConfig();
  const allowed=[config.TURAS_APP_ORIGIN,config.TURAS_PREVIEW_BRANCH_ORIGIN,config.TURAS_DEPLOYMENT_ORIGIN].filter((value):value is string=>Boolean(value));
  const incoming=new URL(request.url),host=request.headers.get('host')??incoming.host;
  const origin=allowed.find(value=>new URL(value).host===host);
  if(!origin)throw new HttpFailure(403,'invalid_origin','Request origin denied');
  try{
   const response=await fetch(new URL('/eve/v1/turas/specialists/'+discussionId+'/cancel',origin),{method:'POST',redirect:'error',
    headers:{'content-type':'application/json',cookie:request.headers.get('cookie')??'',origin:request.headers.get('origin')??'','x-csrf-token':request.headers.get('x-csrf-token')??'',...(request.headers.get('x-vercel-protection-bypass')?{'x-vercel-protection-bypass':request.headers.get('x-vercel-protection-bypass')!}:{})},
    body:JSON.stringify({conversationId:id,...cancelSpecialistSchema.parse(body)}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Runtime cancellation unavailable');
  }catch{return success({state:'stopping'},202);}
  return success({state:'stopping'},202);
 }catch(error){return failure(error);}
}
