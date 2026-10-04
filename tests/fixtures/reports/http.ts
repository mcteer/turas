import { createSessionToken,hashSessionToken,sessionCookieName,type CurrentSession } from '../../../lib/server/auth/sessions';
import { csrfTokenForSession } from '../../../lib/server/auth/csrf';
import { withTransaction } from '../../../lib/server/db/client';
import { createProfileTestSession } from '../profiles';
import {requireOwnedReportsDatabase} from './environment';
export async function reportHttpActor(login:'panel'|'mcteer'|'partner') {
  await requireOwnedReportsDatabase();const token=createSessionToken();
  return withTransaction(async db=>{const actor=await createProfileTestSession(db,login);await db.query('UPDATE login_sessions SET token_hash=$1 WHERE id=$2',[hashSessionToken(token),actor.sessionId]);return {...actor,token};});
}
export function reportHttpRequest(actor:CurrentSession,path:string,body?:unknown) {
  const origin=process.env.TURAS_APP_ORIGIN!;
  return new Request(`${origin}/api/reports${path}`,{method:body===undefined?'GET':'POST',headers:{cookie:`${sessionCookieName()}=${actor.token}`,
    ...(body===undefined?{}:{origin,'x-csrf-token':csrfTokenForSession(actor.token),'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
export const reportHttpContext=(reportId:string)=>({params:Promise.resolve({reportId})});
