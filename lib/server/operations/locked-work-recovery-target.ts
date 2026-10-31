import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {assertRecoveryDecisionSql} from './recovery-decision-sql';
import {claimRecoveryMeasurementLane,withRecoveryMeasurementTransport,remainingRecoveryMeasurementSlots,reserveRecoveryMeasurementSlot,retireRecoveryMeasurementLane,failRecoveryMeasurementLane,prepareRecoveryMeasurementLane,preparedRecoveryMeasurementDenials} from './recovery-measurement-group';
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
import {requireRetiredLegacyWorkRuntime,reconcileAuthenticatedWorkCredentialDenialsInTransaction} from './recovery-credential-denials';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {newMcpCredential,mcpCredentialScopeDigest} from '../mcp/credentials';
import {mcpBearerSchema,mcpCreateConnectionSchema,mcpConnectionScopeAllowed} from '../../contracts/mcp';

const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
type Scope=z.infer<typeof scopeSchema>;
export type LockedWorkRecoveryTarget=Readonly<{contract:'pilot-locked-work-recovery-target-v1';environmentId:string;recoveryId:string;controlRevision:number;projectId:string;teamId:string;sourceCommit:string;sourceDigest:string;catalogDigest:string;origin:string;deploymentId:string;databaseBindingDigest:string;deadline:number}>;
type Binding={db:Client;scope:Scope;databaseName:string;ownerRole:string;runtimeConnection:string;signal:AbortSignal;decision:boolean;decisionTransaction?:string;preparedDenials?:RetainedWorkDenials;preparingDenials?:boolean;probeIssuances?:number;parallelReads:boolean;drains:Set<Promise<unknown>>;abort:(reason:unknown)=>void;lane:ReturnType<typeof claimRecoveryMeasurementLane>};
const bindings=new WeakMap<object,Binding>();
const decisionClients=new WeakMap<object,Binding>();
/** Only a privately registered decision transport owns its aggregate timer. */
export function isWorkRecoveryDecisionClient(db:Client|import('pg').PoolClient){return decisionClients.get(db)?.decision===true;}
/** Scheduling hint only. Retired intents still occupy their original slots;
 * reserveWorkRecoveryProbe remains the authoritative admission check. */
export function remainingRegisteredWorkRecoveryProbes(db:Client,target:LockedWorkRecoveryTarget){
 const binding=bindings.get(target);if(!binding||binding.db!==db||target.deadline<=Date.now())throw Error('Actual active work recovery target required');
 binding.signal.throwIfAborted();return Math.max(0,Math.min(32-(pending.get(target)?.length??0),remainingRecoveryMeasurementSlots(binding.lane)));
}
/** Pure canonical reads only: one existing transaction, at most eight live
 * walks, no per-worker transaction control or credential issuance. A failure
 * aborts the whole owner; the transport drains workers after closing its writer. */
export async function withWorkRecoveryReadGroup<T>(db:Client,target:LockedWorkRecoveryTarget,reads:readonly (()=>Promise<T>)[]){
 const binding=bindings.get(target);if(!binding||binding.db!==db||binding.parallelReads||!reads.length||reads.length>8||reads.some(read=>typeof read!=='function'))throw Error('Bounded genuine recovery read group required');
 const work=[...reads];binding.parallelReads=true;
 let drained:Promise<PromiseSettledResult<T>[]>|undefined;
 try{
  await requireLockedWorkRecoveryConnection(db,target,binding.scope);
  await db.query("SET LOCAL lock_timeout='2000ms'; SET LOCAL statement_timeout='5000ms'");
  const workers=work.map(read=>Promise.resolve().then(()=>{binding.signal.throwIfAborted();return read();}).catch(error=>{binding.abort(error);throw error;}));
  drained=Promise.allSettled(workers);binding.drains.add(drained);
  const results=await drained;const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;return Object.freeze(results.map(result=>(result as PromiseFulfilledResult<T>).value));
 }finally{if(drained)binding.drains.delete(drained);binding.parallelReads=false;}
}
/** An individual owner read cannot outlive its original deadline. Timeout aborts
 * the whole genuine writer; the transport rolls back and cleans independently. */
