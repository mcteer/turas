import {z} from 'zod';
import {requireManagedProjectHostInventory,type readManagedProjectHostInventory} from './managed-project-host-inventory';
import {requireManagedHostAutomationKeys,type readManagedHostPolicy} from './managed-host-policy-provider';
import {managedEdgeRead,pinManagedControlEdge,type ManagedEdgePin} from './managed-edge-transport';
import {createHash} from 'node:crypto';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {canonicalManagedHost} from './managed-alias-inventory';
import {requireManagedApprovedHostBindings,type readManagedApprovedHostBindings} from './managed-approved-host-bindings';
type Bindings=Awaited<ReturnType<typeof readManagedApprovedHostBindings>>;
type Scope=Parameters<typeof readManagedApprovedHostBindings>[0];
const secrets=new WeakMap<object,{secret:string;host:string;scopeDigest:string;measuredAt:number;pin:ManagedEdgePin}>();
/** A protection challenge is an actual fixed-provider redirect whose return URL
 * is this exact requested host/path. It is recorded only as a challenge. */
export function isManagedProtectionChallenge(status:number,location:string|null,requested:string){
 if(![302,303,307,308].includes(status)||!location)return false;
 try{const target=new URL(location),back=new URL(target.searchParams.get('url')??'');return target.origin==='https://vercel.com'&&target.pathname==='/sso-api'&&!target.username&&!target.password&&!target.hash&&target.searchParams.getAll('url').length===1&&back.href===requested;}catch{return false;}
}
/** Actual negative and positive controls on a provider-bound protected host.
 * The mandatory admission hook runs before EVERY request; the final owner must
 * supply its persistent finite request journal. No automatic retries occur. */
export async function verifyManagedProtectionControls(input:{bindings:Bindings;scope:Scope;host:string;secret:string;signal:AbortSignal;admit:(kind:string,host:string)=>Promise<string>;observe:(kind:string,record:{intentId:string;host:string;status:number;codeVersion:string|null;bodyDigest:string;bodyBytes:number;redirectObserved:boolean;edgeDenied:boolean})=>Promise<void>}){
 const bindings=requireManagedApprovedHostBindings(input.bindings,input.scope),host=canonicalManagedHost(input.host),bound=bindings.rows.find(row=>row.host===host);
 const secret=z.string().min(16).max(8192).regex(/^[A-Za-z0-9_-]+$/).parse(input.secret);
 if(!bound||host!==input.host||(!host.endsWith('.vercel.app')||host!==bound.immutableHost))throw Error('Actual approved immutable provider control host required');
 const seenIntentIds=new Set<string>(),captures:unknown[]=[];
 const original='https://'+host+'/api/auth/session';let pin:ManagedEdgePin|undefined;
 async function request(kind:string,headers:Record<string,string>={},query=''){
  input.signal.throwIfAborted();const intentId=z.uuid().parse(await input.admit(kind,host));if(seenIntentIds.has(intentId))throw Error('Distinct persistent request intent required');seenIntentIds.add(intentId);input.signal.throwIfAborted();
  const response=await managedEdgeRead({host,headers,query,signal:input.signal,pin}),version=response.headers.get('x-turas-code-version');
  const capture={intentId,host,kind,status:response.status,codeVersion:version&&/^[a-f0-9]{40}$/.test(version)?version:null,bodyDigest:createHash('sha256').update(response.body).digest('hex'),bodyBytes:response.body.length,redirectObserved:response.headers.has('location'),edgeDenied:response.headers.get('x-vercel-mitigated')==='deny'};await input.observe(kind,capture);captures.push(capture);return response;
 }
 function application(response:Awaited<ReturnType<typeof request>>){
  if(response.status!==401||response.headers.get('x-turas-code-version')!==bound!.sourceCommit||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||response.headers.has('location'))throw Error('Protection bypass did not reach the exact unauthenticated application boundary');
  let body:unknown;try{body=JSON.parse(response.body.toString());}catch{throw Error('Protection control application body invalid');}
  z.object({error:z.object({code:z.literal('authentication_required')})}).parse(body);
 }
 const negative=await request('protection-negative');if(!isManagedProtectionChallenge(negative.status,negative.headers.get('location'),original)||negative.headers.has('x-turas-code-version'))throw Error('Current control host does not prove active deployment protection');
 const header=await request('protection-header',{'x-vercel-protection-bypass':secret});application(header);pin=pinManagedControlEdge(header,{host,sourceCommit:bound.sourceCommit});
 application(await request('protection-query',{},'?x-vercel-protection-bypass='+encodeURIComponent(secret)));
 const issued=await request('protection-cookie-issue',{'x-vercel-protection-bypass':secret,'x-vercel-set-bypass-cookie':'true'});
 const pair=issuedManagedProtectionCookie(issued,host);
 application(await request('protection-cookie',{cookie:pair}));
 input.signal.throwIfAborted();requireManagedApprovedHostBindings(bindings,input.scope);
 const proof=Object.freeze({contract:'pilot-managed-protection-controls-v1' as const,projectId:bindings.projectId,teamId:bindings.teamId,bindingsDigest:bindings.bindingsDigest,host,deploymentId:bound.deploymentId,sourceCommit:bound.sourceCommit,secretDigest:recoveryDigest(secret),forms:Object.freeze(['header','query','issued-cookie'] as const),requests:5,requestCaptureDigest:recoveryDigest(captures),measuredAt:new Date().toISOString(),validCurrentProtectionFormsVerified:true as const,oldHostHttpAdmissionClosed:false as const,restorationReady:false as const});
 secrets.set(proof,{secret,host,pin,scopeDigest:recoveryDigest({...input.scope,token:undefined}),measuredAt:Date.now()});return proof;
}

