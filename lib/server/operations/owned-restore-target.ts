import {retireOwnedProcess,requireOwnedProcessRetirement,type OwnedProcessRetirement} from '../../../scripts/pilot-owned-process';
import {requiredRecoveryObjects} from './required-objects';
import {LocalPrivateObjects} from '../storage/local-objects';
import {verifiedObjectInventory,activeObjectNamespaces} from '../storage/inventory';
import {materializeOwnedRecoveryStores} from './object-restore';
import {Client} from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,dirname} from 'node:path';
import {readFile,rm} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {z} from 'zod';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireMeasuredWorkIntegrity,type RestoredWorkIntegrity} from './restored-work-integrity';

const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
type Scope=z.infer<typeof scopeSchema>;
export type OwnedRestoreTarget=Readonly<{contract:'pilot-owned-restore-target-v1';runnerEnvironmentId:string;targetDigest:string}>;
type Binding={connection:string;container:string;ownerLabel:string;containerId:string;runnerEnvironmentId:string;identity:string;restored?:{scope:Scope;integrity:RestoredWorkIntegrity;storeRoot:string};runtime?:{binding:string|null;closedDigest:string;active:boolean}};
const targets=new WeakMap<object,Binding>(),connections=new WeakMap<object,{target:OwnedRestoreTarget;scope:Scope}>();
const execute=promisify(execFile);
const runtimeActive=new WeakSet<object>();
const runtimeEnvironments=new WeakMap<object,{target:OwnedRestoreTarget;scope:Scope;signal:AbortSignal;processes:Set<OwnedProcessRetirement>}>();
export function requireOwnedRestoredRuntimeEnvironment(target:OwnedRestoreTarget,raw:Scope,environment:Readonly<Record<string,string>>){
 const actual=runtimeEnvironments.get(environment),scope=scopeSchema.parse(raw);
 if(!actual||actual.target!==target||recoveryDigest(actual.scope)!==recoveryDigest(scope)||!runtimeActive.has(target)||!binding(target).runtime?.active)throw Error('Actual active restored runtime environment required');
 actual.signal.throwIfAborted();return actual.signal;
}

function binding(target:OwnedRestoreTarget){const b=targets.get(target);if(!b)throw Error('Actual owned restore target capability required');return b;}
export function registerOwnedRestoredRuntimeProcess(target:OwnedRestoreTarget,scope:Scope,environment:Readonly<Record<string,string>>,process:OwnedProcessRetirement){
 requireOwnedRestoredRuntimeEnvironment(target,scope,environment);requireOwnedProcessRetirement(process);runtimeEnvironments.get(environment)!.processes.add(process);
}
async function containerIdentity(b:Pick<Binding,'connection'|'container'|'ownerLabel'>,signal:AbortSignal){
 signal.throwIfAborted();
 const format='{"id":{{json .Id}},"labels":{{json .Config.Labels}},"ports":{{json .NetworkSettings.Ports}},"running":{{json .State.Running}}}';
 const result=await execute('docker',['inspect','--format',format,b.container],{signal,timeout:10000,maxBuffer:65536});
 signal.throwIfAborted();const actual=JSON.parse(result.stdout),url=new URL(b.connection),ports=actual.ports?.['5432/tcp'];
 if(!/^[a-f0-9]{64}$/.test(actual.id)||actual.running!==true||actual.labels?.['turas.016.owner']!==b.ownerLabel||!Array.isArray(ports)||ports.length!==1||ports[0].HostIp!=='127.0.0.1'||ports[0].HostPort!==url.port)throw Error('Exact running owned restore container required');
 return actual.id as string;
}
async function databaseIdentity(db:Client,b:Pick<Binding,'connection'>){
 const url=new URL(b.connection),rows=(await db.query(`SELECT current_database() AS name,current_user AS role,
 inet_server_addr()::text AS address,inet_server_port() AS port,
 encode(sha256(convert_to((pg_control_system()).system_identifier::text,'UTF8')),'hex') AS server_identity,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner,
 environment_id,schema_version FROM turas_environment`)).rows;
 if(rows.length!==1||rows[0].owner!==true||rows[0].role!==decodeURIComponent(url.username)||rows[0].name!==decodeURIComponent(url.pathname.slice(1)))throw Error('Exact owned restore database owner required');
 const row=rows[0];return {identity:recoveryDigest({name:row.name,role:row.role,address:row.address,port:row.port,serverIdentity:row.server_identity}),environmentId:String(row.environment_id),schemaVersion:Number(row.schema_version)};
}
async function connect<T>(b:Binding,signal:AbortSignal,run:(db:Client)=>Promise<T>){
 if(await containerIdentity(b,signal)!==b.containerId)throw Error('Owned restore container changed');
 const db=new Client({connectionString:b.connection,connectionTimeoutMillis:5000,statement_timeout:5000});let lost=false;db.on('error',()=>{lost=true;});
 try{await db.connect();signal.throwIfAborted();if((await databaseIdentity(db,b)).identity!==b.identity)throw Error('Owned restore cluster changed');const result=await run(db);if(lost)throw Error('Owned restore owner connection lost');return result;}
 finally{connections.delete(db);await db.end();}
}
/** Mint before restoring while the original runner marker is still present.
 * No source environment, supplied URL or serialized description grants a target. */
