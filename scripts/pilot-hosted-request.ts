import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
const safeFailureCodes=new Set(['session_fence_changed','plan_source_changed','plan_citation_changed','stale_review','capacity_conflict','qualification_incomplete','invalid_transition','source_changed','version_conflict','invalid_disposition','invalid_assessment','invalid_owner','evaluation_unavailable']);
/** Fixed transport metadata only; error prose and response bodies are excluded. */
export class PilotHostedResponseError extends Error{
 constructor(readonly status:number,readonly releaseMatches:boolean,readonly errorCode:string|null){super('Pilot API response unavailable or release differs (HTTP '+status+')');}
}

/** A release-bound transport for fixed, authored journey paths. Callers own
 * mutation admission and original-key reconciliation; this never retries. */
export function pilotHostedRequest(input:{scope:PilotHostedScope;headers:Headers;signal:AbortSignal;transport?:typeof fetch}){
 const origin=new URL(input.scope.origin).origin,transport=input.transport??fetch;
 return async(path:string,method:'GET'|'POST'|'PATCH'|'DELETE'|'PUT',body?:unknown):Promise<unknown>=>{
  input.signal.throwIfAborted();
  const target=new URL(path,origin);
  if(!path.startsWith('/api/')||path.includes('\\')||target.origin!==origin||!target.pathname.startsWith('/api/'))throw Error('Fixed same-origin pilot API path required');
  const response=await transport(origin+path,{method,headers:input.headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});
  const releaseMatches=response.headers.get('x-turas-code-version')===input.scope.sourceCommit;
  if(!releaseMatches||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){
   await response.body?.cancel();throw new PilotHostedResponseError(response.status,releaseMatches,null);
  }
  const reader=response.body?.getReader();if(!reader)throw Error('Pilot API body required');
  const chunks:Uint8Array[]=[];let size=0;
  try{
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw Error('Pilot API response exceeds private bound');chunks.push(part.value);}
   const body=Buffer.concat(chunks).toString('utf8');
   if(!response.ok){
    let code:unknown;try{code=(JSON.parse(body) as {error?:{code?:unknown}})?.error?.code;}catch{ /* No prose or malformed body enters diagnostics. */ }
    throw new PilotHostedResponseError(response.status,true,typeof code==='string'&&safeFailureCodes.has(code)?code:null);
   }
   return JSON.parse(body) as unknown;
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 };
}
