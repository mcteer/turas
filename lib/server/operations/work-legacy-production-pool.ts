import {observeRecoveryConnection} from './recovery-connection';
import {constants} from 'node:fs';
import {Client} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {open,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {z} from 'zod';
import {readEvidence} from '../../../scripts/pilot-evidence';
import {databaseSafetySourceSchema} from '../../../scripts/pilot-database-safety-copy';
import {DEMO_IDS} from '../bootstrap-ids';
import {hashSessionToken} from '../auth/sessions';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {databaseTargetDigest} from './database-binding';
import {currentRecoveryStateDigest} from './recovery-state';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Reviewed released077 contract. Its auth, watchdog/retrieval/learning and
 * research-cache SQL delegate to db/client's DATABASE_URL pool. This says
 * nothing about eve's separate Workflow backend or operator owner connections. */
const legacySource='f8d196fad60a96698656188074d0abe668bc7991';
const expectedCrons=new Map([['/api/internal/research-maintenance','17 3 * * *'],['/eve/v1/turas/watchdog','* * * * *']]);
const tokenSchema=z.string().min(1).max(8192);
type Input={target:LockedWorkRecoveryInput;productionSourceFile:string;token:string;journalDirectory:string};
type Source=z.infer<typeof databaseSafetySourceSchema>;
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const measured=new WeakMap<object,{token:string;sourceFile:string;journalDirectory:string}>();
const sourceSchema=databaseSafetySourceSchema.extend({schemaVersion:z.literal(77)}).refine(value=>{
 const url=new URL(value.databaseUrl);
 return !!url.username&&!!url.password&&!!url.pathname.slice(1)&&!url.hash&&(!url.port||url.port==='5432')&&url.searchParams.getAll('sslmode').length===1&&url.searchParams.get('sslmode')==='verify-full'&&url.searchParams.getAll('channel_binding').length<=1&&(!url.searchParams.has('channel_binding')||url.searchParams.get('channel_binding')==='require')&&[...url.searchParams.keys()].every(key=>['sslmode','channel_binding'].includes(key));
},'Bounded direct peer owner connection required');
async function source(file:string){return sourceSchema.parse(await readEvidence(dirname(resolve(file)),basename(resolve(file))));}
async function durable(root:string,name:string,value:unknown){
 const file=await open(join(root,name),'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
 await syncDirectory(root,true);
}
async function syncDirectory(raw:string,privateRoot:boolean){
 const root=resolve(raw),directory=await open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{const stat=await directory.stat();if(!stat.isDirectory()||stat.uid!==process.getuid?.()||await realpath(root)!==root||(privateRoot?(stat.mode&0o777)!==0o700:(stat.mode&0o022)!==0))throw Error('Owned durable peer namespace required');await directory.sync();}finally{await directory.close();}
}
async function privateDirectory(raw:string){const root=resolve(raw);try{await mkdir(root,{mode:0o700});}catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='EEXIST')throw error;}
 const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700||await realpath(root)!==root)throw Error('Private direct peer-probe directory required');
 // Persist both contents and the parent's directory entry, including reopened
 // roots. Files cannot make a newly created enclosing namespace durable.
 await syncDirectory(root,true);await syncDirectory(dirname(root),false);return root;}

