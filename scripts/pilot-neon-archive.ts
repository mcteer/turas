import {WORK_BACKUP_LIMITS} from '../lib/server/operations/work-backup-limits';
import {Client} from 'pg';
import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,basename,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pilotCaptureCandidateSchema,workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {verifyRecoveryCandidate} from '../lib/server/operations/candidate-verification';
import {putNeonEncryptedArchive,verifyNeonEncryptedArchive,expireNeonManagedArchives,type NeonArchiveScope} from '../lib/server/operations/neon-archive';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {copyWorkCapture} from '../lib/server/operations/work-capture-copy';
const execute=promisify(execFile);
const legacyNeonArchiveDestinationSchema=z.strictObject({
 contract:z.literal('pilot-neon-operator-config-v1'),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),
 operatorProject:z.string().regex(/^[a-z0-9][a-z0-9-]{1,99}$/),operatorProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),
 sourceProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),resourceId:z.string().min(1).max(256),resourceName:z.string().regex(/^[a-z0-9][a-z0-9-]{1,99}$/),
 neonProjectId:z.string().min(1).max(256),installationId:z.uuid(),maximumBytes:z.number().int().min(1048576).max(419430400),
 databaseUrl:z.string().max(4096).refine(raw=>{try{const url=new URL(raw);return ['postgres:','postgresql:'].includes(url.protocol)&&url.hostname.endsWith('.neon.tech')&&url.searchParams.get('sslmode')==='verify-full';}catch{return false;}},'Explicit Neon verify-full connection required'),
});
/** Plan identity is not pricing, spending authority or settlement. Preserve the
 * original Free-only contract; an explicit v2 can bind an existing Launch plan. V3 explicitly opts into
 * expanded retained capacity on an already owned Launch resource. */
export const neonArchiveDestinationSchema=z.discriminatedUnion('contract',[
 legacyNeonArchiveDestinationSchema,
 legacyNeonArchiveDestinationSchema.extend({contract:z.literal('pilot-neon-operator-config-v2'),billingPlanId:z.enum(['free_v3','launch_v3'])}),
 legacyNeonArchiveDestinationSchema.extend({contract:z.literal('pilot-neon-operator-config-v3'),billingPlanId:z.literal('launch_v3'),maximumBytes:z.number().int().min(1048576).max(WORK_BACKUP_LIMITS.maximumRetainedBytes)}),
]).refine(value=>value.sourceProjectId!==value.operatorProjectId,'Separate operator project required');
type Destination=z.infer<typeof neonArchiveDestinationSchema>;
async function platform(args:string[],signal:AbortSignal){
 const result=await execute('vercel',args,{signal,timeout:30000,maxBuffer:1048576,env:{NODE_ENV:process.env.NODE_ENV??'production',...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))}});
 return JSON.parse(result.stdout) as any;
}
export async function verifyWorkNeonDestination(destination:Destination,signal:AbortSignal,read:typeof platform=platform){
 destination=neonArchiveDestinationSchema.parse(destination);
 const expectedPlan=destination.contract==='pilot-neon-operator-config-v1'?'free_v3':destination.billingPlanId;
 const teams=await read(['api','/v2/teams','--raw'],signal),team=teams.teams?.find((team:any)=>team.id===destination.teamId);
 if(!team?.slug)throw Error('Current work team access unavailable');
 const project=await read(['api','/v9/projects/'+destination.operatorProjectId+'?teamId='+destination.teamId,'--raw'],signal);
 if(project.id!==destination.operatorProjectId||project.name!==destination.operatorProject||project.accountId!==destination.teamId||project.link)throw Error('Exact separate unlinked operator project required');
 const inspected=await read(['integration-resource','inspect',destination.resourceName,'--json','--scope',team.slug],signal),resource=inspected.resource;
 if(resource?.id!==destination.resourceId||resource.ownership!=='owned'||resource.status!=='available'||resource.billingPlan?.id!==expectedPlan||resource.projects?.length!==1||resource.projects[0].id!==project.id)throw Error('Exact separate work Neon resource and billing plan required');
 const envs=await read(['api','/v9/projects/'+project.id+'/env?teamId='+destination.teamId,'--raw'],signal);
 const idVariable=envs.envs?.find((row:any)=>row.key==='TURAS_ARCHIVE_NEON_PROJECT_ID'&&row.contentHint?.storeId===destination.resourceId);
 const connectionVariable=envs.envs?.find((row:any)=>row.key==='TURAS_ARCHIVE_DATABASE_URL_UNPOOLED'&&row.contentHint?.storeId===destination.resourceId);
 if(!idVariable?.id||!connectionVariable?.id)throw Error('Exact resource credential bindings unavailable');
 for(const [variable,expected] of [[idVariable,destination.neonProjectId],[connectionVariable,destination.databaseUrl]] as const){
  const value=await read(['api','/v1/projects/'+project.id+'/env/'+variable.id+'?teamId='+destination.teamId,'--raw'],signal);
  if(value.decrypted!==true||typeof value.value!=='string')throw Error('Current resource binding unavailable');
  if(variable===connectionVariable){const current=new URL(value.value);current.searchParams.set('sslmode','verify-full');if(current.href!==expected)throw Error('Current archive connection differs');}
  else if(value.value!==expected)throw Error('Current Neon project differs');
 }
 return {teamId:destination.teamId,operatorProjectId:project.id,resourceId:resource.id,neonProjectId:destination.neonProjectId,plan:expectedPlan,primaryApplicationConnected:false};
}
/** Authenticate an explicitly selected candidate before copying ciphertext.
 * Copy verification establishes neither Production capture nor recovery readiness. */