export async function mintOwnedRestoreTarget(raw:{container:string;ownerLabel:string;environmentId:string},signal:AbortSignal){
 const input=z.strictObject({container:z.string().regex(/^turas-016-check-[a-f0-9]{12}$/),ownerLabel:z.string().regex(/^[a-f0-9]{12}$/),environmentId:z.string().regex(/^test-pilot-[a-f0-9]{12}$/)}).parse(raw);
 if(process.env.VERCEL||input.container!=='turas-016-check-'+input.ownerLabel||input.environmentId!=='test-pilot-'+input.ownerLabel||input.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw Error('Original owned restore runner required');
 const connection=requireOwnedPilotDatabase(process.env,true),base={connection,container:input.container,ownerLabel:input.ownerLabel};
 if(new URL(connection).pathname!=='/turas_test_016_eval_'+input.ownerLabel)throw Error('Owned restore database name differs');
 const containerId=await containerIdentity(base,signal),db=new Client({connectionString:connection,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{
  db.on('error',()=>{});await db.connect();const initial=await databaseIdentity(db,base);signal.throwIfAborted();
  if(await containerIdentity(base,signal)!==containerId)throw Error('Owned restore container changed');
  if(initial.environmentId!==input.environmentId||initial.schemaVersion!==80)throw Error('Fresh current owned restore marker required');
  const target:OwnedRestoreTarget=Object.freeze({contract:'pilot-owned-restore-target-v1',runnerEnvironmentId:input.environmentId,targetDigest:recoveryDigest({containerId,identity:initial.identity})});
  targets.set(target,{...base,containerId,runnerEnvironmentId:input.environmentId,identity:initial.identity});return target;
 }finally{await db.end();}
}
/** Bind the restored source marker only after actual authenticated restoration.
 * The existing integrity capability checks cluster, owner, locked revision and
 * private store bytes. Runner ownership and source application identity differ. */
export async function bindOwnedRestoredSource(target:OwnedRestoreTarget,integrity:RestoredWorkIntegrity,storeRoot:string,signal:AbortSignal){
 const b=binding(target),scope=scopeSchema.parse({environmentId:integrity.environmentId,recoveryId:integrity.recoveryId,controlRevision:integrity.controlRevision}),root=resolve(storeRoot);
 if(b.restored&&(b.restored.integrity!==integrity||b.restored.storeRoot!==root))throw Error('Owned restore source already bound');
 return connect(b,signal,async db=>{
  await db.query('BEGIN');
  try{await requireMeasuredWorkIntegrity(db,integrity,scope,root,signal);signal.throwIfAborted();await db.query('COMMIT');b.restored={scope,integrity,storeRoot:root};return target;}
  catch(error){await db.query('ROLLBACK');throw error;}
 });
}
export async function requireOwnedRestoreConnection(db:Client,target:OwnedRestoreTarget,raw:Scope,signal:AbortSignal){
 signal.throwIfAborted();const b=binding(target),scope=scopeSchema.parse(raw),active=connections.get(db);
 if(!b.restored||active?.target!==target||recoveryDigest(scope)!==recoveryDigest(b.restored.scope)||recoveryDigest(scope)!==recoveryDigest(active.scope))throw Error('Actual bound owner recovery connection required');
 if(await containerIdentity(b,signal)!==b.containerId)throw Error('Owned restore container changed');
 const actual=await databaseIdentity(db,b),control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1',[scope.environmentId])).rows;
 if(actual.identity!==b.identity||actual.environmentId!==scope.environmentId||actual.schemaVersion!==80||control.length!==1||control[0].mode!=='locked'||Number(control[0].revision)!==scope.controlRevision||control[0].recovery_id!==scope.recoveryId)throw Error('Exact bound locked recovery source required');
 signal.throwIfAborted();return b.restored.integrity;
}
/** Derive required originals from the actual restored ledger, never from a
 * supplied object list. Physical archive parity alone cannot prove coverage. */
export async function verifyOwnedRestoredRequiredObjects(db:Client,target:OwnedRestoreTarget,raw:Scope,signal:AbortSignal){
 const scope=scopeSchema.parse(raw),b=binding(target),proof=await requireOwnedRestoreConnection(db,target,scope,signal);
 await requireMeasuredWorkIntegrity(db,proof,scope,b.restored!.storeRoot,signal);
 const required=await requiredRecoveryObjects(db,scope.environmentId),physical=await verifiedObjectInventory(new LocalPrivateObjects(b.restored!.storeRoot,scope.environmentId,10485760),scope.environmentId,activeObjectNamespaces,signal,{maximumObjects:256,maximumBytes:24*1024*1024});
 const actual=new Map(physical.objects.map(object=>[object.key,object]));
 if(required.length>256||required.some(object=>{const stored=actual.get(object.key);return !stored||stored.digest!==object.digest||stored.sizeBytes!==object.sizeBytes;}))throw Error('Required restored original coverage differs');
 return Object.freeze({contract:'pilot-owned-required-originals-v1' as const,environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,requiredObjectCount:required.length,requiredObjectBytes:required.reduce((sum,object)=>sum+object.sizeBytes,0),requiredObjectsDigest:recoveryDigest(required),physicalInventoryDigest:physical.digest,requiredOriginalsVerified:true as const,serviceVerified:false as const,restorationReady:false as const});
}
/** Scoped canonical reads may change the source marker, never their database.
 * This exposes no connection or credential and does not configure an app. */
export function requireOwnedRestoreConfigurationTarget(target:OwnedRestoreTarget,runtime:string,owner:string){
 const b=binding(target),selected=new URL(b.connection),actualOwner=new URL(owner),actualRuntime=new URL(runtime);
 if(actualOwner.href!==selected.href||actualRuntime.protocol!==selected.protocol||actualRuntime.hostname!==selected.hostname||actualRuntime.port!==selected.port||actualRuntime.pathname!==selected.pathname||actualRuntime.search!==selected.search||!['turas_runtime','turas_runtime_016'].includes(decodeURIComponent(actualRuntime.username)))throw Error('Scoped recovery configuration database differs');
}
/** Only this constructor supplies connections for recovery-source reads. The
 * ordinary owned-database guard remains unchanged, and secrets stay in memory.
 * Callers own their transactions; a failed final check does not undo callback
 * writes that the caller already committed. No verification or unlock is implied. */
export async function withOwnedRestoreTarget<T>(target:OwnedRestoreTarget,scope:Scope,signal:AbortSignal,run:(db:Client)=>Promise<T>){
 const b=binding(target),selectedScope=Object.freeze(scopeSchema.parse(scope));return connect(b,signal,async db=>{
  connections.set(db,{target,scope:selectedScope});await requireOwnedRestoreConnection(db,target,selectedScope,signal);
  const result=await run(db);await requireOwnedRestoreConnection(db,target,selectedScope,signal);return result;
 });
}

/** Temporary direct restricted connection for an owned restored target. Authored
 * runtime grants are explicit here, never a request-handler migration. Child
 * application configuration contains only the restricted runtime credential. This is not HTTP admission or recovery
 * verification. Both logins are closed and temporary backends drained on exit. */
export async function withOwnedRestoredRuntime<T>(target:OwnedRestoreTarget,raw:Scope,signal:AbortSignal,run:(runtime:Client,signal:AbortSignal,applicationEnvironment:Readonly<Record<string,string>>)=>Promise<T>){
 const b=binding(target),scope=Object.freeze(scopeSchema.parse(raw));
 if(runtimeActive.has(target)||b.runtime?.active)throw Error('Owned restored runtime already active');
 runtimeActive.add(target);
 // One immutable target/scope operation may be resumed only from its measured
 // closed state; an unrelated pre-existing role comment is never adopted.
 const operation=recoveryDigest({target:target.targetDigest,scope}),deadline=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
 try{return await withOwnedRestoreTarget(target,scope,deadline,async owner=>{
  // Session-level exclusion lasts through callback and cleanup, even for a
  // separately minted capability targeting this same physical database.
  if((await owner.query("SELECT pg_try_advisory_lock(hashtextextended('pilot-owned-restored-runtime',16021)) AS acquired")).rows[0]?.acquired!==true)throw Error('Owned restored runtime database lease active');
  const proof=b.restored!.integrity;
  if(await recoveryGrantCheckpoint(owner)!==(b.runtime?.closedDigest??proof.closedTargetGrantsDigest))throw Error('Restored runtime grant boundary changed');
  const roles=(await owner.query("SELECT oid,rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,shobj_description(oid,'pg_authid') AS binding FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows;
  if(roles.length!==2||roles.some(role=>role.rolcanlogin||role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls)||roles[1].binding!==(b.runtime?.binding??null))throw Error('Closed restricted restored runtime roles required');
  if((await owner.query("SELECT 1 FROM pg_auth_members WHERE member=ANY($1::oid[]) OR roleid=ANY($1::oid[])",[roles.map(role=>role.oid)])).rowCount||(await owner.query("SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rowCount)throw Error('Unbound restored runtime membership or backend');
  const password=randomBytes(32).toString('base64url'),url=new URL(b.connection);url.username='turas_runtime_016';url.password=password;
  const runtime=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000,statement_timeout:5000});runtime.on('error',()=>{});
  const ownedProcesses=new Set<OwnedProcessRetirement>();
  let recoveryStores:Awaited<ReturnType<typeof materializeOwnedRecoveryStores>>|undefined;
  const state=b.runtime??{binding:null as string|null,closedDigest:proof.closedTargetGrantsDigest,active:false};b.runtime=state;state.active=true;
  try{
   const grants=await readFile(resolve('scripts/db-role-setup.sql'),'utf8');deadline.throwIfAborted();
   await owner.query('BEGIN');
   try{
    await owner.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL transaction_timeout='30s'");
    await owner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);await owner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
    await requireOwnedRestoreConnection(owner,target,scope,deadline);
    if(await recoveryGrantCheckpoint(owner)!==state.closedDigest)throw Error('Restored runtime grant boundary changed');
    await verifyOwnedRestoredRequiredObjects(owner,target,scope,deadline);
    recoveryStores=await materializeOwnedRecoveryStores({sourceRoot:b.restored!.storeRoot,target:join(dirname(b.restored!.storeRoot),'canonical-runtime-'+randomUUID()),environmentId:scope.environmentId,signal:deadline});
    await requireMeasuredWorkIntegrity(owner,proof,scope,b.restored!.storeRoot,deadline);
    await owner.query(grants);
    await owner.query('GRANT turas_runtime TO turas_runtime_016');
    await owner.query((await owner.query("SELECT format('GRANT CONNECT ON DATABASE %I TO turas_runtime_016',current_database()) AS sql")).rows[0].sql);
    await owner.query((await owner.query("SELECT format('COMMENT ON ROLE turas_runtime_016 IS %L',$1::text) AS sql",[operation])).rows[0].sql);
    await owner.query((await owner.query("SELECT format('ALTER ROLE turas_runtime_016 LOGIN INHERIT PASSWORD %L VALID UNTIL %L',$1::text,$2::text) AS sql",[password,new Date(Date.now()+60000).toISOString()])).rows[0].sql);
    const valid=(await owner.query(`SELECT has_schema_privilege('turas_runtime_016','public','USAGE')
      AND has_table_privilege('turas_runtime_016','login_sessions','SELECT')
      AND NOT has_schema_privilege('turas_runtime_016','public','CREATE')
      AND NOT has_database_privilege('turas_runtime_016',current_database(),'CREATE')
      AND NOT has_table_privilege('turas_runtime_016','operations_control','UPDATE')
      AND NOT has_table_privilege('turas_runtime_016','operations_recovery_verifications','INSERT')
      AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role('turas_runtime_016',c.relowner,'MEMBER')) AS valid`)).rows[0]?.valid;
    if(valid!==true)throw Error('Restored runtime restricted grants differ');deadline.throwIfAborted();await owner.query('COMMIT');state.binding=operation;
   }catch(error){await owner.query('ROLLBACK');throw error;}
   await runtime.connect();deadline.throwIfAborted();
   const identity=(await runtime.query("SELECT current_user,session_user,current_database() AS database,environment_id,schema_version FROM turas_environment")).rows;
   if(identity.length!==1||identity[0].current_user!=='turas_runtime_016'||identity[0].session_user!=='turas_runtime_016'||identity[0].database!==decodeURIComponent(url.pathname.slice(1))||identity[0].environment_id!==scope.environmentId||Number(identity[0].schema_version)!==80)throw Error('Actual direct restored runtime required');
   let interrupted!:()=>void;
   const cancelled=new Promise<never>((_,reject)=>{interrupted=()=>reject(Error('Owned restored runtime interrupted'));deadline.addEventListener('abort',interrupted,{once:true});if(deadline.aborted)interrupted();});
   const applicationEnvironment=Object.freeze({DATABASE_URL:url.toString(),DATABASE_URL_UNPOOLED:url.toString(),TURAS_ENVIRONMENT_ID:scope.environmentId,TURAS_PRIVATE_OBJECT_BACKEND:'local',TURAS_ARTIFACT_STORE_ROOT:recoveryStores!.artifactRoot,TURAS_WORKFORCE_STORE_ROOT:recoveryStores!.workforceRoot,TURAS_REPORT_STORE_ROOT:recoveryStores!.reportRoot});
   runtimeEnvironments.set(applicationEnvironment,{target,scope,signal:deadline,processes:ownedProcesses});
   try{deadline.throwIfAborted();return await Promise.race([run(runtime,deadline,applicationEnvironment),cancelled]);}
   finally{runtimeEnvironments.delete(applicationEnvironment);deadline.removeEventListener('abort',interrupted);}
  }finally{
   // Cleanup uses a fresh bounded signal: cancellation must never skip closing
   // an already committed temporary login. The pinned cluster is checked again.
   let authorityClosed=false,processesClosed=false;
   try{try{await connect(b,AbortSignal.timeout(30000),async cleanup=>{
    await cleanup.query('ALTER ROLE turas_runtime NOLOGIN; ALTER ROLE turas_runtime_016 NOLOGIN PASSWORD NULL');
    await cleanup.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016') AND pid<>pg_backend_pid()");
    await cleanup.query((await cleanup.query("SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC,turas_runtime,turas_runtime_016',current_database()) AS sql")).rows[0].sql);
    await cleanup.query('REVOKE turas_runtime FROM turas_runtime_016');
    const remaining=(await cleanup.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin UNION ALL SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rows;
    if(remaining.length)throw Error('Owned restored runtime closure unverified');
    const comment=(await cleanup.query("SELECT shobj_description(oid,'pg_authid') AS binding FROM pg_roles WHERE rolname='turas_runtime_016'")).rows;
    if(comment.length!==1||(comment[0].binding!==null&&comment[0].binding!==operation))throw Error('Restored runtime operation binding changed');
    state.binding=comment[0].binding;state.closedDigest=await recoveryGrantCheckpoint(cleanup);
   });authorityClosed=true;}finally{
    try{await runtime.end();}finally{
     const closure=await Promise.allSettled([...ownedProcesses].map(retireOwnedProcess));
     processesClosed=closure.every(result=>result.status==='fulfilled');
     if(!processesClosed)throw new AggregateError(closure.filter(result=>result.status==='rejected').map(result=>result.reason),'Owned restored child closure unverified');
    }
   }}finally{
    if(authorityClosed&&processesClosed){if(recoveryStores)await rm(dirname(recoveryStores.artifactRoot),{recursive:true,force:true});state.active=false;}
   }
  }
 });}finally{if(!b.runtime?.active)runtimeActive.delete(target);}
}