function issuedManagedProtectionCookie(issued:{status:number;headers:Headers},host:string){
 const original='https://'+host+'/api/auth/session';
 const location=issued.headers.get('location');let sameReturn=false;try{sameReturn=!!location&&new URL(location,original).href===original;}catch{/* Reject malformed or foreign redirects. */}
 if(![302,303,307,308].includes(issued.status)||!sameReturn)throw Error('Protection cookie bootstrap redirect differs');
 const cookies=issued.headers.getSetCookie().filter(cookie=>cookie.startsWith('_vercel_jwt='));if(cookies.length!==1)throw Error('Exactly one issued protection cookie required');
 const parts=cookies[0].split(';').map(part=>part.trim()),pair=parts.shift()!;if(!/^_vercel_jwt=[A-Za-z0-9_.-]{16,8192}$/.test(pair)||!parts.some(part=>/^secure$/i.test(part))||!parts.some(part=>/^httponly$/i.test(part))||parts.some(part=>/^domain=/i.test(part)&&part.slice(7).toLowerCase()!==host)||!parts.some(part=>/^path=\/$/i.test(part)))throw Error('Protection cookie scope differs');
 return pair;
}

type ProtectionProof=Awaited<ReturnType<typeof verifyManagedProtectionControls>>;
type Policy=Awaited<ReturnType<typeof readManagedHostPolicy>>;
type HostInventory=Awaited<ReturnType<typeof readManagedProjectHostInventory>>;
type Hooks=Pick<Parameters<typeof verifyManagedProtectionControls>[0],'admit'|'observe'>;
const censuses=new WeakMap<object,{startedAt:number;finishedAt:number;processStart:number;processFinish:number;scopeDigest:string}>();
/** Current post-protection census, distinct from the failed historical strict
 * census. Every current automation key/form is exercised on every excluded host.
 * Custom DNS never receives credentials: all probes use a verified edge pin.
 * The owner still must compose cron, Workflow, effects, service and final reads. */
