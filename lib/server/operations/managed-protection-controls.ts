import {z} from 'zod';
import {createHash} from 'node:crypto';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {canonicalManagedHost} from './managed-alias-inventory';
import {requireManagedApprovedHostBindings,type readManagedApprovedHostBindings} from './managed-approved-host-bindings';
type Bindings=Awaited<ReturnType<typeof readManagedApprovedHostBindings>>;
type Scope=Parameters<typeof readManagedApprovedHostBindings>[0];
const secrets=new WeakMap<object,{secret:string;host:string;scopeDigest:string;measuredAt:number}>();
/** A protection challenge is an actual fixed-provider redirect whose return URL
 * is this exact requested host/path. It is recorded only as a challenge. */
export function isManagedProtectionChallenge(status:number,location:string|null,requested:string){
 if(![302,303,307,308].includes(status)||!location)return false;
 try{const target=new URL(location),back=new URL(target.searchParams.get('url')??'');return target.origin==='https://vercel.com'&&target.pathname==='/sso-api'&&!target.username&&!target.password&&!target.hash&&target.searchParams.getAll('url').length===1&&back.href===requested;}catch{return false;}
}
/** Actual negative and positive controls on a provider-bound protected host.
 * The mandatory admission hook runs before EVERY request; the final owner must
 * supply its persistent finite request journal. No automatic retries occur. */
export async function verifyManagedProtectionControls(input:{bindings:Bindings;scope:Scope;host:string;secret:string;signal:AbortSignal;admit:(kind:string,host:string)=>Promise<void>;observe:(kind:string,record:{status:number;codeVersion:string|null;bodyDigest:string;bodyBytes:number;redirectObserved:boolean;edgeDenied:boolean})=>Promise<void>}){
 const bindings=requireManagedApprovedHostBindings(input.bindings,input.scope),host=canonicalManagedHost(input.host),bound=bindings.rows.find(row=>row.host===host);
 const secret=z.string().min(16).max(8192).regex(/^[A-Za-z0-9_-]+$/).parse(input.secret);
 if(!bound||host!==input.host)throw Error('Actual approved control host required');
 const original='https://'+host+'/api/auth/session';
 async function request(kind:string,headers:Record<string,string>={},query=''){
  input.signal.throwIfAborted();await input.admit(kind,host);input.signal.throwIfAborted();let response:Response;
  try{response=await fetch(original+query,{method:'GET',headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});}catch{throw Error('Protection control transport failed');}
  const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>65536)throw Error('Protection control response exceeds bound');chunks.push(next.value);}const body=Buffer.concat(chunks),version=response.headers.get('x-turas-code-version');await input.observe(kind,{status:response.status,codeVersion:version&&/^[a-f0-9]{40}$/.test(version)?version:null,bodyDigest:createHash('sha256').update(body).digest('hex'),bodyBytes:body.length,redirectObserved:response.headers.has('location'),edgeDenied:response.headers.get('x-vercel-mitigated')==='deny'});return {status:response.status,headers:response.headers,body};}finally{if(reader){await reader.cancel().catch(()=>undefined);reader.releaseLock();}}
 }
 function application(response:Awaited<ReturnType<typeof request>>){
  if(response.status!==401||response.headers.get('x-turas-code-version')!==bound!.sourceCommit||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||response.headers.has('location'))throw Error('Protection bypass did not reach the exact unauthenticated application boundary');
  let body:unknown;try{body=JSON.parse(response.body.toString());}catch{throw Error('Protection control application body invalid');}
  z.object({error:z.object({code:z.literal('authentication_required')})}).parse(body);
 }
 const negative=await request('protection-negative');if(!isManagedProtectionChallenge(negative.status,negative.headers.get('location'),original)||negative.headers.has('x-turas-code-version'))throw Error('Current control host does not prove active deployment protection');
 application(await request('protection-header',{'x-vercel-protection-bypass':secret}));
 application(await request('protection-query',{},'?x-vercel-protection-bypass='+encodeURIComponent(secret)));
 const issued=await request('protection-cookie-issue',{'x-vercel-protection-bypass':secret,'x-vercel-set-bypass-cookie':'true'});
 const location=issued.headers.get('location');let sameReturn=false;try{sameReturn=!!location&&new URL(location,original).href===original;}catch{/* Reject malformed or foreign redirects. */}
 if(![302,303,307,308].includes(issued.status)||!sameReturn)throw Error('Protection cookie bootstrap redirect differs');
 const cookies=issued.headers.getSetCookie().filter(cookie=>cookie.startsWith('_vercel_jwt='));if(cookies.length!==1)throw Error('Exactly one issued protection cookie required');
 const parts=cookies[0].split(';').map(part=>part.trim()),pair=parts.shift()!;if(!/^_vercel_jwt=[A-Za-z0-9_.-]{16,8192}$/.test(pair)||!parts.some(part=>/^secure$/i.test(part))||!parts.some(part=>/^httponly$/i.test(part))||parts.some(part=>/^domain=/i.test(part)&&part.slice(7).toLowerCase()!==host)||!parts.some(part=>/^path=\/$/i.test(part)))throw Error('Protection cookie scope differs');
 application(await request('protection-cookie',{cookie:pair}));
 input.signal.throwIfAborted();requireManagedApprovedHostBindings(bindings,input.scope);
 const proof=Object.freeze({contract:'pilot-managed-protection-controls-v1' as const,projectId:bindings.projectId,teamId:bindings.teamId,bindingsDigest:bindings.bindingsDigest,host,deploymentId:bound.deploymentId,sourceCommit:bound.sourceCommit,secretDigest:recoveryDigest(secret),forms:Object.freeze(['header','query','issued-cookie'] as const),requests:5,measuredAt:new Date().toISOString(),validCurrentProtectionFormsVerified:true as const,oldHostHttpAdmissionClosed:false as const,restorationReady:false as const});
 secrets.set(proof,{secret,host,scopeDigest:recoveryDigest({...input.scope,token:undefined}),measuredAt:Date.now()});return proof;
}
