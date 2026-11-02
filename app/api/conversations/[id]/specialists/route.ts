import {z} from 'zod';
import {getCurrentSession} from '../../../../../lib/server/auth/sessions';
import {failure,success,HttpFailure} from '../../../../../lib/contracts/http';
import {listOwnedSpecialists} from '../../../../../lib/server/research/specialists/discussion-status';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const actor=await getCurrentSession(request);
  if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
  const {id}=await context.params;
  const cursor=new URL(request.url).searchParams.get('cursor')??undefined;
  if(!z.uuid().safeParse(id).success||cursor&&(cursor.length>500||cursor.length<1))throw new HttpFailure(422,'invalid_input','Invalid request');
  return success(await listOwnedSpecialists(actor,id,cursor));
 }catch(error){return failure(error);}
}
