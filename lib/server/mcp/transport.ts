import { createMcpHandler } from '@modelcontextprotocol/server';
import { randomUUID } from 'node:crypto';
import { getServerConfig } from '../config';
import { withTransaction } from '../db/client';
import { HttpFailure } from '../../contracts/http';
import { mcpLimits } from '../../contracts/mcp';
import { authenticateMcpBearer } from './credentials';
import { admitMcpRequest,releaseMcpLease,type McpLease } from './limits';
import { createMcpServer } from './tools';
import { lockWorkspaceActor } from '../profiles/policy';
import type { McpReadActor } from '../auth/read-actor';
import { recordMcpAccess,type McpAuditInput } from './audit';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function denied(status:number,code:number,message:string,id:string|number|null=null,retry?:number){
  return Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers:{...headers,...(status===401?{'WWW-Authenticate':'Bearer realm="Turas MCP"'}:{}),...(retry?{'Retry-After':String(Math.min(60,Math.max(1,Math.ceil(retry))))}:{})}});
}
export async function readBoundedMcpBody(request:Request,signal:AbortSignal):Promise<unknown>{
  if(Number(request.headers.get('content-length')??0)>mcpLimits.requestBytes)throw new HttpFailure(413,'too_large','Request too large');
  const reader=request.body?.getReader();if(!reader)throw new HttpFailure(400,'invalid_input','Invalid request');
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();if(next.done)break;bytes+=next.value.byteLength;
    if(bytes>mcpLimits.requestBytes){await reader.cancel();throw new HttpFailure(413,'too_large','Request too large');}chunks.push(next.value);}}
  finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
  const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{throw new HttpFailure(400,'invalid_input','Invalid request');}
}
async function dispatchMcpRequest(request:Request):Promise<Response>{
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(mcpLimits.deadlineMs)]);
  const deadline=Date.now()+mcpLimits.deadlineMs;
  const started=Date.now(),requestId=randomUUID();
  let actor:McpReadActor|undefined,operation:McpAuditInput['operation']='denied',result:McpAuditInput['result']='failed';
  let lease:McpLease|undefined;
  try{
    const origin=getServerConfig().TURAS_APP_ORIGIN;
    if(request.headers.get('host')!==new URL(origin).host)return denied(403,-32600,'Request host denied');
    const suppliedOrigin=request.headers.get('origin');if(suppliedOrigin!==null&&suppliedOrigin!==origin)return denied(403,-32600,'Request origin denied');
    actor=await authenticateMcpBearer(request.headers.get('authorization'));
    const authenticated=actor;
    signal.throwIfAborted();lease=await admitMcpRequest(actor);signal.throwIfAborted();
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){result='invalid_input';return denied(415,-32600,'JSON request required');}
    const body=await readBoundedMcpBody(request,signal);signal.throwIfAborted();
    const object=body as {method?:unknown;id?:unknown};
    if(!object || typeof object!=='object' || Array.isArray(object)){result='invalid_input';return denied(400,-32600,'Invalid request');}
    const id=typeof object.id==='string'||typeof object.id==='number'?object.id:null;
    operation=object.method==='server/discover'||object.method==='tools/list'?'discovery':'denied';
    if(object.method==='tools/call'){
      const name=(object as {params?:{name?:unknown}}).params?.name;
      const operations:Record<string,McpAuditInput['operation']>={turas_identity_v1:'identity',turas_customers_list_v1:'customers',turas_profile_read_v1:'profiles',
        turas_evidence_list_v1:'evidence',turas_evidence_read_v1:'evidence',turas_citation_resolve_v1:'evidence',turas_knowledge_list_v1:'knowledge',turas_knowledge_read_v1:'knowledge',
        turas_plans_list_v1:'plans',turas_plan_read_v1:'plans',turas_reports_list_v1:'reports',turas_report_read_v1:'reports'};
      operation=typeof name==='string'&&Object.hasOwn(operations,name)?operations[name]:'denied';
    }
    if(!['server/discover','tools/list','tools/call'].includes(String(object.method))){result='forbidden';return denied(404,-32601,'Method not found',id);}
    return await withTransaction(async db=>{
      await db.query("SELECT set_config('transaction_timeout',$1,true)",[`${Math.max(1,deadline-Date.now())}ms`]);
      await lockWorkspaceActor(db,authenticated,undefined,true,2000);
      const handler=createMcpHandler(()=>createMcpServer(db,authenticated,signal),{legacy:'reject',responseMode:'json',maxRequestBodySize:mcpLimits.requestBytes});
      try{
        const response=await handler.fetch(request,{parsedBody:body});
        let text=await response.text();signal.throwIfAborted();
        const reply=JSON.parse(text);
        if(reply.error){reply.error={code:reply.error.code,message:'Request unavailable'};result='invalid_input';text=JSON.stringify(reply);}
        else if(reply.result?.isError){reply.result={isError:true,content:[{type:'text',text:'Request unavailable'}]};result='invalid_input';text=JSON.stringify(reply);}
        else{const status=reply.result?.structuredContent?.status;result=['available','empty','unavailable'].includes(status)?status:response.ok?'available':'failed';}
        await lockWorkspaceActor(db,authenticated,undefined,true,2000);signal.throwIfAborted();
        if(new TextEncoder().encode(text).byteLength>mcpLimits.responseBytes)return denied(503,-32603,'Response unavailable',id);
        const responseHeaders=new Headers(response.headers);for(const [key,value] of Object.entries(headers))responseHeaders.set(key,value);
        responseHeaders.delete('Access-Control-Allow-Credentials');responseHeaders.delete('Access-Control-Allow-Origin');
        return new Response(text,{status:response.status,headers:responseHeaders});
      }finally{await handler.close();}
    });
  }catch(error){
    if(error instanceof HttpFailure){result=error.status===429?'limited':error.status===422?'invalid_input':error.status===401||error.status===403||error.status===404?'forbidden':'unavailable';return denied(error.status,error.status===429?-32000:-32600,'Request unavailable',null,error.retryAfterSeconds);}
    return denied(503,-32603,'Service unavailable');
  }finally{
    if(lease)try{await releaseMcpLease(lease);}catch{/* Expiry fences uncertain release; never retry dispatch. */}
    if(actor)try{await recordMcpAccess(actor,{requestId,operation,result,durationMs:Math.min(10000,Date.now()-started)});}catch{/* Usage may be incomplete during an outage; never repeat the read. */}
  }
}

/** Bound the HTTP response even when pool acquisition or post-read cleanup stalls.
 * The underlying dispatch observes the same abort signal before emitting bytes;
 * durable quota admission and lease expiry remain valid after cancellation. */
export async function boundedMcpDispatch(request:Request,dispatch:(request:Request)=>Promise<Response>,deadlineMs:number=mcpLimits.deadlineMs):Promise<Response>{
  const controller=new AbortController();
  const signal=AbortSignal.any([request.signal,controller.signal]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  let abort:()=>void=()=>{};
  const interrupted=new Promise<Response>(resolve=>{
    abort=()=>resolve(denied(503,-32603,'Service unavailable'));
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>controller.abort(),deadlineMs);
    if(signal.aborted)abort();
  });
  try{return await Promise.race([dispatch(new Request(request,{signal})),interrupted]);}
  finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export async function handleMcpRequest(request:Request):Promise<Response>{
  return boundedMcpDispatch(request,dispatchMcpRequest);
}
