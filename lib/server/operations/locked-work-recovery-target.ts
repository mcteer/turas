import {Client} from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,basename} from 'node:path';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {verifyConfiguredCredentials} from '../auth/credentials';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DEMO_IDS} from '../bootstrap-ids';
import {readEvidence,writeEvidence} from '../../../scripts/pilot-evidence';
import {pilotSource} from '../../../scripts/pilot-source';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding} from '../../../scripts/pilot-database-safety-copy';
import {pilotHostedScopeSchema,verifyHostedDeployment,hostedDeploymentLookupPath,type PilotHostedScope} from '../../contracts/pilot-hosted';
import {databaseTargetDigest} from './database-binding';
import {requireRetiredLegacyWorkRuntime} from './recovery-credential-denials';

const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
type Scope=z.infer<typeof scopeSchema>;
export type LockedWorkRecoveryTarget=Readonly<{contract:'pilot-locked-work-recovery-target-v1';environmentId:string;recoveryId:string;controlRevision:number;projectId:string;teamId:string;sourceCommit:string;sourceDigest:string;catalogDigest:string;origin:string;deploymentId:string;databaseBindingDigest:string;deadline:number}>;
type Binding={db:Client;scope:Scope;databaseName:string;ownerRole:string;runtimeConnection:string;signal:AbortSignal};
const bindings=new WeakMap<object,Binding>();
const execute=promisify(execFile);
function directConnection(raw:string,role?:string){
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||!url.pathname.slice(1)||!url.username||!url.password||url.hash||url.searchParams.get('sslmode')!=='verify-full'||url.searchParams.getAll('sslmode').length!==1||url.searchParams.getAll('channel_binding').length>1||[...url.searchParams.keys()].some(key=>!['sslmode','channel_binding'].includes(key))||(url.searchParams.has('channel_binding')&&url.searchParams.get('channel_binding')!=='require')||(role&&decodeURIComponent(url.username)!==role))throw Error('Exact bounded direct work recovery connection required');
 return url;
}
async function deployment(scope:PilotHostedScope,signal:AbortSignal,byOrigin:boolean){
 const response=await execute('vercel',['api',hostedDeploymentLookupPath(scope,byOrigin),'--raw'],{signal,timeout:30000,maxBuffer:1048576,env:{NODE_ENV:'production',...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))}});
 return verifyHostedDeployment(JSON.parse(response.stdout),scope);
}
async function requireSource(scope:PilotHostedScope){
 const status=await execute('git',['status','--porcelain=v1','--untracked-files=all'],{timeout:10000,maxBuffer:1048576});
 if(status.stdout.trim())throw Error('Clean committed work recovery source required');
 const current=await pilotSource();if(current.sourceCommit!==scope.sourceCommit||current.sourceDigest!==scope.sourceDigest||current.catalogDigest!==scope.catalogDigest)throw Error('Work recovery source changed');
}
/** Recheck the exact privately constructed client in the caller's owner transaction.
 * This capability never applies to another Client, serialized receipt or lifetime. */
export async function requireLockedWorkRecoveryConnection(db:Client,target:LockedWorkRecoveryTarget,raw:Scope){
 const scope=scopeSchema.parse(raw),binding=bindings.get(target);
 if(!binding||binding.db!==db||JSON.stringify(binding.scope)!==JSON.stringify(scope)||target.deadline<=Date.now())throw Error('Actual active locked work recovery target required');
 binding.signal.throwIfAborted();
 await db.query('SAVEPOINT locked_work_recovery_target');await db.query('RELEASE SAVEPOINT locked_work_recovery_target');
 if((await db.query("SELECT current_setting('transaction_isolation') AS isolation")).rows[0]?.isolation!=='read committed')throw Error('Work recovery requires read committed decision isolation');
 await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'; SET LOCAL transaction_timeout='60s'");
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
 const rows=(await db.query(`SELECT current_database() AS name,current_user AS role,e.environment_id,e.schema_version,c.mode,c.recovery_id,c.revision,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner
 FROM turas_environment e JOIN operations_control c USING(environment_id) FOR SHARE OF e,c`)).rows,row=rows[0];
 if(rows.length!==1||row.name!==binding.databaseName||row.role!==binding.ownerRole||row.owner!==true||row.environment_id!==scope.environmentId||Number(row.schema_version)!==79||row.mode!=='locked'||row.recovery_id!==scope.recoveryId||Number(row.revision)!==scope.controlRevision)throw Error('Exact locked work recovery owner required');
 await requireRetiredLegacyWorkRuntime(db);binding.signal.throwIfAborted();
 return target;
}
/** Platform-bound owner transport only. The target is usable solely during run;
 * no JSON flags, caller-created client or owned Docker guard exemption is accepted.
 * Caller must retire its probes before returning; full service is not certified. */