async function bytes(response:Response,maximum:number,signal:AbortSignal){const reader=response.body?.getReader();if(!reader)throw Error('Peer response body absent');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){signal.throwIfAborted();const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>maximum)throw Error('Peer metadata byte bound exceeded');chunks.push(item.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return Buffer.concat(chunks).toString();}
async function peerIdentity(db:Client,selected:Source,cleanup=false){
 const rows=(await db.query(`SELECT e.environment_id,e.schema_version,current_database() AS name,current_user AS role,clock_timestamp() AS now,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='login_sessions'::regclass)) AS owner FROM turas_environment e`)).rows;
 const row=rows[0],url=new URL(selected.databaseUrl);
 if(rows.length!==1||row.environment_id!==selected.environmentId||(!cleanup?Number(row.schema_version)!==77:![77,78,79].includes(Number(row.schema_version)))||row.name!==decodeURIComponent(url.pathname.slice(1))||row.role!==decodeURIComponent(url.username)||row.owner!==true||Math.abs(row.now.getTime()-Date.now())>5000)throw Error('Exact current077 peer owner and clock required');return row;
}
function connection(selected:Source,connectionLost:AbortController){const client=new Client({connectionString:selected.databaseUrl,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000,options:'-c lock_timeout=3000'});observeRecoveryConnection(client,connectionLost);return client;}
async function retire(selected:Source,id:string,hash:string){
 const connectionLost=new AbortController(),cleanup=connection(selected,connectionLost);try{await cleanup.connect();await peerIdentity(cleanup,selected,true);
 const rows=(await cleanup.query('SELECT id,principal_id,token_hash,revoked_at FROM login_sessions WHERE id=$1',[id])).rows;
 if(rows.length>1||rows.length===1&&(rows[0].principal_id!==DEMO_IDS.mcteer||rows[0].token_hash!==hash))throw Error('Original peer nonce identity changed');
 await cleanup.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND token_hash=$2 AND principal_id=$3',[id,hash,DEMO_IDS.mcteer]);
 const after=(await cleanup.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1 AND token_hash=$2 AND principal_id=$3',[id,hash,DEMO_IDS.mcteer])).rows;
 if(after.length&&after[0].retired!==true)throw Error('Independent original peer nonce retirement unavailable');connectionLost.signal.throwIfAborted();return {rowPresent:after.length===1,retired:after.length===1};
 }finally{await cleanup.end();}
}
async function inspect(db:Client,target:LockedWorkRecoveryTarget,selected:Source,token:string,journalDirectory:string,phase:'initial'|'final',parent:AbortSignal){
 if(!isWorkRecoveryDecisionClient(db)||selected.projectId!==target.projectId||selected.environmentId===target.environmentId||databaseTargetDigest(selected.databaseUrl,target.environmentId)===target.databaseBindingDigest||target.deadline<=Date.now())throw Error('Genuine distinct current Production pool probe required');
 await requireLockedWorkRecoveryConnection(db,target,scope(target));await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const connectionLost=new AbortController(),signal=AbortSignal.any([parent,connectionLost.signal,AbortSignal.timeout(target.deadline-Date.now())]);let apiCalls=0,httpCalls=0;
 async function api(path:string){if(++apiCalls>4)throw Error('Peer metadata request envelope exhausted');const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]),response=await fetch('https://api.vercel.com'+path,{method:'GET',headers:{authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:bounded});if(!response.ok)throw Error('Peer platform metadata unavailable');return JSON.parse(await bytes(response,2097152,bounded));}
 async function platform(){
  const project=await api('/v9/projects/'+target.projectId+'?teamId='+target.teamId),id=project.targets?.production?.id;
  if(project.id!==target.projectId||project.accountId!==target.teamId||!/^dpl_[A-Za-z0-9]+$/.test(id??''))throw Error('Exact Production peer project required');
  const deployment=await api('/v13/deployments/'+id+'?teamId='+target.teamId);
  if(deployment.id!==id||deployment.projectId!==target.projectId||deployment.ownerId!==target.teamId||deployment.target!=='production'||deployment.readyState!=='READY'||deployment.meta?.githubCommitSha!==legacySource||!/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url??''))throw Error('Reviewed immutable released077 Production peer required');
  const cron=project.crons;if(!cron||cron.deploymentId!==id||!Array.isArray(cron.definitions)||cron.definitions.length!==expectedCrons.size||new Set(cron.definitions.map((row:{path:string})=>row.path)).size!==expectedCrons.size||cron.definitions.some((row:{host:string;path:string;schedule:string})=>row.host!==deployment.url||expectedCrons.get(row.path)!==row.schedule))throw Error('Exact released peer cron runtime binding required');
  const keys=Object.entries(project.protectionBypass??{}).filter(([,entry])=>(entry as {scope?:string}).scope==='automation-bypass');if(keys.length!==1)throw Error('Exact current peer automation key required');
  return {deploymentId:id as string,origin:'https://'+deployment.url,bypass:keys[0][0],digest:recoveryDigest({id,origin:deployment.url,source:legacySource,cron,automation:project.protectionBypass})};
 }
 const sourceDigest=recoveryDigest(selected),root=await privateDirectory(join(await privateDirectory(journalDirectory),'peer-pool-'+recoveryDigest({target:targetDigest(target),sourceDigest}))),plan={contract:'pilot-legacy-production-pool-plan-v1',targetDigest:targetDigest(target),sourceDigest,maximumPhases:2,maximumAppRequests:6,maximumMetadataRequests:8};
 if(phase==='initial')await durable(root,'plan-private.json',plan);else if(JSON.stringify(await readEvidence(root,'plan-private.json'))!==JSON.stringify(plan))throw Error('Original peer pool plan changed');
 // Claim each finite phase before its FIRST metadata request, including failed
 // or interrupted outcomes. Reinvocation cannot reset the cumulative envelope.
 await durable(root,phase+'-admission-private.json',{...plan,phase,maximumAppRequests:3,maximumMetadataRequests:4,admittedAt:new Date().toISOString()});
 const before=await platform();
 if(phase==='initial')await durable(root,'initial-platform-private.json',{digest:before.digest});else if((await readEvidence(root,'initial-platform-private.json') as {digest?:unknown}).digest!==before.digest)throw Error('Original peer platform binding changed');
 const nonce=randomBytes(32).toString('base64url'),id=randomUUID(),hash=hashSessionToken(nonce),peer=connection(selected,connectionLost);let failure:unknown,expected:unknown,identityDigest='',expiresAt=0,insertAcknowledged=false,retired=false;
 const record={...plan,contract:'pilot-owner-issued-peer-pool-nonce-v1',phase,id,principalId:DEMO_IDS.mcteer,tokenHash:hash,createdAt:new Date().toISOString(),passwordAuthenticationVerified:false};
 // Both files and the directory are durable before any INSERT. A lost commit
 // acknowledgement still leaves the exact original identity for cleanup.
 await durable(root,phase+'-credentials-private.json',{...record,source:selected,token:nonce});await durable(root,phase+'-intent-private.json',record);
 async function app(cookie:string){if(++httpCalls>3)throw Error('Peer app request envelope exhausted');const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]),response=await fetch(before.origin+'/api/auth/session',{method:'GET',headers:{cookie:'__Host-turas_session='+cookie,'x-vercel-protection-bypass':before.bypass},redirect:'manual',cache:'no-store',signal:bounded});
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||!response.headers.get('cache-control')?.includes('no-store')){await response.body?.cancel();throw Error('Actual peer auth response required');}return {status:response.status,body:JSON.parse(await bytes(response,65536,bounded))};}
 try{
  await peer.connect();await peer.query('BEGIN');const identity=await peerIdentity(peer,selected);
  const members=(await peer.query(`SELECT m.id,m.workspace_id,m.kind,m.role FROM principals p JOIN memberships m ON m.principal_id=p.id JOIN workspaces w ON w.id=m.workspace_id
   WHERE p.id=$1 AND p.login_name='mcteer' AND p.active AND m.active AND w.active AND m.kind='internal' ORDER BY m.id LIMIT 257 FOR SHARE OF p,m,w`,[DEMO_IDS.mcteer])).rows;
  if(!members.length||members.length>256)throw Error('Complete active peer participant bindings required');identityDigest=recoveryDigest(members);
  if((await db.query('SELECT 1 FROM login_sessions WHERE id=$1 OR token_hash=$2',[id,hash])).rowCount)throw Error('Fresh peer nonce already exists in locked target');
  const invalid=await app(randomBytes(32).toString('base64url'));if(invalid.status!==401||invalid.body?.error?.code!=='authentication_required')throw Error('Peer invalid-cookie control unverified');
  expiresAt=Math.min(identity.now.getTime()+59000,target.deadline-1000);if(expiresAt-Date.now()<10000)throw Error('Finite fresh peer nonce lifetime required');
  await peer.query('INSERT INTO login_sessions(id,principal_id,token_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',[id,DEMO_IDS.mcteer,hash,identity.now,new Date(expiresAt)]);await peer.query('COMMIT');insertAcknowledged=true;
  const actual=await app(nonce),data=actual.body?.data;
  if(actual.status!==200||data?.principal?.id!==DEMO_IDS.mcteer||data.principal.loginName!=='mcteer'||!members.some(row=>row.id===data.membership?.id&&row.workspace_id===data.workspace?.id&&row.kind===data.membership?.kind&&row.role===data.membership?.role)||data.expiresAt!==new Date(expiresAt).toISOString()||!z.string().regex(/^[a-f0-9]{64}$/).safeParse(data.csrfToken).success)throw Error('Actual fresh peer pool response differs');
  const rows=(await peer.query('SELECT principal_id,token_hash,revoked_at,expires_at FROM login_sessions WHERE id=$1',[id])).rows;
  if(rows.length!==1||rows[0].principal_id!==DEMO_IDS.mcteer||rows[0].token_hash!==hash||rows[0].revoked_at!==null||rows[0].expires_at.getTime()!==expiresAt||(await db.query('SELECT 1 FROM login_sessions WHERE id=$1 OR token_hash=$2',[id,hash])).rowCount)throw Error('Actual peer nonce location changed');
  expected={principalId:DEMO_IDS.mcteer,workspaceId:data.workspace.id,membershipId:data.membership.id};
 }catch(error){failure=error;}
 finally{
  await peer.query('ROLLBACK').catch(()=>{});await peer.end().catch(error=>{failure=new AggregateError([...(failure?[failure]:[]),error],'Peer owner connection cleanup incomplete');});
  try{const cleanup=await retire(selected,id,hash);retired=cleanup.retired;if(insertAcknowledged&&!retired)throw Error('Committed peer nonce retirement missing');await durable(root,phase+'-retirement-private.json',{...record,...cleanup,completedAt:new Date().toISOString()});}
  catch(error){failure=new AggregateError([...(failure?[failure]:[]),error],'Independent original peer nonce cleanup incomplete');}
 }
 if(failure)throw failure;
 if(!retired||Date.now()>=expiresAt-1000)throw Error('Fresh peer retirement measurement unavailable');const revoked=await app(nonce);if(revoked.status!==401||revoked.body?.error?.code!=='authentication_required')throw Error('Peer retired-cookie denial unverified');
 const after=await platform();if(after.digest!==before.digest)throw Error('Peer deployment cron or automation binding changed');await requireLockedWorkRecoveryConnection(db,target,scope(target));signal.throwIfAborted();
 const result={platformDigest:before.digest,peerEnvironmentId:selected.environmentId,peerDeploymentId:before.deploymentId,peerSourceCommit:legacySource,peerIdentityDigest:identityDigest,sourceDigest,nonceId:id,nonceObservationDigest:recoveryDigest(expected),apiCalls,httpCalls,observedAt:new Date().toISOString()};await durable(root,phase+'-observation-private.json',result);return result;
}
/** Narrow observed DATABASE_URL pool exclusion for the reviewed legacy peer.
 * It never authenticates a password or certifies all provider/owner connections. */
