import {Client} from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {z} from 'zod';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireMeasuredWorkIntegrity,type RestoredWorkIntegrity} from './restored-work-integrity';

const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
type Scope=z.infer<typeof scopeSchema>;
export type OwnedRestoreTarget=Readonly<{contract:'pilot-owned-restore-target-v1';runnerEnvironmentId:string;targetDigest:string}>;
type Binding={connection:string;container:string;ownerLabel:string;containerId:string;runnerEnvironmentId:string;identity:string;restored?:{scope:Scope;integrity:RestoredWorkIntegrity;storeRoot:string}};
const targets=new WeakMap<object,Binding>(),connections=new WeakMap<object,{target:OwnedRestoreTarget;scope:Scope}>();
const execute=promisify(execFile);
function binding(target:OwnedRestoreTarget){const b=targets.get(target);if(!b)throw Error('Actual owned restore target capability required');return b;}
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
  if(initial.environmentId!==input.environmentId||initial.schemaVersion!==79)throw Error('Fresh current owned restore marker required');
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
 if(actual.identity!==b.identity||actual.environmentId!==scope.environmentId||actual.schemaVersion!==79||control.length!==1||control[0].mode!=='locked'||Number(control[0].revision)!==scope.controlRevision||control[0].recovery_id!==scope.recoveryId)throw Error('Exact bound locked recovery source required');
 signal.throwIfAborted();return b.restored.integrity;
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
