import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {canonicalManagedHost} from './managed-alias-inventory';
const id=z.string().regex(/^dpl_[A-Za-z0-9]+$/),commit=z.string().regex(/^[a-f0-9]{40}$/);
const scopeSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),token:z.string().min(1).max(8192),target:z.enum(['preview','production']),deploymentId:id,sourceCommit:commit,approvedHosts:z.array(z.string()).min(1).max(16)});
const projectSchema=z.object({id:z.string(),accountId:z.string(),targets:z.object({production:z.object({id})})});
const deploymentSchema=z.object({id,projectId:z.string(),ownerId:z.string(),readyState:z.literal('READY'),target:z.enum(['production']).nullable(),meta:z.object({githubCommitSha:commit.optional()}).optional(),gitSource:z.object({sha:commit.optional()}).optional()});
/** Fixed actual control-plane lookups. Only the selected recovery deployment and
 * the project's current Production baseline may receive allowed-host status.
 * This component alone never sends protection credentials to application hosts. */
export async function readManagedApprovedHostBindings(raw:z.infer<typeof scopeSchema>,signal:AbortSignal){
 const scope=scopeSchema.parse(raw),hosts=scope.approvedHosts.map(canonicalManagedHost);
 if(new Set(hosts).size!==hosts.length||hosts.some((host,index)=>host!==scope.approvedHosts[index]))throw Error('Exact distinct approved host names required');
 async function read(path:string){
  signal.throwIfAborted();const response=await fetch('https://api.vercel.com'+path,{method:'GET',headers:{authorization:'Bearer '+scope.token,'x-vercel-project-id':scope.projectId,'x-vercel-team-id':scope.teamId},redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Approved host metadata unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('Approved host metadata body unavailable');const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1048576)throw Error('Approved host metadata exceeds bound');chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString()) as unknown;}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 }
 const projectPath='/v9/projects/'+scope.projectId+'?teamId='+scope.teamId;
 const project=projectSchema.parse(await read(projectPath));
 if(project.id!==scope.projectId||project.accountId!==scope.teamId||scope.target==='production'&&project.targets.production.id!==scope.deploymentId)throw Error('Current Production baseline or project differs');
 const productionId=project.targets.production.id;
 async function deployment(identity:string){
  const row=deploymentSchema.parse(await read('/v13/deployments/'+encodeURIComponent(identity)+'?teamId='+scope.teamId+'&withGitRepoInfo=true'));
  const commits=[row.meta?.githubCommitSha,row.gitSource?.sha].filter((value):value is string=>value!==undefined);
  if(row.projectId!==scope.projectId||row.ownerId!==scope.teamId||!commits.length||commits.some(value=>value!==commits[0]))throw Error('Exact approved-host deployment source required');
  if(row.id!==scope.deploymentId&&row.id!==productionId||row.id===productionId&&row.target!=='production'||row.id===scope.deploymentId&&(commits[0]!==scope.sourceCommit||(scope.target==='production'?row.target!=='production':row.target!==null)))throw Error('Approved host resolves outside current allowed deployments');
  return {deploymentId:row.id,sourceCommit:commits[0],target:row.target};
 }
 const selected=await deployment(scope.deploymentId);if(selected.deploymentId!==scope.deploymentId)throw Error('Selected deployment lookup differs');
 const baseline=await deployment(productionId);if(baseline.deploymentId!==productionId)throw Error('Production deployment lookup differs');
 if(selected.deploymentId===baseline.deploymentId&&recoveryDigest(selected)!==recoveryDigest(baseline))throw Error('Selected Production metadata changed');
 const expected=new Map([[selected.deploymentId,selected],[baseline.deploymentId,baseline]]);
 const rows=[];
 for(const host of [...hosts].sort()){const bound=await deployment(host);if(recoveryDigest(bound)!==recoveryDigest(expected.get(bound.deploymentId)))throw Error('Approved host deployment metadata changed');rows.push({host,...bound});}
 if(!rows.some(row=>row.deploymentId===scope.deploymentId))throw Error('Selected recovery deployment has no approved host');
 const after=projectSchema.parse(await read(projectPath));if(recoveryDigest(after)!==recoveryDigest(project))throw Error('Current project Production binding changed');
 signal.throwIfAborted();return Object.freeze({contract:'pilot-managed-approved-host-bindings-v1' as const,projectId:scope.projectId,teamId:scope.teamId,productionDeploymentId:productionId,selectedDeploymentId:scope.deploymentId,rows:Object.freeze(rows.map(row=>Object.freeze(row))),bindingsDigest:recoveryDigest(rows),providerReadVerified:true as const,protectionCredentialsVerified:false as const,httpAdmissionClosed:false as const,restorationReady:false as const});
}
