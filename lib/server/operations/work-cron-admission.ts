import type {Client} from 'pg';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {verifyHostedDeployment} from '../../contracts/pilot-hosted';
import {currentRecoveryStateDigest} from './recovery-state';
import {withLockedWorkRecoveryDecision,isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
const crons=new Map([['/eve/v1/turas/watchdog','* * * * *'],['/api/internal/research-maintenance','17 3 * * *'],['/eve/v1/turas/jobs','* * * * *']]);
type Input={target:LockedWorkRecoveryInput;token:string;cronSecret:string;protectionBypass:string};
type Material={token:string;cronSecret:string;protectionBypass:string;environment:'preview'|'production';finalUsed:boolean};
const measured=new WeakMap<object,Material>();
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
async function json(response:Response,maximum:number,signal:AbortSignal){
 if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Cron measurement JSON response required');}
 const reader=response.body?.getReader();if(!reader)throw Error('Cron measurement response absent');let size=0;const parts:Uint8Array[]=[];
 try{for(;;){signal.throwIfAborted();const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>maximum)throw Error('Cron measurement byte bound exceeded');parts.push(item.value);}return JSON.parse(Buffer.concat(parts).toString()) as unknown;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function inspect(db:Client,target:LockedWorkRecoveryTarget,material:Material,parent:AbortSignal){
 if(!isWorkRecoveryDecisionClient(db)||target.deadline<=Date.now())throw Error('Genuine finite cron owner decision required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const before=await currentRecoveryStateDigest(db),signal=AbortSignal.any([parent,AbortSignal.timeout(target.deadline-Date.now())]);let metadataCalls=0,appCalls=0;
 async function api(path:string){if(++metadataCalls>4)throw Error('Cron metadata phase exhausted');const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]),response=await fetch('https://api.vercel.com'+path,{headers:{authorization:'Bearer '+material.token},method:'GET',redirect:'error',cache:'no-store',signal:bounded});if(response.status!==200){await response.body?.cancel();throw Error('Current cron platform metadata unavailable');}return json(response,1048576,bounded);}
 async function platform(){
  // Vercel schedules execute only in Production. Preview must separately consume
  // the genuine observed legacy Production pool proof; this component excludes no peer.
  if(material.environment==='preview')return recoveryDigest({target:'preview',previewSchedules:false});
  const project=z.object({id:z.string(),accountId:z.string(),targets:z.object({production:z.object({id:z.string()})}),crons:z.object({deploymentId:z.string(),definitions:z.array(z.object({host:z.string(),path:z.string(),schedule:z.string()})).length(3)})}).parse(await api('/v9/projects/'+target.projectId+'?teamId='+target.teamId));
  const deployment=await api('/v13/deployments/'+target.deploymentId+'?teamId='+target.teamId);
  verifyHostedDeployment(deployment,{projectId:target.projectId,teamId:target.teamId,deploymentId:target.deploymentId,sourceCommit:target.sourceCommit,target:'production'});
  const host=z.object({url:z.string().regex(/^[a-z0-9-]+\.vercel\.app$/)}).parse(deployment).url;
  if(project.id!==target.projectId||project.accountId!==target.teamId||project.targets.production.id!==target.deploymentId||project.crons.deploymentId!==target.deploymentId||new Set(project.crons.definitions.map(row=>row.path)).size!==3||project.crons.definitions.some(row=>row.host!==host||crons.get(row.path)!==row.schedule))throw Error('Exact current Production cron deployment required');
  return recoveryDigest({projectId:project.id,teamId:project.accountId,host,crons:project.crons,sourceCommit:target.sourceCommit});
 }
 const initial=await platform(),observations=[];
 const invalid='invalid-'+randomBytes(32).toString('base64url');if(invalid===material.cronSecret)throw Error('Distinct cron authentication control required');
 for(const [path,code] of [['/api/internal/research-maintenance','recovery_locked'],['/eve/v1/turas/jobs','unavailable']] as const){
  for(const secret of [invalid,material.cronSecret]){
   if(++appCalls>4)throw Error('Cron app phase exhausted');const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]),response=await fetch(target.origin+path,{method:'GET',headers:{authorization:'Bearer '+secret,'x-vercel-protection-bypass':material.protectionBypass},redirect:'manual',cache:'no-store',signal:bounded});
   if(response.headers.get('x-turas-code-version')!==target.sourceCommit||!response.headers.get('cache-control')?.includes('no-store')){await response.body?.cancel();throw Error('Cron serving release differs');}
   const body=z.object({error:z.object({code:z.string()})}).parse(await json(response,16384,bounded)),expectedStatus=secret===invalid?403:503,expectedCode=secret===invalid?'maintenance_denied':code;
   if(response.status!==expectedStatus||body.error.code!==expectedCode)throw Error('Actual authenticated locked cron admission unverified');observations.push({path,status:response.status,code:body.error.code});
  }
 }
 if(await platform()!==initial||await currentRecoveryStateDigest(db)!==before)throw Error('Cron platform or locked business state changed');signal.throwIfAborted();
 return {platformDigest:initial,observationDigest:recoveryDigest(observations),metadataCalls,appCalls,observedAt:new Date().toISOString()};
}
/** Actual finite scheduler authentication/denial observations. Watchdog cleanup
 * remains permitted. Native/Sandbox execution, old hosts, peer pools and paid
 * exposure require their independent final proofs. No normal work is requested. */
export async function measureWorkCronAdmission(input:Input){
 const material:Material={token:z.string().min(1).max(8192).parse(input.token),cronSecret:z.string().min(32).max(4096).parse(input.cronSecret),protectionBypass:z.string().min(16).max(8192).parse(input.protectionBypass),environment:input.target.hostedScope.target,finalUsed:false};
 const result=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>({targetDigest:targetDigest(target),...await inspect(db,target,material,input.target.signal)}));
 const proof=Object.freeze({contract:'pilot-work-cron-admission-v1' as const,...result,currentPositiveCronAdmissionClosed:true as const,legacyProductionPeerProofRequired:material.environment==='preview',watchdogCleanupStopped:false as const,allProviderIngressClosed:false as const,restorationReady:false as const});measured.set(proof,material);return proof;
}
export async function requireMeasuredWorkCronAdmission(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof measureWorkCronAdmission>>,signal:AbortSignal){
 const material=measured.get(proof),age=Date.now()-Date.parse(proof.observedAt);
 if(!material||material.finalUsed||!isWorkRecoveryDecisionClient(db)||proof.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh unused cron admission proof required');
 material.finalUsed=true;const current=await inspect(db,target,material,signal);
 if(current.platformDigest!==proof.platformDigest||current.observationDigest!==proof.observationDigest)throw Error('Measured cron admission changed');return proof;
}