export async function withWorkRecoveryReadDeadline<T>(db:Client,target:LockedWorkRecoveryTarget,readSignal:AbortSignal,run:(signal:AbortSignal)=>Promise<T>){
 const binding=bindings.get(target);if(!binding||binding.db!==db)throw Error('Actual active work recovery read target required');
 const signal=AbortSignal.any([binding.signal,readSignal]),abort=()=>binding.abort(signal.reason??Error('Work recovery read deadline ended'));
 signal.addEventListener('abort',abort,{once:true});
 try{if(signal.aborted)abort();signal.throwIfAborted();return await run(signal);}finally{signal.removeEventListener('abort',abort);}
}
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
 // One static simple-query batch preserves the transaction probe and limits.
 // SAVEPOINT fails first outside a transaction; any statement error propagates.
 const timeouts=binding.parallelReads?"SET LOCAL lock_timeout='2000ms'; SET LOCAL statement_timeout='5000ms'":"SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'";
 const configuration=await db.query("SAVEPOINT locked_work_recovery_target; RELEASE SAVEPOINT locked_work_recovery_target; "+timeouts+(!binding.decision?"; SET LOCAL transaction_timeout='60s'":"")+"; SELECT current_setting('transaction_isolation') AS isolation") as unknown as import('pg').QueryResult[];
 if(!Array.isArray(configuration)||configuration.length!==(binding.decision?5:6)||configuration.at(-1)?.command!=='SELECT'||configuration.at(-1)?.rows.length!==1||configuration.at(-1)?.rows[0]?.isolation!=='read committed')throw Error('Work recovery requires read committed decision isolation');
 await db.query(`WITH control_fence AS MATERIALIZED(SELECT pg_advisory_xact_lock(hashtextextended($1,16020))),
 io_fence AS MATERIALIZED(SELECT pg_advisory_xact_lock(hashtextextended($1,16017)) FROM control_fence) SELECT * FROM io_fence`,[scope.environmentId]);
 // A separate statement takes its READ COMMITTED snapshot after both fences.
 const rows=(await db.query(`SELECT current_database() AS name,current_user AS role,e.environment_id,e.schema_version,c.mode,c.recovery_id,c.revision,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner
 FROM turas_environment e JOIN operations_control c USING(environment_id) FOR SHARE OF e,c`)).rows,row=rows[0];
 if(rows.length!==1||row.name!==binding.databaseName||row.role!==binding.ownerRole||row.owner!==true||row.environment_id!==scope.environmentId||Number(row.schema_version)!==CURRENT_SCHEMA_VERSION||row.mode!=='locked'||row.recovery_id!==scope.recoveryId||Number(row.revision)!==scope.controlRevision)throw Error('Exact locked work recovery owner required');
 await requireRetiredLegacyWorkRuntime(db);binding.signal.throwIfAborted();
 return target;
}
/** Platform-bound owner transport only. The target is usable solely during run;
 * no JSON flags, caller-created client or owned Docker guard exemption is accepted.
 * Caller must retire its probes before returning; full service is not certified. */
export type LockedWorkRecoveryInput={sourceFile:string;hostedScope:PilotHostedScope;scope:Scope;runtimeConnection:string;deadline:number;signal:AbortSignal};
export function withLockedWorkRecoveryTarget<T>(input:LockedWorkRecoveryInput,run:(db:Client,target:LockedWorkRecoveryTarget)=>Promise<T>){return withWorkRecoveryTransport(input,run,false);}
/** Private producer transport: callback receives query-only, transaction-guarded
 * owner IO. Complete pending verification commits only after final live checks.
 * This constructor alone never establishes service health or opens admission. */