export async function withLockedWorkRecoveryTarget<T>(input:{sourceFile:string;hostedScope:PilotHostedScope;scope:Scope;runtimeConnection:string;deadline:number;signal:AbortSignal},run:(db:Client,target:LockedWorkRecoveryTarget)=>Promise<T>){
 const hosted=pilotHostedScopeSchema.parse(input.hostedScope),scope=scopeSchema.parse(input.scope),file=resolve(input.sourceFile);
 if(!Number.isSafeInteger(input.deadline)||input.deadline<=Date.now()||input.deadline>Date.now()+300000||hosted.environmentMarker!==scope.environmentId)throw Error('Finite exact work recovery scope required');
 const signal=AbortSignal.any([input.signal,AbortSignal.timeout(input.deadline-Date.now())]);signal.throwIfAborted();
 const source=databaseSafetyCaptureSourceSchema.parse(await readEvidence(dirname(file),basename(file))),owner=directConnection(source.databaseUrl),runtime=directConnection(input.runtimeConnection,'turas_runtime_016');
 if(source.schemaVersion!==79||source.projectId!==hosted.projectId||source.target!==hosted.target||source.environmentId!==scope.environmentId||databaseTargetDigest(owner.href,scope.environmentId)!==databaseTargetDigest(runtime.href,scope.environmentId))throw Error('Work recovery platform and runtime target differ');
 await requireSource(hosted);const platform=await verifyDatabaseSafetySourceBinding(source,hosted.teamId,signal),deployed=await deployment(hosted,signal,false);
 if(JSON.stringify(await deployment(hosted,signal,true))!==JSON.stringify(deployed))throw Error('Work recovery serving deployment differs');
 const db=new Client({connectionString:owner.href,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:11000});
 const target:LockedWorkRecoveryTarget=Object.freeze({contract:'pilot-locked-work-recovery-target-v1',...scope,projectId:hosted.projectId,teamId:hosted.teamId,sourceCommit:hosted.sourceCommit,sourceDigest:hosted.sourceDigest,catalogDigest:hosted.catalogDigest,origin:hosted.origin,deploymentId:hosted.deploymentId,databaseBindingDigest:databaseTargetDigest(runtime.href,scope.environmentId),deadline:input.deadline});
 let failure:unknown;
 try{
  await db.connect();bindings.set(target,{db,scope,databaseName:decodeURIComponent(owner.pathname.slice(1)),ownerRole:decodeURIComponent(owner.username),runtimeConnection:runtime.href,signal});
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{await requireLockedWorkRecoveryConnection(db,target,scope);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
  // Authenticate the exact runtime credential without invoking domain work.
  const probe=new Client({connectionString:runtime.href,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});
  try{await probe.connect();const rows=(await probe.query('SELECT current_database() AS name,current_user AS role,session_user AS session_role,environment_id,schema_version FROM turas_environment')).rows;if(rows.length!==1||rows[0].name!==decodeURIComponent(owner.pathname.slice(1))||rows[0].role!=='turas_runtime_016'||rows[0].session_role!=='turas_runtime_016'||rows[0].environment_id!==scope.environmentId||Number(rows[0].schema_version)!==79)throw Error('Actual work recovery runtime differs');}finally{await probe.end();}
  let abort:()=>void=()=>{};
  const cancellation=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason??Error('Work recovery cancelled'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  let result:T;try{result=await Promise.race([Promise.resolve().then(()=>run(db,target)),cancellation]);}finally{signal.removeEventListener('abort',abort);}
  signal.throwIfAborted();await db.query('ROLLBACK');
  const registered=pending.get(target)??[];if(registered.length&&(await db.query('SELECT 1 FROM login_sessions WHERE id=ANY($1::uuid[]) AND revoked_at IS NULL LIMIT 1',[registered.map(intent=>intent.sessionId)])).rowCount)throw Error('Work recovery session retirement incomplete');
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{await requireLockedWorkRecoveryConnection(db,target,scope);if((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.environment_id=$1 AND a.recovery_id=$2 AND a.control_revision=$3 AND (a.revoked_at IS NULL OR s.revoked_at IS NULL) LIMIT 1',[scope.environmentId,scope.recoveryId,scope.controlRevision])).rowCount)throw Error('Work recovery probe retirement incomplete');await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
  await requireSource(hosted);if(JSON.stringify(await verifyDatabaseSafetySourceBinding(source,hosted.teamId,signal))!==JSON.stringify(platform)||JSON.stringify(await deployment(hosted,signal,false))!==JSON.stringify(deployed)||JSON.stringify(await deployment(hosted,signal,true))!==JSON.stringify(deployed))throw Error('Work recovery platform changed');
  return result;
 }catch(error){failure=error;throw error;}finally{
  bindings.delete(target);const retirementErrors:unknown[]=[];
  // Close the original writer before reconciling ambiguous effects. A callback
  // that outlives cancellation cannot enqueue later writes on this connection.
  try{await db.end();}catch(error){retirementErrors.push(error);}
  try{await retireWorkRecoveryProbes(target,async()=>{const cleanup=new Client({connectionString:owner.href,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});try{await cleanup.connect();const identity=(await cleanup.query('SELECT current_database() AS name,current_user AS role')).rows[0];if(identity?.name!==decodeURIComponent(owner.pathname.slice(1))||identity.role!==decodeURIComponent(owner.username))throw Error('Exact work recovery cleanup connection required');return cleanup;}catch(error){await cleanup.end();throw error;}});}
  catch(error){retirementErrors.push(error);}
  if(retirementErrors.length)throw new AggregateError([...(failure?[failure]:[]),...retirementErrors],'Work recovery and independent probe cleanup incomplete');
 }
}

type Intent=Readonly<{sessionId:string;admissionId:string;workspaceId:string;membershipId:string;journalDirectory:string;sessionToken:string;admissionSecret:string;sourceCommit:string;origin:string;deploymentId:string;databaseBindingDigest:string}>;
const pending=new WeakMap<object,Intent[]>();
const secretHash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Persist exact identities before either session/admission INSERT. Secrets stay
 * in a separate private credential file and never enter ordinary receipts. The enclosing target owns independent finally cleanup of these IDs. */
export async function reserveWorkRecoveryProbe(db:Client,target:LockedWorkRecoveryTarget,input:{workspaceId:string;membershipId:string;journalDirectory:string}){
 const workspaceId=z.uuid().parse(input.workspaceId),membershipId=z.uuid().parse(input.membershipId);
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const rows=(await db.query(`SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.id=$1 AND m.workspace_id=$2 AND m.principal_id=$3 AND m.active AND m.kind='internal' AND m.role='admin' AND p.active AND p.login_name='mcteer' AND w.active
 AND (w.classification='primary' OR (w.classification='synthetic_pilot' AND w.pilot_environment_id=$4)) FOR SHARE OF m,p,w`,[membershipId,workspaceId,DEMO_IDS.mcteer,target.environmentId])).rows;
 if(rows.length!==1)throw Error('Exact configured work recovery probe owner required');
 let intents=pending.get(target);if(!intents){intents=[];pending.set(target,intents);}if(intents.length>=32)throw Error('Work recovery probe inventory exceeds bound');
 const intent=Object.freeze({sessionId:randomUUID(),admissionId:randomUUID(),workspaceId,membershipId,journalDirectory:input.journalDirectory,sessionToken:randomBytes(32).toString('base64url'),admissionSecret:randomBytes(32).toString('base64url'),sourceCommit:target.sourceCommit,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
 intents.push(intent);
 try{const credentialDigest=await writeEvidence(input.journalDirectory,'private-probe-'+intent.sessionId+'-credentials.json',{contract:'pilot-work-recovery-probe-credentials-v1',sessionId:intent.sessionId,admissionId:intent.admissionId,sessionToken:intent.sessionToken,admissionSecret:intent.admissionSecret});
 await writeEvidence(input.journalDirectory,'probe-'+intent.sessionId+'-intent.json',{...target,contract:'pilot-work-recovery-probe-intent-v2',credentialDigest,sessionId:intent.sessionId,admissionId:intent.admissionId,workspaceId,membershipId,recordedAt:new Date().toISOString(),serviceOpened:false});
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});return intent;
 }catch(error){const index=intents.indexOf(intent);if(index>=0)intents.splice(index,1);throw error;}
}
/** Internal target-finally cleanup. Reconnect independently after rollback or
 * cancellation; never reuse cancelled IO or assume a lost INSERT acknowledgement
 * means no credential exists. Exact immutable identities delimit all writes. */
async function retireWorkRecoveryProbes(target:LockedWorkRecoveryTarget,connect:()=>Promise<Client>){
 const intents=pending.get(target);if(!intents?.length)return;
 const db=await connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try{
   await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='5000ms'; SET LOCAL transaction_timeout='20s'");
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);
   const marker=(await db.query("SELECT e.environment_id,e.schema_version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner FROM turas_environment e")).rows;
   if(marker.length!==1||marker[0].environment_id!==target.environmentId||Number(marker[0].schema_version)!==79||marker[0].owner!==true)throw Error('Exact work probe cleanup owner required');
   await revokeWorkRecoveryProbeIdentities(db,target,intents);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  for(const intent of intents){if((await db.query('SELECT 1 FROM login_sessions WHERE id=$1 AND revoked_at IS NULL UNION ALL SELECT 1 FROM operations_recovery_http_reads WHERE id=$2 AND revoked_at IS NULL',[intent.sessionId,intent.admissionId])).rowCount)throw Error('Committed work recovery probe retirement unverified');await recordWorkRecoveryProbeRetirement(target,intent);}
  pending.delete(target);
 }finally{await db.end();}
}

async function revokeWorkRecoveryProbeIdentities(db:Client,target:LockedWorkRecoveryTarget,intents:readonly Intent[],apply=true){
 for(const intent of intents){
  const sessions=(await db.query('SELECT principal_id,membership_id,workspace_id,token_hash FROM login_sessions WHERE id=$1 FOR UPDATE',[intent.sessionId])).rows;
  if(sessions.length>1||sessions.some(row=>row.principal_id!==DEMO_IDS.mcteer||row.membership_id!==intent.membershipId||row.workspace_id!==intent.workspaceId||row.token_hash!==secretHash(intent.sessionToken)))throw Error('Work recovery session cleanup identity differs');
  const admissions=(await db.query('SELECT environment_id,recovery_id,control_revision,session_id,workspace_id,secret_hash,source_commit,origin,deployment_id,database_binding_digest FROM operations_recovery_http_reads WHERE id=$1 FOR UPDATE',[intent.admissionId])).rows;
  if(admissions.length>1||admissions.some(row=>row.environment_id!==target.environmentId||row.recovery_id!==target.recoveryId||Number(row.control_revision)!==target.controlRevision||row.session_id!==intent.sessionId||row.workspace_id!==intent.workspaceId||row.secret_hash!==secretHash(intent.admissionSecret)||row.source_commit!==intent.sourceCommit||row.origin!==intent.origin||row.deployment_id!==intent.deploymentId||row.database_binding_digest!==intent.databaseBindingDigest))throw Error('Work recovery admission cleanup identity differs');
  if(!apply)continue;
  await db.query('UPDATE operations_recovery_http_reads SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[intent.admissionId]);
  await db.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[intent.sessionId]);
  if((await db.query('SELECT 1 FROM login_sessions WHERE id=$1 AND revoked_at IS NULL UNION ALL SELECT 1 FROM operations_recovery_http_reads WHERE id=$2 AND revoked_at IS NULL',[intent.sessionId,intent.admissionId])).rowCount)throw Error('Work recovery credential retirement unverified');
 }
}
async function recordWorkRecoveryProbeRetirement(target:LockedWorkRecoveryTarget,intent:Intent){
 const name='probe-'+intent.sessionId+'-retired.json';
 try{await writeEvidence(intent.journalDirectory,name,{...target,contract:'pilot-work-recovery-probe-retirement-v1',sessionId:intent.sessionId,admissionId:intent.admissionId,completedAt:new Date().toISOString(),credentialsAbsentOrRevoked:true,serviceOpened:false});}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const retained=z.object({contract:z.literal('pilot-work-recovery-probe-retirement-v1'),sessionId:z.literal(intent.sessionId),admissionId:z.literal(intent.admissionId),environmentId:z.literal(target.environmentId),recoveryId:z.literal(target.recoveryId),controlRevision:z.literal(target.controlRevision),databaseBindingDigest:z.literal(target.databaseBindingDigest),credentialsAbsentOrRevoked:z.literal(true)}).parse(await readEvidence(intent.journalDirectory,name));if(!retained)throw error;}
}
const probeJournalSchema=z.object({contract:z.literal('pilot-work-recovery-probe-intent-v2'),projectId:z.string(),teamId:z.string(),environmentId:z.string(),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),databaseBindingDigest:z.string().regex(/^[a-f0-9]{64}$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),origin:z.url(),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),sessionId:z.uuid(),admissionId:z.uuid(),workspaceId:z.uuid(),membershipId:z.uuid(),credentialDigest:z.string().regex(/^[a-f0-9]{64}$/)});
/** Deny-only restart reconciliation. Actual original secret preimages bind the
 * private journal to stored credentials; no session or admission is created or
 * renewed. The caller must commit its owner transaction before returning. */
export async function reconcileWorkRecoveryProbeJournal(db:Client,target:LockedWorkRecoveryTarget,input:{journalDirectory:string;intentNames:readonly string[];password:string}){
 z.string().min(1).max(4096).parse(input.password);
 const config=getServerConfig();if(config.TURAS_ENVIRONMENT_ID!==target.environmentId||config.TURAS_DEMO_USERNAME!=='mcteer'||verifyConfiguredCredentials('mcteer',input.password,config)!==DEMO_IDS.mcteer)throw Error('Current configured recovery operator authentication required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 if(!input.intentNames.length||input.intentNames.length>32||new Set(input.intentNames).size!==input.intentNames.length)throw Error('Finite unique work recovery probe journal required');
 const intents:Intent[]=[];
 for(const name of input.intentNames){
  if(!/^probe-[a-f0-9-]{36}-intent\.json$/.test(name))throw Error('Exact work recovery probe journal name required');
  const row=probeJournalSchema.parse(await readEvidence(input.journalDirectory,name));
  if(name!=='probe-'+row.sessionId+'-intent.json'||row.environmentId!==target.environmentId||row.recoveryId!==target.recoveryId||row.controlRevision!==target.controlRevision||row.projectId!==target.projectId||row.teamId!==target.teamId||row.databaseBindingDigest!==target.databaseBindingDigest)throw Error('Work recovery probe journal target differs');
  const credentials=z.strictObject({contract:z.literal('pilot-work-recovery-probe-credentials-v1'),sessionId:z.literal(row.sessionId),admissionId:z.literal(row.admissionId),sessionToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/),admissionSecret:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(await readEvidence(input.journalDirectory,'private-probe-'+row.sessionId+'-credentials.json',row.credentialDigest));
  intents.push(Object.freeze({sessionId:row.sessionId,admissionId:row.admissionId,workspaceId:row.workspaceId,membershipId:row.membershipId,journalDirectory:input.journalDirectory,sessionToken:credentials.sessionToken,admissionSecret:credentials.admissionSecret,sourceCommit:row.sourceCommit,origin:row.origin,deploymentId:row.deploymentId,databaseBindingDigest:row.databaseBindingDigest}));
 }
 // Validate every original credential first. Re-read the shared registry only
 // after all awaits, then append synchronously so concurrent calls cannot lose
 // another reservation or exceed the common inventory bound.
 await revokeWorkRecoveryProbeIdentities(db,target,intents,false);
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 let existing=pending.get(target);if(!existing){existing=[];pending.set(target,existing);}
 if(existing.length+intents.length>32||intents.some((row,index)=>intents.slice(0,index).some(prior=>prior.sessionId===row.sessionId||prior.admissionId===row.admissionId))||intents.some(row=>existing.some(prior=>prior.sessionId===row.sessionId||prior.admissionId===row.admissionId)))throw Error('Ambiguous work recovery probe journal');
 existing.push(...intents);await revokeWorkRecoveryProbeIdentities(db,target,intents);
 return Object.freeze({contract:'pilot-work-recovery-probe-reconciliation-v1',environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,probes:intents.length,serviceOpened:false,restorationReady:false});
}
