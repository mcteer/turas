import {createHash} from 'node:crypto';
import {z} from 'zod';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const need=(value:unknown)=>{if(!value)throw Error('Bounded ordinary recovery transport required');};
/** Transport only: this class grants no recovery/readiness authority. The
 * producer supplies a real DB lookup for exact newly created SDK identities. */
export class RecoveryServiceTransport {
 #sessions=new Set<string>();#requests=new Map<string,string>();#ordinary=0;#cleanup=0;#cleanupDeadline:number|undefined;#unknownLogin=false;
 #oldSessions:Set<string>;#oldConnections:Set<string>;
 constructor(private readonly input:{origin:string;signal:AbortSignal;oldSessionHashes:readonly string[];oldConnectionIds:readonly string[];createdConnection:(input:{connectionId:string;cookieHash:string;requestKeys:readonly string[]})=>Promise<boolean>}){
  const url=new URL(input.origin);need(['https:','http:'].includes(url.protocol)&&url.href===url.origin+'/');
  this.#oldSessions=new Set(input.oldSessionHashes);this.#oldConnections=new Set(input.oldConnectionIds);
 }
 snapshot(){return Object.freeze({sessionHashes:Object.freeze([...this.#sessions]),createRequests:Object.freeze([...this.#requests].map(row=>Object.freeze(row))),ordinaryRequests:this.#ordinary,cleanupRequests:this.#cleanup,unknownLoginAcknowledgement:this.#unknownLogin});}
 #cookie(headers:Headers){const token=/(?:^|;\s*)__Host-turas_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.get('cookie')??'')?.[1];return token?hash(token):undefined;}
 async #exactCleanup(url:URL,method:string,headers:Headers){
  const cookie=this.#cookie(headers);if(!cookie||!this.#sessions.has(cookie))return false;
  if(url.pathname==='/api/auth/logout'&&method==='POST'||url.pathname==='/api/auth/session'&&method==='GET')return true;
  const lookup=/^\/api\/mcp\/connections\/requests\/([a-f0-9-]{36})$/.exec(url.pathname);if(lookup&&method==='GET')return this.#requests.get(lookup[1])===cookie;
  const revoke=/^\/api\/mcp\/connections\/([a-f0-9-]{36})\/revoke$/.exec(url.pathname);if(!revoke||method!=='POST'||this.#oldConnections.has(revoke[1]))return false;
  const requestKeys=[...this.#requests].filter(([,owner])=>owner===cookie).map(([key])=>key);if(!requestKeys.length)return false;
  return this.input.createdConnection({connectionId:revoke[1],cookieHash:cookie,requestKeys});
 }
 readonly fetch:typeof fetch=async(resource,init)=>{
  const url=new URL(typeof resource==='string'?resource:resource instanceof URL?resource.href:resource.url),method=init?.method??(resource instanceof Request?resource.method:'GET'),headers=new Headers(init?.headers??(resource instanceof Request?resource.headers:undefined));
  need(url.origin===new URL(this.input.origin).origin&&url.pathname.startsWith('/api/')&&!url.hash&&(['GET','HEAD'].includes(method)||method==='POST'&&(/^\/api\/auth\/(login|logout)$/.test(url.pathname)||url.pathname==='/api/mcp/v1'||url.pathname==='/api/mcp/connections'||/^\/api\/mcp\/connections\/[a-f0-9-]{36}\/revoke$/.test(url.pathname))));
  if(this.input.signal.aborted||this.#ordinary>=512||init?.signal?.aborted)this.#cleanupDeadline??=Date.now()+30000;
  const cleanup=await this.#exactCleanup(url,method,headers),independent=cleanup&&(this.input.signal.aborted||this.#ordinary>=512||init?.signal?.aborted);
  let requestSignal=init?.signal??(resource instanceof Request?resource.signal:undefined);need(requestSignal);
  // The original helpers deliberately supply independent cleanup signals. Do
  // not reattach the cancelled parent or spend an exhausted ordinary allowance.
  if(independent){need(this.#cleanup<32&&Date.now()<this.#cleanupDeadline!);this.#cleanup++;requestSignal=AbortSignal.timeout(Math.min(5000,this.#cleanupDeadline!-Date.now()));}
  else{if(!cleanup)this.input.signal.throwIfAborted();need(this.#ordinary<512);this.#ordinary++;}
  if(url.pathname==='/api/mcp/connections'&&method==='POST'){
   const key=z.object({requestKey:z.uuid()}).parse(typeof init?.body==='string'?JSON.parse(init.body):null).requestKey,cookie=this.#cookie(headers);need(cookie&&this.#sessions.has(cookie)&&this.#requests.size<3&&!this.#requests.has(key));this.#requests.set(key,cookie!);
  }
  try{
   const response=await fetch(resource,{...init,redirect:'error',cache:'no-store',signal:requestSignal});
   if(url.pathname==='/api/auth/login'&&response.status===200){const cookies=response.headers.getSetCookie().filter(value=>value.startsWith('__Host-turas_session='));need(cookies.length===1);const token=/^__Host-turas_session=([A-Za-z0-9_-]{43});/.exec(cookies[0])?.[1];need(token&&!this.#oldSessions.has(hash(token))&&this.#sessions.size<3);this.#sessions.add(hash(token!));}
   return response;
  }catch(error){if(url.pathname==='/api/auth/login'&&method==='POST')this.#unknownLogin=true;throw error;}
 };
}
