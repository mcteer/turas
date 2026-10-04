import type {CurrentSession} from '../auth/sessions';
import {getCurrentSession} from '../auth/sessions';
import {checkSessionCsrf} from '../auth/csrf';
import {reportId} from './schema';
import {randomUUID} from 'node:crypto';
import {HttpFailure} from '../../contracts/http';
export function reportJson(data:unknown,status=200){
 const body=JSON.stringify({contractVersion:'reports-v1',data,requestId:randomUUID()});
 if(Buffer.byteLength(body)>1048576)throw new HttpFailure(413,'body_too_large','Report response exceeds limit');
 return new Response(body,{status,headers:{'content-type':'application/json','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
export function reportFailure(error:unknown){
 const known=error instanceof HttpFailure;const status=known?error.status:503;
 return Response.json({contractVersion:'reports-v1',error:{code:known?error.code:'unavailable',message:known?error.message:'Reports unavailable',retryable:[429,503].includes(status)},requestId:randomUUID()},
 {status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...(known && error.retryAfterSeconds?{'retry-after':String(error.retryAfterSeconds)}:{})}});
}
export async function readReportBody(request:Request){
 const length=request.headers.get('content-length');if(length && (!/^\d+$/.test(length) || Number(length)>131072))throw new HttpFailure(413,'body_too_large','Command exceeds limit');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new HttpFailure(415,'invalid_input','JSON required');
 const reader=request.body?.getReader();if(!reader)throw new HttpFailure(400,'invalid_input','Command required');
 const chunks:Uint8Array[]=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw new HttpFailure(413,'body_too_large','Command exceeds limit');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
 catch(error){if(error instanceof HttpFailure)throw error;throw new HttpFailure(400,'invalid_input','Invalid JSON');}finally{await reader.cancel();}
}

export function reportRouteId(raw:string){const parsed=reportId.safeParse(raw);if(!parsed.success)throw new HttpFailure(400,'invalid_input','Invalid identity');return parsed.data;}
export async function reportRequest(request:Request,write:boolean,run:(actor:CurrentSession,body:unknown)=>Promise<unknown>){
 try{const actor=await getCurrentSession(request);if(!actor)throw new HttpFailure(401,'unauthenticated','Sign in required');if(write)checkSessionCsrf(request,actor);
 return reportJson(await run(actor,write?await readReportBody(request):undefined));}catch(error){return reportFailure(error);}
}
export function reportQuery(request:Request,allowed:readonly string[]){
 const params=new URL(request.url).searchParams;
 if([...params.keys()].some(key=>!allowed.includes(key) || params.getAll(key).length!==1) || params.toString().length>4096)throw new HttpFailure(400,'invalid_input','Invalid report query');return Object.fromEntries(params);
}
