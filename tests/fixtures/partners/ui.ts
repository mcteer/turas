import { csrfTokenForSession } from "../../../lib/server/auth/csrf";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
export function partnerHttpRequest(actor:CurrentSession,path:string,body?:unknown){return new Request(process.env.TURAS_APP_ORIGIN+path,{method:body===undefined?"GET":"POST",headers:{cookie:`turas_session=${actor.token}`,origin:process.env.TURAS_APP_ORIGIN!,"content-type":"application/json","x-csrf-token":csrfTokenForSession(actor.token)},...(body===undefined?{}:{body:JSON.stringify(body)})});}
