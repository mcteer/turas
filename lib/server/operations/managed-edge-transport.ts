import {Agent,request} from 'node:https';
import {checkServerIdentity,type TLSSocket} from 'node:tls';
import ipaddr from 'ipaddr.js';
import {z} from 'zod';
import {canonicalManagedHost} from './managed-alias-inventory';
const pins=new WeakMap<object,{address:string;family:4|6;measuredAt:number}>();
const responses=new WeakMap<object,{host:string;address:string;family:4|6;startedAt:number;status:number;version:string|null;authenticationRequired:boolean}>();
export type ManagedEdgePin=Readonly<{contract:'pilot-managed-edge-pin-v1';controlHost:string;measuredAt:string;projectAuthorityVerified:false}>;
const normalize=(raw:string)=>{const parsed=ipaddr.process(raw);return {address:parsed.toString(),family:(parsed.kind()==='ipv4'?4:6) as 4|6};};
/** Fresh TLS connection with no caller agent/proxy/redirect/fallback. Credential
 * headers remain buffered until certificate and connected-peer checks succeed.
 * Custom domains can use ONLY a genuine current control-derived edge pin. */
export async function managedEdgeRead(input:{host:string;headers:Readonly<Record<string,string>>;query?:string;signal:AbortSignal;pin?:ManagedEdgePin}){
 const host=canonicalManagedHost(input.host),pin=input.pin?pins.get(input.pin):undefined;
 if(host!==input.host||input.pin&&!pin||!pin&&!host.endsWith('.vercel.app'))throw Error('Genuine provider control or current edge pin required');
 if(pin&&(Date.now()<pin.measuredAt||Date.now()-pin.measuredAt>300000))throw Error('Original edge pin deadline ended');
 const query=input.query??'';if(typeof query!=='string'||query.length>17000)throw Error('Fixed bounded edge probe query required');const url=new URL('https://'+host+'/api/auth/session'+query);
 if(query&&!query.startsWith('?')||url.hostname!==host||url.pathname!=='/api/auth/session'||url.hash||[...url.searchParams.keys()].some(key=>!['x-vercel-protection-bypass','x-vercel-set-bypass-cookie'].includes(key)))throw Error('Fixed edge probe path required');
 for(const key of ['x-vercel-protection-bypass','x-vercel-set-bypass-cookie']){const values=url.searchParams.getAll(key);if(values.length>1||values.some(value=>value.length>8192||key==='x-vercel-protection-bypass'&&!/^[A-Za-z0-9_-]{16,8192}$/.test(value)||key==='x-vercel-set-bypass-cookie'&&!['true','samesitenone'].includes(value)))throw Error('Fixed bounded distinct edge probe query required');}
 const requestHeaders:Record<string,string>={};
 for(const [name,value] of Object.entries(input.headers)){if(typeof value!=='string'||!['cookie','x-vercel-protection-bypass','x-vercel-set-bypass-cookie'].includes(name)||!value||value.length>16384||/[\r\n]/.test(value))throw Error('Fixed bounded edge probe headers required');requestHeaders[name]=value;}
 const startedAt=Date.now(),signal=AbortSignal.any([input.signal,AbortSignal.timeout(10000)]);signal.throwIfAborted();
 const agent=new Agent({keepAlive:false,maxCachedSessions:0,proxyEnv:{NODE_ENV:'production'},autoSelectFamily:false});
 try{return await new Promise<{status:number;headers:Headers;body:Buffer}>((resolve,reject)=>{
  let peer:{address:string;family:4|6}|undefined,settled=false;
  const fail=()=>{if(!settled){settled=true;reject(Error('Authenticated edge transport failed'));}};
  const req=request({protocol:'https:',hostname:host,port:443,servername:host,method:'GET',path:url.pathname+url.search,headers:requestHeaders,agent,rejectUnauthorized:true,checkServerIdentity,signal,...(pin?{family:pin.family,lookup:(_hostname, _options, callback)=>callback(null,pin.address,pin.family)}:{})},response=>{
   const chunks:Buffer[]=[];let bytes=0;
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>65536){response.destroy();req.destroy();fail();}else chunks.push(Buffer.from(chunk));});
   response.on('error',fail);response.on('aborted',fail);
   response.on('end',()=>{try{
    if(settled)return;if(!peer||signal.aborted||!response.complete){fail();return;}
    const headers=new Headers();for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
    const body=Buffer.concat(chunks),status=response.statusCode??0,version=headers.get('x-turas-code-version');let authenticationRequired=false;
    try{authenticationRequired=z.object({error:z.object({code:z.literal('authentication_required')})}).safeParse(JSON.parse(body.toString())).success;}catch{/* Untrusted response body is never error prose. */}
    const result={status,headers,body};responses.set(result,{host,...peer,startedAt,status,version,authenticationRequired});settled=true;resolve(result);
   }catch{fail();}});
  });
  req.on('error',fail);
  req.once('socket',socket=>{
   const tls=socket as TLSSocket;
   tls.once('secureConnect',()=>{
    try{
     signal.throwIfAborted();if(pin&&(Date.now()<pin.measuredAt||Date.now()-pin.measuredAt>300000))throw Error('Original edge pin deadline ended');if(req.reusedSocket||!tls.authorized||!tls.remoteAddress||checkServerIdentity(host,tls.getPeerCertificate(true)))throw Error('Authenticated fresh edge peer required');
     peer=normalize(tls.remoteAddress);if(pin&&(peer.address!==pin.address||peer.family!==pin.family))throw Error('Pinned edge peer differs');
     // Do not end/write/flush before this gate: end emits credential headers.
     req.end();
    }catch{req.destroy();fail();}
   });
  });
 });}catch{throw Error('Authenticated edge transport failed');}finally{agent.destroy();}
}
/** A shared edge address proves provider transport only. Exact fresh alias and
 * project bindings remain mandatory in the final HTTP admission consumer. */
export function pinManagedControlEdge(response:Awaited<ReturnType<typeof managedEdgeRead>>,expected:{host:string;sourceCommit:string}){
 const actual=responses.get(response),age=actual?Date.now()-actual.startedAt:Infinity;
 if(!actual||age<0||age>300000||actual.host!==expected.host||!actual.host.endsWith('.vercel.app')||actual.status!==401||!actual.authenticationRequired||actual.version!==expected.sourceCommit||!/^[a-f0-9]{40}$/.test(expected.sourceCommit))throw Error('Genuine exact release provider control required');
 const proof=Object.freeze({contract:'pilot-managed-edge-pin-v1' as const,controlHost:actual.host,measuredAt:new Date(actual.startedAt).toISOString(),projectAuthorityVerified:false as const});pins.set(proof,{address:actual.address,family:actual.family,measuredAt:actual.startedAt});return proof;
}