export async function measureWorkLegacyProductionPool(input:Input){
 if(input.target.hostedScope.target!=='preview')throw Error('Distinct Production peer exclusion is Preview-only');const token=tokenSchema.parse(input.token),selected=await source(input.productionSourceFile);
 const result=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>({targetDigest:targetDigest(target),...await inspect(db,target,selected,token,input.journalDirectory,'initial',input.target.signal)}));
 const proof=Object.freeze({contract:'pilot-work-legacy-production-pool-v1' as const,...result,ownerIssuedNonceRetired:true as const,legacyProductionRuntimePoolExcluded:true as const,reviewedPeerCronRuntimeExcluded:true as const,passwordAuthenticationVerified:false as const,allProviderIngressClosed:false as const,restorationReady:false as const});measured.set(proof,{token,sourceFile:resolve(input.productionSourceFile),journalDirectory:resolve(input.journalDirectory)});return proof;
}
export async function requireMeasuredWorkLegacyProductionPool(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof measureWorkLegacyProductionPool>>,signal:AbortSignal){
 const actual=measured.get(proof),age=Date.now()-Date.parse(proof.observedAt);if(!actual||!isWorkRecoveryDecisionClient(db)||proof.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh Production pool exclusion required');
 const selected=await source(actual.sourceFile);if(recoveryDigest(selected)!==proof.sourceDigest)throw Error('Original Production source changed');
 const current=await inspect(db,target,selected,actual.token,actual.journalDirectory,'final',signal);
 for(const key of ['platformDigest','peerEnvironmentId','peerDeploymentId','peerSourceCommit','peerIdentityDigest','sourceDigest'] as const)if(current[key]!==proof[key])throw Error('Measured Production peer pool binding changed');return proof;
}

/** Restart cleanup consumes the original durable identity, never a replacement
 * token or a new login. It may retire that row after a077→079 forward migration;
 * this does not qualify a stale/failed phase or reset its request allowance. */
export async function retireOriginalWorkLegacyProductionNonce(journalRoot:string,phase:'initial'|'final'){
 z.enum(['initial','final']).parse(phase);const root=resolve(journalRoot),raw=await readEvidence(root,phase+'-credentials-private.json') as Record<string,unknown>,plan=await readEvidence(root,'plan-private.json') as Record<string,unknown>;
 const selected=sourceSchema.parse(raw.source),id=z.uuid().parse(raw.id),nonce=z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(raw.token),hash=hashSessionToken(nonce);
 if(raw.contract!=='pilot-owner-issued-peer-pool-nonce-v1'||raw.phase!==phase||raw.principalId!==DEMO_IDS.mcteer||raw.tokenHash!==hash||raw.sourceDigest!==recoveryDigest(selected)||raw.targetDigest!==plan.targetDigest||raw.sourceDigest!==plan.sourceDigest)throw Error('Exact original durable peer nonce required');
 const result=await retire(selected,id,hash);return {contract:'pilot-original-peer-nonce-retirement-v1' as const,id,phase,...result,newNonceIssued:false as const,requestEnvelopeReset:false as const,restorationReady:false as const};
}
