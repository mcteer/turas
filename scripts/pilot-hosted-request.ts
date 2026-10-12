import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';

/** A release-bound transport for fixed, authored journey paths. Callers own
 * mutation admission and original-key reconciliation; this never retries. */
export function pilotHostedRequest(input:{scope:PilotHostedScope;headers:Headers;signal:AbortSignal;transport?:typeof fetch}){
 const origin=new URL(input.scope.origin).origin,transport=input.transport??fetch;
 return async(path:string,method:'GET'|'POST',body?:unknown):Promise<unknown>=>{
  input.signal.throwIfAborted();
  const target=new URL(path,origin);
  if(!path.startsWith('/api/')||path.includes('\\')||target.origin!==origin||!target.pathname.startsWith('/api/'))throw Error('Fixed same-origin pilot API path required');
  const response=await transport(origin+path,{method,headers:input.headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});
  if(!response.ok||response.headers.get('x-turas-code-version')!==input.scope.sourceCommit||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){
   await response.body?.cancel();throw Error('Pilot API response unavailable or release differs');
  }
  const reader=response.body?.getReader();if(!reader)throw Error('Pilot API body required');
  const chunks:Uint8Array[]=[];let size=0;
  try{
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw Error('Pilot API response exceeds private bound');chunks.push(part.value);}
   return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 };
}
