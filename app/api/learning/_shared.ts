import { z } from 'zod';
import { HttpFailure,success,failure } from '../../../lib/contracts/http';
import { serializedBytes,learningLimits } from '../../../lib/contracts/learning';
import { getCurrentSession,type CurrentSession } from '../../../lib/server/auth/sessions';
import { checkSessionCsrf } from '../../../lib/server/auth/csrf';
import { gapBody } from '../../../lib/server/gaps/http';
export function learningQuery(request:Request){
 const query=new URL(request.url).searchParams;
 if([...query.keys()].some(key=>query.getAll(key).length!==1))throw new HttpFailure(422,'invalid_input','Duplicate query field');
 return Object.fromEntries(query);
}
export async function learningRequest(request:Request,write:boolean,run:(actor:CurrentSession,body:unknown)=>Promise<unknown>,bytes:number=learningLimits.feedbackBytes):Promise<Response>{
 const correlationId=crypto.randomUUID();
 try{
  const actor=await getCurrentSession(request);if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
  if(write){checkSessionCsrf(request,actor);z.object({}).strict().parse(learningQuery(request));}
  const body=write?await gapBody(request,bytes):undefined;
  if(write){let nodes=0;const walk=(value:unknown,depth:number)=>{if(++nodes>5000||depth>12)throw new HttpFailure(422,'invalid_input','Input structure exceeds limits');if(value&&typeof value==='object')for(const child of Object.values(value))walk(child,depth+1);};walk(body,0);}
  const data=await run(actor,body);
  if(serializedBytes(data)>learningLimits.pageBytes)throw new HttpFailure(413,'response_too_large','Read a smaller learning page');
  const status=data&&typeof data==='object'&&'outcome' in data&&data.outcome==='pending'?202:200;
  const response=success(data,status,correlationId);response.headers.set('Vary','Cookie');return response;
 }catch(error){const response=failure(error instanceof z.ZodError?new HttpFailure(422,'invalid_input','Invalid learning input'):error,correlationId);response.headers.set('Vary','Cookie');return response;}
}