export async function measureManagedOldHostCensus(input:Hooks&{scope:Scope;bindings:Bindings;policy:Policy;inventory:HostInventory;controls:readonly ProtectionProof[];maximumRequests:number;signal:AbortSignal}){
 const startedAt=Date.now(),processStart=performance.now(),scopeDigest=recoveryDigest({...input.scope,token:undefined}),controller=new AbortController(),signal=AbortSignal.any([input.signal,controller.signal,AbortSignal.timeout(300000)]);
 const bindings=requireManagedApprovedHostBindings(input.bindings,input.scope),inventory=requireManagedProjectHostInventory(input.inventory,input.scope),keys=requireManagedHostAutomationKeys(input.policy);
 if(input.policy.projectId!==bindings.projectId||input.policy.teamId!==bindings.teamId||recoveryDigest(input.policy.allowedHosts)!==recoveryDigest([...input.scope.approvedHosts].sort()))throw Error('Current exact host-deny policy required');
 for(const row of bindings.rows)if(!inventory.rows.some(host=>host.host===row.host&&host.deploymentId===row.deploymentId))throw Error('Approved host missing from complete project inventory');
 const credentials=input.controls.map(proof=>{
  const actual=secrets.get(proof),age=actual?Date.now()-actual.measuredAt:Infinity;
  if(!actual||age<0||age>300000||actual.scopeDigest!==scopeDigest||proof.bindingsDigest!==bindings.bindingsDigest||!keys.includes(actual.secret))throw Error('Genuine current exact protection controls required');return {...actual,secretDigest:proof.secretDigest};
 });
 if(credentials.length!==keys.length||new Set(credentials.map(row=>row.secret)).size!==keys.length)throw Error('Complete current automation key controls required');
 credentials.sort((a,b)=>a.secretDigest.localeCompare(b.secretDigest,'en'));
 const allowed=new Set(bindings.rows.map(row=>row.host)),hosts=inventory.rows.filter(row=>!allowed.has(row.host));
 const maximum=z.number().int().min(0).max(12000).parse(input.maximumRequests),expected=hosts.length*(1+4*keys.length);
 if(expected>maximum)throw Error('Complete old-host census exceeds original finite request allowance');
 let requests=0,index=0;const seenIntentIds=new Set<string>(),captures:unknown[]=[];const rows:Array<{host:string;deploymentId:string;ordinary:'edge-deny'|'protection-challenge';credentials:Array<{secretDigest:string;forms:readonly string[]}>}>=[];
 async function request(host:string,kind:string,credential:typeof credentials[number],headers:Record<string,string>={},query=''){
  signal.throwIfAborted();if(requests>=maximum)throw Error('Original finite old-host request allowance ended');requests++;
  const intentId=z.uuid().parse(await input.admit(kind,host));if(seenIntentIds.has(intentId))throw Error('Distinct persistent request intent required');seenIntentIds.add(intentId);signal.throwIfAborted();const response=await managedEdgeRead({host,headers,query,signal,pin:credential.pin}),version=response.headers.get('x-turas-code-version');
  const capture={intentId,host,kind,status:response.status,codeVersion:version&&/^[a-f0-9]{40}$/.test(version)?version:null,bodyDigest:createHash('sha256').update(response.body).digest('hex'),bodyBytes:response.body.length,redirectObserved:response.headers.has('location'),edgeDenied:response.headers.get('x-vercel-mitigated')==='deny'};await input.observe(kind,capture);captures.push(capture);return response;
 }
 function denied(response:Awaited<ReturnType<typeof request>>){return response.status===403&&response.headers.get('x-vercel-mitigated')==='deny'&&!response.headers.has('location')&&!response.headers.has('x-turas-code-version');}
 async function worker(){
  try{for(;;){signal.throwIfAborted();const row=hosts[index++];if(!row)return;
   const ordinary=await request(row.host,'old-host-ordinary',credentials[0]);
   const classification=denied(ordinary)?'edge-deny':isManagedProtectionChallenge(ordinary.status,ordinary.headers.get('location'),'https://'+row.host+'/api/auth/session')&&!ordinary.headers.has('x-turas-code-version')?'protection-challenge':null;
   if(!classification)throw Error('Old ordinary host reached an unapproved boundary');
   const checked=[];
   for(const credential of credentials){
    if(!denied(await request(row.host,'old-host-header',credential,{'x-vercel-protection-bypass':credential.secret})))throw Error('Old header host not explicitly edge denied');
    if(!denied(await request(row.host,'old-host-query',credential,{},'?x-vercel-protection-bypass='+encodeURIComponent(credential.secret))))throw Error('Old query host not explicitly edge denied');
    const issued=await request(row.host,'old-host-cookie-issue',credential,{'x-vercel-protection-bypass':credential.secret,'x-vercel-set-bypass-cookie':'true'}),cookie=issuedManagedProtectionCookie(issued,row.host);
    if(!denied(await request(row.host,'old-host-cookie',credential,{cookie})))throw Error('Old issued-cookie host not explicitly edge denied');
    checked.push({secretDigest:credential.secretDigest,forms:Object.freeze(['header','query','issued-cookie'])});
   }
   rows.push({host:row.host,deploymentId:row.deploymentId,ordinary:classification,credentials:checked});
  }}catch{controller.abort(Error('Old-host census incomplete'));throw Error('Old-host census incomplete; request intents and observations must be retained');}
 }
 const results=await Promise.allSettled(Array.from({length:Math.min(8,hosts.length)},worker));
 if(results.some(result=>result.status==='rejected'))throw Error('Old-host census failed; no HTTP closure proof issued');
 signal.throwIfAborted();requireManagedApprovedHostBindings(bindings,input.scope);requireManagedProjectHostInventory(inventory,input.scope);requireManagedHostAutomationKeys(input.policy);
 if(rows.length!==hosts.length||requests!==expected)throw Error('Complete exact old-host HTTP coverage required');
 rows.sort((a,b)=>a.host.localeCompare(b.host,'en'));
 const proof=Object.freeze({contract:'pilot-managed-old-host-post-protection-census-v1' as const,projectId:bindings.projectId,teamId:bindings.teamId,bindingsDigest:bindings.bindingsDigest,policyDigest:input.policy.policyDigest,automationRegistryDigest:input.policy.automationRegistryDigest,hostInventoryDigest:inventory.inventoryDigest,rows:Object.freeze(rows.map(row=>Object.freeze({...row,credentials:Object.freeze(row.credentials.map(credential=>Object.freeze(credential)))}))),censusDigest:recoveryDigest(rows),requestCaptureDigest:recoveryDigest(captures),requests,oldHosts:hosts.length,currentPostProtectionHttpCensusVerified:true as const,historicalStrictCensusReclassified:false as const,cronAdmissionClosed:false as const,workflowClosureVerified:false as const,restorationReady:false as const,measuredAt:new Date(startedAt).toISOString()});
 if(Date.now()<startedAt||Date.now()-startedAt>300000)throw Error('Original old-host census deadline ended');censuses.set(proof,{startedAt,finishedAt:Date.now(),processStart,processFinish:performance.now(),scopeDigest});return proof;
}