export async function copyNeonCaptureCandidate(args:string[]){
 if(!['--copy-neon-candidate','--copy-work-candidate'].includes(args[0])||args.length!==13)throw Error('Explicit encrypted candidate and work destination required');
 const allowed=new Set(['environment','candidate','bundle','key-file','destination','output']),values:Record<string,string>={};
 for(let index=1;index<args.length;index+=2){const key=args[index].replace(/^--/,'');if(!args[index].startsWith('--')||!allowed.has(key)||values[key]||!args[index+1]||args[index+1].startsWith('--'))throw Error('Invalid archive-copy input');values[key]=args[index+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete work archive scope required');
 const candidateFile=resolve(values.candidate),destinationFile=resolve(values.destination);
 const candidate=(args[0]==='--copy-work-candidate'?workCaptureCandidateSchema:pilotCaptureCandidateSchema).parse(await readEvidence(dirname(candidateFile),basename(candidateFile)));
 const destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(destinationFile),basename(destinationFile)));
 if(candidate.environmentId!==values.environment)throw Error('Archive source marker differs');
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(180000,async signal=>{
  try{
   await verifyRecoveryCandidate({candidate,environmentId:values.environment,bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),signal});
   const cloud=await verifyWorkNeonDestination(destination,signal);
   const scope:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId:destination.installationId,id:candidate.id,environmentId:candidate.environmentId,capturedAt:candidate.capturedAt,expiresAt:new Date(Date.parse(candidate.capturedAt)+7*86400000).toISOString(),ciphertextDigest:candidate.encryptedBundle.digest,headerDigest:candidate.encryptedBundle.headerDigest,sizeBytes:candidate.encryptedBundle.sizeBytes};
   if(args[0]==='--copy-work-candidate'){
    const coldOutput=join(root,'cold');await mkdir(coldOutput,{mode:0o700});
    const verified=await copyWorkCapture({candidate,sourceProjectId:destination.sourceProjectId,installationId:destination.installationId,connectionString:destination.databaseUrl,maximumBytes:destination.maximumBytes,bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),coldOutput,signal});
    if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Work capture copy scope or protected checkout changed');
    const receipt={...verified,id,...source,recordedAt:new Date().toISOString(),candidateId:candidate.id,environmentId:candidate.environmentId,cloud,scope,workCloudCopyVerified:true,productionCaptureVerified:false};
    await writeEvidence(root,'copy.json',receipt);console.info(JSON.stringify({encryptedWorkCopy:'pass',coldDownloadAuthenticated:true,productionCaptureVerified:false,restorationReady:false}));return receipt;
   }
   const first=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});let copied;
   try{await first.connect();const contract=(await first.query('SELECT maximum_bytes FROM turas_backup.contract WHERE installation_id=$1',[destination.installationId])).rows;if(contract.length!==1||Number(contract[0].maximum_bytes)!==destination.maximumBytes)throw Error('Exact work archive capacity differs');copied=await putNeonEncryptedArchive(first,scope,resolve(values.bundle),signal);}finally{await first.end();}
   const cold=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});let verified;
   try{await cold.connect();verified=await verifyNeonEncryptedArchive(cold,scope,signal);}finally{await cold.end();}
   if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Archive source destination or protected checkout changed');
   const receipt={contract:'pilot-neon-candidate-copy-v1',id,...source,recordedAt:new Date().toISOString(),candidateId:candidate.id,environmentId:candidate.environmentId,cloud,scope,encryptedBytesVerified:verified.encryptedBytesVerified,freshConnectionVerified:true,replayed:copied.replayed,workCloudCopyVerified:true,productionCaptureVerified:false,currentAuthorityVerified:false,scheduledBackupVerified:false,restorationReady:false};
   await writeEvidence(root,'copy.json',receipt);console.info(JSON.stringify({encryptedWorkCopy:'pass',freshConnectionVerified:true,productionCaptureVerified:false,restorationReady:false}));return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,candidateId:candidate.id,state:'fail',safeFailure:'incomplete_work_archive_copy',restorationReady:false});throw error;}
 });
}
export async function expireWorkNeonArchives(args:string[]){
 if(args.length!==5||args[0]!=='--expire-neon-managed'||args[1]!=='--destination'||args[3]!=='--output'||!args[2]||!args[4]||args[2].startsWith('--')||args[4].startsWith('--'))throw Error('Explicit work managed-archive expiry required');
 const file=resolve(args[2]),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(file),basename(file))),root=resolve(args[4]);
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(90000,async signal=>{
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal),db=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});let result;
   try{await db.connect();result=await expireNeonManagedArchives(db,destination.installationId,signal);}finally{await db.end();}
   if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Archive expiry source destination or protected checkout changed');
   const receipt={id,...source,cloud,recordedAt:new Date().toISOString(),...result,productionRecoveryVerified:false,restorationReady:false};
   await writeEvidence(root,'expiry.json',receipt);console.info(JSON.stringify({expiredManagedArchives:result.expiredArchiveIds.length,operatorArchivesDeleted:false,independentAuthorityDeleted:false,scheduleExecutionVerified:false}));return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_work_archive_expiry',restorationReady:false});throw error;}
 });
}
