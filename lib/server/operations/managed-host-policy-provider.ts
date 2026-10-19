import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {inspectWorkHostDenyPolicy} from './work-host-deny-policy';
const automationRegistries=new WeakMap<object,{registry:unknown;measuredAt:number}>();
const scopeSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),token:z.string().min(1).max(8192),approvedHosts:z.array(z.string()).min(1).max(16)});
/** Fixed, read-only control-plane transport. This is policy metadata, not proof
 * of valid protection bypass credentials or closure of any HTTP hostname. */
export async function readManagedHostPolicy(raw:z.infer<typeof scopeSchema>,signal:AbortSignal){
 const startedAt=Date.now(),scope=scopeSchema.parse(raw),headers=new Headers({authorization:'Bearer '+scope.token,'x-vercel-project-id':scope.projectId,'x-vercel-team-id':scope.teamId});
 const query=new URLSearchParams({projectId:scope.projectId,teamId:scope.teamId});
 async function read(path:string){
  signal.throwIfAborted();const response=await fetch('https://api.vercel.com'+path,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Managed host-policy response unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('Managed host-policy body unavailable');let bytes=0;const chunks:Uint8Array[]=[];
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1048576)throw Error('Managed host-policy body exceeds bound');chunks.push(next.value);}return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString()) as unknown};}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 }
 const project=await read('/v9/projects/'+scope.projectId+'?teamId='+scope.teamId);
 const owner=z.object({id:z.string(),accountId:z.string()}).parse(project.body);
 if(project.status!==200||owner.id!==scope.projectId||owner.accountId!==scope.teamId)throw Error('Host-policy project binding differs');
 const active=await read('/v1/security/firewall/config/active?'+query);
 if(active.status!==200)throw Error('Active host-policy unavailable');
 const policy=inspectWorkHostDenyPolicy(active.body,scope);
 // This team's actual endpoint reports feature unavailability. Retain precisely
 // that diagnostic; do not turn an arbitrary 403 into an empty bypass inventory.
 const conditional=await read('/v1/security/firewall/bypass/rules?'+query);
 const unavailable=z.strictObject({error:z.strictObject({code:z.literal('forbidden'),message:z.literal('Conditional bypass is unavailable for this team.')})});
 if(conditional.status!==403||!unavailable.safeParse(conditional.body).success)throw Error('Conditional bypass state requires supported explicit review');
 // System exceptions affect system mitigations. The deliberately narrow
 // supported state is the actual empty result, never a truncated nonempty page.
 const system=await read('/v1/security/firewall/bypass?'+query+'&limit=100');
 if(system.status!==200||!z.strictObject({result:z.array(z.unknown()).length(0)}).safeParse(system.body).success)throw Error('System bypass inventory requires supported explicit review');
 signal.throwIfAborted();const registry=(project.body as {protectionBypass?:unknown}).protectionBypass;const proof=Object.freeze({...policy,contract:'pilot-managed-host-policy-read-v1' as const,providerReadVerified:true as const,conditionalBypassFeatureUnavailable:true as const,conditionalDiagnosticDigest:recoveryDigest(conditional),systemBypassInventoryEmpty:true as const,systemBypassDigest:recoveryDigest(system),automationRegistryDigest:recoveryDigest(registry??null),httpAdmissionClosed:false as const,restorationReady:false as const});
 automationRegistries.set(proof,{registry,measuredAt:startedAt});return proof;
}
/** Secret material stays outside serialized metadata. Only the actual fresh
 * project read can supply the bounded complete current automation registry. */
export function requireManagedHostAutomationKeys(proof:Awaited<ReturnType<typeof readManagedHostPolicy>>){
 const actual=automationRegistries.get(proof),age=actual?Date.now()-actual.measuredAt:Infinity;
 if(!actual||age<0||age>300000)throw Error('Genuine fresh current automation registry required');
 const key=z.string().min(16).max(8192).regex(/^[A-Za-z0-9_-]+$/);
 const metadata=z.strictObject({scope:z.literal('automation-bypass'),isEnvVar:z.boolean(),note:z.string().max(2048),createdAt:z.number().int().nonnegative().safe(),createdBy:z.string().min(1).max(256)});
 const registry=z.record(key,metadata).parse(actual.registry),keys=Object.keys(registry);
 if(keys.length<1||keys.length>4)throw Error('Complete finite current automation key registry required');
 return Object.freeze(keys.sort());
}