/** Require a distinct sequential repeat and actual metadata reads started AFTER
 * its last response. Reusing an initial policy/alias receipt is insufficient. */
export function requireRepeatedManagedOldHostCensus(input:{previous:Awaited<ReturnType<typeof measureManagedOldHostCensus>>;current:Awaited<ReturnType<typeof measureManagedOldHostCensus>>;scope:Scope;bindings:Bindings;policy:Policy;inventory:HostInventory}){
 const scopeDigest=recoveryDigest({...input.scope,token:undefined}),first=censuses.get(input.previous),current=censuses.get(input.current);
 for(const actual of [first,current]){const age=actual?Date.now()-actual.startedAt:Infinity;if(!actual||age<0||age>300000||actual.scopeDigest!==scopeDigest)throw Error('Genuine fresh exact repeated old-host census required');}
 if(input.previous===input.current||!first||!current||current.processStart<first.processFinish)throw Error('Distinct sequential old-host HTTP repeat required');
 const bindings=requireManagedApprovedHostBindings(input.bindings,input.scope),inventory=requireManagedProjectHostInventory(input.inventory,input.scope);requireManagedHostAutomationKeys(input.policy);
 for(const proof of [bindings,inventory,input.policy])if(!Number.isFinite(proof.processObservationStart)||proof.processObservationStart<current.processFinish)throw Error('Actual metadata reread after final HTTP census required');
 for(const proof of [input.previous,input.current])if(proof.bindingsDigest!==bindings.bindingsDigest||proof.policyDigest!==input.policy.policyDigest||proof.automationRegistryDigest!==input.policy.automationRegistryDigest||proof.hostInventoryDigest!==inventory.inventoryDigest||proof.censusDigest!==input.current.censusDigest)throw Error('Current host policy bindings or HTTP census changed');
 return input.current;
}