export function withLockedWorkRecoveryDecision<T>(input:LockedWorkRecoveryInput,run:(db:Client,target:LockedWorkRecoveryTarget)=>Promise<T>){return withWorkRecoveryTransport(input,run,true);}
function withWorkRecoveryTransport<T>(input:LockedWorkRecoveryInput,run:(db:Client,target:LockedWorkRecoveryTarget)=>Promise<T>,decision:boolean){
 return withRecoveryMeasurementTransport(input,decision,lane=>runWorkRecoveryTransport(input,run,decision,lane));
}
async function runWorkRecoveryTransport<T>(input:LockedWorkRecoveryInput,run:(db:Client,target:LockedWorkRecoveryTarget)=>Promise<T>,decision:boolean,lane:ReturnType<typeof claimRecoveryMeasurementLane>){
 const hosted=pilotHostedScopeSchema.parse(input.hostedScope),scope=scopeSchema.parse(input.scope),file=resolve(input.sourceFile);
 if(!Number.isSafeInteger(input.deadline)||input.deadline<=Date.now()||input.deadline>Date.now()+300000||hosted.environmentMarker!==scope.environmentId)throw Error('Finite exact work recovery scope required');
 const connectionLost=new AbortController(),signal=AbortSignal.any([input.signal,AbortSignal.timeout(input.deadline-Date.now()),connectionLost.signal]);signal.throwIfAborted();
 const source=databaseSafetyCaptureSourceSchema.parse(await readEvidence(dirname(file),basename(file))),owner=directConnection(source.databaseUrl),runtime=directConnection(input.runtimeConnection,'turas_runtime_016');
 if(source.schemaVersion!==CURRENT_SCHEMA_VERSION||source.projectId!==hosted.projectId||source.target!==hosted.target||source.environmentId!==scope.environmentId||databaseTargetDigest(owner.href,scope.environmentId)!==databaseTargetDigest(runtime.href,scope.environmentId))throw Error('Work recovery platform and runtime target differ');
 await requireSource(hosted);const platform=await verifyDatabaseSafetySourceBinding(source,hosted.teamId,signal),deployed=await deployment(hosted,signal,false);
 if(JSON.stringify(await deployment(hosted,signal,true))!==JSON.stringify(deployed))throw Error('Work recovery serving deployment differs');
 const db=new Client({connectionString:owner.href,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:11000,pipeline:true});
 db.on('error',error=>{connectionLost.abort(error);failRecoveryMeasurementLane(lane,error);});
 const exposed=decision?Object.freeze({query:(...args:unknown[])=>{
  // Never hand pg a caller-owned query config: submit hooks and text getters
  // can bypass SQL validation or receive the raw transaction connection.
  if(args.length<1||args.length>2||typeof args[0]!=='string'||(args.length===2&&!Array.isArray(args[1])))throw Error('Explicit recovery decision SQL string and parameters required');
  assertRecoveryDecisionSql(args[0]);return db.query(args[0],args[1] as unknown[]|undefined);
 }}) as unknown as Client:db;
 const target:LockedWorkRecoveryTarget=Object.freeze({contract:'pilot-locked-work-recovery-target-v1',...scope,projectId:hosted.projectId,teamId:hosted.teamId,sourceCommit:hosted.sourceCommit,sourceDigest:hosted.sourceDigest,catalogDigest:hosted.catalogDigest,origin:hosted.origin,deploymentId:hosted.deploymentId,databaseBindingDigest:databaseTargetDigest(runtime.href,scope.environmentId),deadline:input.deadline});
 let failure:unknown;
 try{
  await db.connect();if(decision)await db.query('SET standard_conforming_strings=on');const binding:Binding={db:exposed,scope,databaseName:decodeURIComponent(owner.pathname.slice(1)),ownerRole:decodeURIComponent(owner.username),runtimeConnection:runtime.href,signal,decision,parallelReads:false,drains:new Set(),abort:reason=>{connectionLost.abort(reason);failRecoveryMeasurementLane(lane,reason);},lane};bindings.set(target,binding);if(decision)decisionClients.set(exposed,binding);
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{await requireLockedWorkRecoveryConnection(exposed,target,scope);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
  // Authenticate the exact runtime credential without invoking domain work.
  const probe=new Client({connectionString:runtime.href,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});
  probe.on('error',error=>{connectionLost.abort(error);failRecoveryMeasurementLane(lane,error);});
  try{await probe.connect();const rows=(await probe.query('SELECT current_database() AS name,current_user AS role,session_user AS session_role,environment_id,schema_version FROM turas_environment')).rows;if(rows.length!==1||rows[0].name!==decodeURIComponent(owner.pathname.slice(1))||rows[0].role!=='turas_runtime_016'||rows[0].session_role!=='turas_runtime_016'||rows[0].environment_id!==scope.environmentId||Number(rows[0].schema_version)!==CURRENT_SCHEMA_VERSION)throw Error('Actual work recovery runtime differs');}finally{await probe.end();}
  await prepareRecoveryMeasurementLane(lane,exposed,target);
  let decisionTransaction:string|undefined;if(decision){await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');await db.query("SELECT set_config('transaction_timeout',$1,true)",[Math.max(1,input.deadline-Date.now())+'ms']);await requireLockedWorkRecoveryConnection(exposed,target,scope);decisionTransaction=String((await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id);binding.decisionTransaction=decisionTransaction;}
  let abort:()=>void=()=>{};
  const cancellation=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason??Error('Work recovery cancelled'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  const callback=Promise.resolve().then(()=>run(exposed,target)),drain=callback.then(()=>undefined,()=>undefined);binding.drains.add(drain);void drain.then(()=>binding.drains.delete(drain));
  let result:T;try{result=await Promise.race([callback,cancellation]);}finally{signal.removeEventListener('abort',abort);}
  signal.throwIfAborted();if(decision){await db.query('SAVEPOINT recovery_decision_control');await db.query('RELEASE SAVEPOINT recovery_decision_control');if(String((await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id)!==decisionTransaction)throw Error('Original recovery decision transaction required');}else await db.query('ROLLBACK');
  const registered=pending.get(target)??[];if(registered.length&&(await db.query('SELECT 1 FROM login_sessions WHERE id=ANY($1::uuid[]) AND revoked_at IS NULL LIMIT 1',[registered.map(intent=>intent.sessionId)])).rowCount)throw Error('Work recovery session retirement incomplete');
  if(registered.length&&(await db.query('SELECT 1 FROM operations_recovery_http_reads WHERE id=ANY($1::uuid[]) AND revoked_at IS NULL LIMIT 1',[registered.map(intent=>intent.admissionId)])).rowCount)throw Error('Work recovery admission retirement incomplete');
  if(registered.some(intent=>intent.mcp)&&(await db.query('SELECT 1 FROM mcp_connections WHERE id=ANY($1::uuid[]) AND (revoked_at IS NULL OR credential_hash IS NOT NULL) LIMIT 1',[registered.flatMap(intent=>intent.mcp?[intent.mcp.connectionId]:[])])).rowCount)throw Error('Work recovery MCP probe retirement incomplete');
  await retireRecoveryMeasurementLane(lane);signal.throwIfAborted();
  if(!decision)await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{await requireLockedWorkRecoveryConnection(exposed,target,scope);if((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.environment_id=$1 AND a.recovery_id=$2 AND a.control_revision=$3 AND (a.revoked_at IS NULL OR s.revoked_at IS NULL) LIMIT 1',[scope.environmentId,scope.recoveryId,scope.controlRevision])).rowCount)throw Error('Work recovery probe retirement incomplete');if(!decision)await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
  if((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.environment_id=$1 AND a.recovery_id=$2 AND a.control_revision=$3 AND a.mcp_probe_connection AND (mc.revoked_at IS NULL OR mc.credential_hash IS NOT NULL) LIMIT 1',[scope.environmentId,scope.recoveryId,scope.controlRevision])).rowCount)throw Error('Work recovery durable MCP probe retirement incomplete');
  await requireSource(hosted);if(JSON.stringify(await verifyDatabaseSafetySourceBinding(source,hosted.teamId,signal))!==JSON.stringify(platform)||JSON.stringify(await deployment(hosted,signal,false))!==JSON.stringify(deployed)||JSON.stringify(await deployment(hosted,signal,true))!==JSON.stringify(deployed))throw Error('Work recovery platform changed');
  signal.throwIfAborted();if(decision)await db.query('COMMIT');
  return result;
 }catch(error){failure=error;failRecoveryMeasurementLane(lane,error);throw error;}finally{
  const finalBinding=bindings.get(target);bindings.delete(target);decisionClients.delete(exposed);const retirementErrors:unknown[]=[];
  // Close the original writer before reconciling ambiguous effects. A callback
  // that outlives cancellation cannot enqueue later writes on this connection.
  // pg pipeline end() intentionally drains submitted queries. Cancellation
  // must instead terminate this writer immediately so pending SQL cannot run
  // beyond the read deadline or delay rollback and independent retirement.
  if(failure||signal.aborted)db.connection.stream.destroy();
  try{await db.end();}catch(error){retirementErrors.push(error);}
  if(finalBinding?.drains.size){let timer:ReturnType<typeof setTimeout>|undefined;try{
   const drained=await Promise.race([Promise.allSettled([...finalBinding.drains]).then(()=>true),new Promise<false>(done=>{timer=setTimeout(()=>done(false),10000);})]);
   if(!drained)retirementErrors.push(Error('Recovery canonical read group did not drain within its read bound'));
  }finally{if(timer)clearTimeout(timer);}}
  try{await retireWorkRecoveryProbes(target,async()=>{const cleanup=new Client({connectionString:owner.href,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});cleanup.on('error',error=>retirementErrors.push(error));try{await cleanup.connect();const identity=(await cleanup.query('SELECT current_database() AS name,current_user AS role')).rows[0];if(identity?.name!==decodeURIComponent(owner.pathname.slice(1))||identity.role!==decodeURIComponent(owner.username))throw Error('Exact work recovery cleanup connection required');return cleanup;}catch(error){await cleanup.end();throw error;}});}
  catch(error){retirementErrors.push(error);}
  if(retirementErrors.length)throw new AggregateError([...(failure?[failure]:[]),...retirementErrors],'Work recovery and independent probe cleanup incomplete');
 }
}

/** Internal group preparation accepts only this module's still-active genuine
 * client/target/lane binding. An arbitrary callback or caller-created pg Client
 * cannot mark retained denials reconciled. No probe callback has run yet. */
export async function prepareBoundRecoveryMeasurementDenials(db:Client,target:LockedWorkRecoveryTarget,lane:ReturnType<typeof claimRecoveryMeasurementLane>,retained:RetainedWorkDenials){
 const binding=bindings.get(target);
 if(!lane||!binding||binding.db!==db||binding.lane!==lane||binding.decision)throw Error('Actual recovery measurement preparation owner required');
 await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{
  await requireLockedWorkRecoveryConnection(db,target,binding.scope);
  await reconcileAuthenticatedWorkCredentialDenialsInTransaction(db,retained,{...binding.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt});
  binding.signal.throwIfAborted();await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Reconcile once inside the genuine owner's still-open decision transaction.
 * Every later probe independently rechecks snapshot freshness and live policy;
 * this only avoids repeating the same deny writes between canonical chunks. */
export async function prepareWorkRecoveryDecisionDenials(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 const binding=bindings.get(target);
 if(!binding||binding.db!==db||!binding.decision||!binding.decisionTransaction||binding.parallelReads||binding.lane||binding.preparingDenials)throw Error('Actual recovery decision preparation owner required');
 const prepared=binding.preparedDenials;
 if(!prepared){if(binding.probeIssuances)throw Error('Recovery probe issuance is in progress');binding.preparingDenials=true;}
 try{
 await requireLockedWorkRecoveryConnection(db,target,binding.scope);
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 if(String((await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id)!==binding.decisionTransaction)throw Error('Original recovery decision transaction required');
 if(binding.preparedDenials){if(binding.preparedDenials!==retained)throw Error('Exact pre-reconciled decision denial authority required');return;}
 const registered=pending.get(target)??[];
 if(registered.length&&(await db.query('SELECT 1 FROM login_sessions WHERE id=ANY($1::uuid[]) AND revoked_at IS NULL LIMIT 1',[registered.map(intent=>intent.sessionId)])).rowCount)throw Error('Retire decision probes before denial preparation');
 await reconcileAuthenticatedWorkCredentialDenialsInTransaction(db,retained,{...binding.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt});
 binding.signal.throwIfAborted();
 if(String((await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id)!==binding.decisionTransaction)throw Error('Original recovery decision transaction required');
 binding.preparedDenials=retained;
 }finally{if(!prepared)binding.preparingDenials=false;}
}

/** Hold the private exclusion through session, MCP connection and admission
 * insertion. Nested issuance helpers share the same owner counter. */
export async function withWorkRecoveryProbeIssuance<T>(db:Client,target:LockedWorkRecoveryTarget,run:()=>Promise<T>){
 const binding=bindings.get(target);
 if(!binding||binding.db!==db)throw Error('Actual active locked work recovery target required');
 if(binding.parallelReads||binding.preparingDenials)throw Error('Recovery denial preparation excludes probe issuance');
 binding.signal.throwIfAborted();binding.probeIssuances=(binding.probeIssuances??0)+1;
 try{return await run();}finally{binding.probeIssuances!--;}
}

const mcpProbeScopeSchema=z.strictObject({categories:mcpCreateConnectionSchema.shape.categories,customerIds:mcpCreateConnectionSchema.shape.customerIds,expiresAt:z.iso.datetime({offset:true})}).refine(mcpConnectionScopeAllowed,'Customer categories require selected customers');
const mcpProbeIdentitySchema=z.strictObject({...mcpProbeScopeSchema.shape,connectionId:z.uuid(),scopeDigest:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.iso.datetime({offset:true}),denialDigest:z.string().regex(/^[a-f0-9]{64}$/)}).refine(mcpConnectionScopeAllowed,'Customer categories require selected customers');
type McpProbeScope=z.infer<typeof mcpProbeScopeSchema>;
type McpProbe=Readonly<z.infer<typeof mcpProbeIdentitySchema>&{credential:string}>;
type Intent=Readonly<{principalId:string;sessionId:string;admissionId:string;workspaceId:string;membershipId:string;journalDirectory:string;sessionToken:string;admissionSecret:string;sourceCommit:string;origin:string;deploymentId:string;databaseBindingDigest:string;mcp?:McpProbe}>;
const pending=new WeakMap<object,Intent[]>();
const secretHash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Persist exact identities before either session/admission INSERT. Secrets stay
 * in a separate private credential file and never enter ordinary receipts. The enclosing target owns independent finally cleanup of these IDs. */
export async function reserveWorkRecoveryProbe(db:Client,target:LockedWorkRecoveryTarget,input:{workspaceId:string;membershipId:string;journalDirectory:string;mcp?:McpProbeScope&{retained:RetainedWorkDenials}}){
 return withWorkRecoveryProbeIssuance(db,target,async()=>{
 const workspaceId=z.uuid().parse(input.workspaceId),membershipId=z.uuid().parse(input.membershipId);
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 if((await db.query('SELECT 1 FROM operations_recovery_verifications WHERE environment_id=$1 AND recovery_id=$2 AND control_revision=$3 LIMIT 1',[target.environmentId,target.recoveryId,target.controlRevision])).rowCount)throw Error('Committed recovery verification requires read-only acknowledgement reconciliation before new probes');
 let mcp:McpProbe|undefined;
 if(input.mcp){
  const {retained,...raw}=input.mcp,scope=mcpProbeScopeSchema.parse(raw);
  const lane=bindings.get(target)!.lane;
  if(lane){
   // The full deny-only transaction completed before ANY group probe existed.
   // Repeating it here would revoke neighboring newly issued probe credentials.
   if(preparedRecoveryMeasurementDenials(lane)!==retained)throw Error('Exact pre-reconciled group denial authority required');
   requireAuthenticatedRetainedDenials(retained,target.environmentId);
  }else if(bindings.get(target)!.preparedDenials){
   await prepareWorkRecoveryDecisionDenials(db,target,retained);
  }else await reconcileAuthenticatedWorkCredentialDenialsInTransaction(db,retained,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt});
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date,hostNow=Date.now(),requestedExpiry=Date.parse(scope.expiresAt);
  if(requestedExpiry<=hostNow||requestedExpiry>hostNow+59000||requestedExpiry>target.deadline)throw Error('Finite fresh work MCP probe lifetime required');
  // Different host/database clocks may only shorten the requested lifetime.
  // Neither clock nor the original target can admit a longer credential.
  const expiry=Math.min(requestedExpiry,now.getTime()+59000);
  if(expiry<=Math.max(hostNow,now.getTime())||expiry>now.getTime()+59000||expiry>target.deadline)throw Error('Finite fresh work MCP probe lifetime required');
  Object.freeze(scope.categories);Object.freeze(scope.customerIds);const credential=newMcpCredential();mcp=Object.freeze({...scope,expiresAt:new Date(expiry).toISOString(),connectionId:credential.id,credential:credential.credential,scopeDigest:mcpCredentialScopeDigest(scope.categories,scope.customerIds),createdAt:now.toISOString(),denialDigest:retained.contextDigest});
 }
 const rows=(await db.query(`SELECT m.id,m.principal_id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.id=$1 AND m.workspace_id=$2 AND m.active AND p.active AND w.active AND ((p.id=$3 AND p.login_name='mcteer' AND m.kind='internal' AND m.role='admin') OR (p.id=$5 AND p.login_name='panel' AND m.kind='internal') OR (p.id=$6 AND p.login_name='partner' AND m.kind='partner' AND EXISTS(SELECT 1 FROM partner_organizations o WHERE o.id=m.partner_org_id AND o.workspace_id=m.workspace_id AND o.active)))
 AND (w.classification='primary' OR (w.classification='synthetic_pilot' AND w.pilot_environment_id=$4)) FOR SHARE OF m,p,w`,[membershipId,workspaceId,DEMO_IDS.mcteer,target.environmentId,DEMO_IDS.panel,DEMO_IDS.partner])).rows;
 if(rows.length!==1)throw Error('Exact configured work recovery probe owner required');
 let intents=pending.get(target);if(!intents){intents=[];pending.set(target,intents);}if(intents.length>=32)throw Error('Work recovery probe inventory exceeds bound');
 reserveRecoveryMeasurementSlot(bindings.get(target)!.lane);
 const intent=Object.freeze({principalId:rows[0].principal_id as string,sessionId:randomUUID(),admissionId:randomUUID(),workspaceId,membershipId,journalDirectory:input.journalDirectory,sessionToken:randomBytes(32).toString('base64url'),admissionSecret:randomBytes(32).toString('base64url'),sourceCommit:target.sourceCommit,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest,...(mcp?{mcp}:{})});
 intents.push(intent);
 try{const credentialDigest=await writeEvidence(input.journalDirectory,'private-probe-'+intent.sessionId+'-credentials.json',{contract:mcp?'pilot-work-recovery-probe-credentials-v2':'pilot-work-recovery-probe-credentials-v1',sessionId:intent.sessionId,admissionId:intent.admissionId,sessionToken:intent.sessionToken,admissionSecret:intent.admissionSecret,...(mcp?{mcpCredential:mcp.credential}:{})});
 const mcpIdentity=mcp?mcpProbeIdentitySchema.parse(Object.fromEntries(Object.keys(mcpProbeIdentitySchema.shape).map(key=>[key,mcp[key as keyof McpProbe]]))):undefined;
 await writeEvidence(input.journalDirectory,'probe-'+intent.sessionId+'-intent.json',{...target,contract:mcp?'pilot-work-recovery-probe-intent-v3':'pilot-work-recovery-probe-intent-v2',credentialDigest,sessionId:intent.sessionId,admissionId:intent.admissionId,principalId:intent.principalId,workspaceId,membershipId,...(mcpIdentity?{mcp:mcpIdentity}:{}),recordedAt:new Date().toISOString(),serviceOpened:false});
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});return intent;
 }catch(error){const index=intents.indexOf(intent);if(index>=0)intents.splice(index,1);throw error;}
 });
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
   if(marker.length!==1||marker[0].environment_id!==target.environmentId||Number(marker[0].schema_version)!==CURRENT_SCHEMA_VERSION||marker[0].owner!==true)throw Error('Exact work probe cleanup owner required');
   await revokeWorkRecoveryProbeIdentities(db,target,intents);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  for(const intent of intents){if(intent.mcp&&(await db.query('SELECT 1 FROM mcp_connections WHERE id=$1 AND (revoked_at IS NULL OR credential_hash IS NOT NULL)',[intent.mcp.connectionId])).rowCount)throw Error('Committed work MCP probe retirement unverified');if((await db.query('SELECT 1 FROM login_sessions WHERE id=$1 AND revoked_at IS NULL UNION ALL SELECT 1 FROM operations_recovery_http_reads WHERE id=$2 AND revoked_at IS NULL',[intent.sessionId,intent.admissionId])).rowCount)throw Error('Committed work recovery probe retirement unverified');await recordWorkRecoveryProbeRetirement(target,intent);}
  pending.delete(target);
 }finally{await db.end();}
}

async function revokeWorkRecoveryProbeIdentities(db:Client,target:LockedWorkRecoveryTarget,intents:readonly Intent[],apply=true){
 for(const intent of intents){
  const sessions=(await db.query('SELECT principal_id,membership_id,workspace_id,token_hash FROM login_sessions WHERE id=$1 FOR UPDATE',[intent.sessionId])).rows;
  if(sessions.length>1||sessions.some(row=>row.principal_id!==intent.principalId||row.membership_id!==intent.membershipId||row.workspace_id!==intent.workspaceId||row.token_hash!==secretHash(intent.sessionToken)))throw Error('Work recovery session cleanup identity differs');
  const admissions=(await db.query('SELECT environment_id,recovery_id,control_revision,session_id,workspace_id,secret_hash,source_commit,origin,deployment_id,database_binding_digest,read_kind,record_id,record_digest,mcp_probe_connection,mcp_credential_digest FROM operations_recovery_http_reads WHERE id=$1 FOR UPDATE',[intent.admissionId])).rows;
  if(admissions.length>1||admissions.some(row=>row.environment_id!==target.environmentId||row.recovery_id!==target.recoveryId||Number(row.control_revision)!==target.controlRevision||row.session_id!==intent.sessionId||row.workspace_id!==intent.workspaceId||row.secret_hash!==secretHash(intent.admissionSecret)||row.source_commit!==intent.sourceCommit||row.origin!==intent.origin||row.deployment_id!==intent.deploymentId||row.database_binding_digest!==intent.databaseBindingDigest))throw Error('Work recovery admission cleanup identity differs');
  if(intent.mcp&&admissions.some(row=>row.read_kind!=='mcp'||row.record_id!==intent.mcp!.connectionId||row.record_digest!==intent.mcp!.scopeDigest||row.mcp_probe_connection!==true||row.mcp_credential_digest!==secretHash(intent.mcp!.credential.split('.')[2])))throw Error('Work MCP admission cleanup identity differs');
  if(intent.mcp)await retireExactWorkMcpProbe(db,target,intent,apply);
  if(!apply)continue;
  await db.query('UPDATE operations_recovery_http_reads SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[intent.admissionId]);
  await db.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[intent.sessionId]);
  if((await db.query('SELECT 1 FROM login_sessions WHERE id=$1 AND revoked_at IS NULL UNION ALL SELECT 1 FROM operations_recovery_http_reads WHERE id=$2 AND revoked_at IS NULL',[intent.sessionId,intent.admissionId])).rowCount)throw Error('Work recovery credential retirement unverified');
 }
}
async function recordWorkRecoveryProbeRetirement(target:LockedWorkRecoveryTarget,intent:Intent){
 const name='probe-'+intent.sessionId+'-retired.json';
 try{await writeEvidence(intent.journalDirectory,name,{...target,contract:'pilot-work-recovery-probe-retirement-v1',sessionId:intent.sessionId,admissionId:intent.admissionId,completedAt:new Date().toISOString(),credentialsAbsentOrRevoked:true,...(intent.mcp?{mcpConnectionId:intent.mcp.connectionId}:{}),serviceOpened:false});}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const retained=z.object({contract:z.literal('pilot-work-recovery-probe-retirement-v1'),sessionId:z.literal(intent.sessionId),admissionId:z.literal(intent.admissionId),environmentId:z.literal(target.environmentId),recoveryId:z.literal(target.recoveryId),controlRevision:z.literal(target.controlRevision),databaseBindingDigest:z.literal(target.databaseBindingDigest),credentialsAbsentOrRevoked:z.literal(true)}).parse(await readEvidence(intent.journalDirectory,name));if(!retained)throw error;}
}
const probeJournalSchema=z.object({contract:z.enum(['pilot-work-recovery-probe-intent-v2','pilot-work-recovery-probe-intent-v3']),mcp:mcpProbeIdentitySchema.optional(),principalId:z.uuid().default(DEMO_IDS.mcteer),projectId:z.string(),teamId:z.string(),environmentId:z.string(),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),databaseBindingDigest:z.string().regex(/^[a-f0-9]{64}$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),origin:z.url(),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),sessionId:z.uuid(),admissionId:z.uuid(),workspaceId:z.uuid(),membershipId:z.uuid(),credentialDigest:z.string().regex(/^[a-f0-9]{64}$/)});
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
  if((row.contract==='pilot-work-recovery-probe-intent-v3')!==!!row.mcp)throw Error('Complete work MCP probe journal required');
  const credentials=z.strictObject({contract:z.enum(['pilot-work-recovery-probe-credentials-v1','pilot-work-recovery-probe-credentials-v2']),sessionId:z.literal(row.sessionId),admissionId:z.literal(row.admissionId),sessionToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/),admissionSecret:z.string().regex(/^[A-Za-z0-9_-]{43}$/),mcpCredential:mcpBearerSchema.optional()}).parse(await readEvidence(input.journalDirectory,'private-probe-'+row.sessionId+'-credentials.json',row.credentialDigest));
  if(!!row.mcp!==(credentials.contract==='pilot-work-recovery-probe-credentials-v2')||!!row.mcp!==!!credentials.mcpCredential||row.mcp&&!credentials.mcpCredential?.startsWith('tmcp.'+row.mcp.connectionId+'.'))throw Error('Original work MCP probe preimage required');
  intents.push(Object.freeze({principalId:row.principalId,sessionId:row.sessionId,admissionId:row.admissionId,workspaceId:row.workspaceId,membershipId:row.membershipId,journalDirectory:input.journalDirectory,sessionToken:credentials.sessionToken,admissionSecret:credentials.admissionSecret,sourceCommit:row.sourceCommit,origin:row.origin,deploymentId:row.deploymentId,databaseBindingDigest:row.databaseBindingDigest,...(row.mcp?{mcp:Object.freeze({...row.mcp,credential:credentials.mcpCredential!})}:{})}));
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

async function retireExactWorkMcpProbe(db:Client,target:LockedWorkRecoveryTarget,intent:Intent,apply:boolean){
 const expected=intent.mcp!;
 if(mcpCredentialScopeDigest(expected.categories,expected.customerIds)!==expected.scopeDigest||!expected.credential.startsWith('tmcp.'+expected.connectionId+'.'))throw Error('Work MCP probe scope or preimage differs');
 const rows=(await db.query('SELECT environment_id,workspace_id,principal_id,membership_id,categories,scope_digest,credential_hash,created_at,expires_at FROM mcp_connections WHERE id=$1 FOR UPDATE',[expected.connectionId])).rows;
 if(rows.length>1||rows.some(row=>row.environment_id!==target.environmentId||row.workspace_id!==intent.workspaceId||row.principal_id!==intent.principalId||row.membership_id!==intent.membershipId||JSON.stringify([...row.categories].sort())!==JSON.stringify([...expected.categories].sort())||row.scope_digest!==expected.scopeDigest||row.credential_hash!==null&&row.credential_hash!==secretHash(expected.credential.split('.')[2])||row.created_at.toISOString()!==expected.createdAt||row.expires_at.toISOString()!==expected.expiresAt))throw Error('Work MCP cleanup identity differs');
 if(rows.length){const customers=(await db.query('SELECT customer_id FROM mcp_connection_customers WHERE connection_id=$1 AND workspace_id=$2 ORDER BY customer_id',[expected.connectionId,intent.workspaceId])).rows.map(row=>row.customer_id);if(JSON.stringify(customers)!==JSON.stringify([...expected.customerIds].sort()))throw Error('Work MCP cleanup customer scope differs');}
 if(apply){await db.query('UPDATE mcp_connections SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoker_membership_id=COALESCE(revoker_membership_id,membership_id),credential_hash=NULL WHERE id=$1',[expected.connectionId]);if((await db.query('SELECT 1 FROM mcp_connections WHERE id=$1 AND (revoked_at IS NULL OR credential_hash IS NOT NULL)',[expected.connectionId])).rowCount)throw Error('Work MCP probe retirement unverified');}
}
/** In-process reservation only. The original constructor applied authenticated
 * current denials before selecting this live owner and generating new identities. */
export async function requireRegisteredWorkMcpProbe(db:Client,target:LockedWorkRecoveryTarget,intent:Intent){
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 if(!pending.get(target)?.includes(intent)||!intent.mcp||Date.parse(intent.mcp.expiresAt)<=Date.now()||Date.parse(intent.mcp.expiresAt)>target.deadline)throw Error('Actual current work MCP reservation required');return intent.mcp;
}
/** Retire only this target's original registered connection/session preimages;
 * expired probes remain cleanup candidates and cannot regain any authority. */
export async function retireRegisteredWorkMcpProbe(db:Client,target:LockedWorkRecoveryTarget,intent:Intent){
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 if(!pending.get(target)?.includes(intent)||!intent.mcp)throw Error('Actual work MCP retirement reservation required');
 await revokeWorkRecoveryProbeIdentities(db,target,[intent]);
}
