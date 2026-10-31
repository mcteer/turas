import type {Client} from 'pg';
import type {ServerConfig} from '../config';
import {createHash,randomUUID} from 'node:crypto';
import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {recoveryContentDigest} from './recovery-content';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {requireRetiredLegacyWorkRuntime,reconcileLockedWorkCredentialDenials} from './recovery-credential-denials';
import {auditRecoveredRequestFences} from './recovery-replay-audit';
import {recoveryLeasesOutstanding} from './recovery-drain';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {workCaptureCandidateSchema,type WorkCaptureCandidate} from '../../contracts/pilot-capture';
import {verifyRecoveryCandidate} from './candidate-verification';
import type {PrivateObjects} from '../storage/private-objects';
import {verifiedObjectInventory,activeObjectNamespaces} from '../storage/inventory';
import {WORK_BACKUP_LIMITS} from './work-backup-limits';
import {verifyProductionRecoveryObjects} from '../../../scripts/production-recovery-objects';
const need=(v:unknown)=>{if(!v)throw Error('Verified isolated Production recovery drill required');};
/** A dedicated verifier process must never leave ambient Source/local pool
 * fallbacks available to canonical domain reads. No environment file is edited. */
export function assertDrillRuntimeConfiguration(config:Pick<ServerConfig,'DATABASE_URL'|'DATABASE_URL_UNPOOLED'|'TURAS_ENVIRONMENT_ID'|'TURAS_APP_ORIGIN'>,selected:{runtimeConnection:string;environmentId:string;origin:string;processEnvironmentId:string|undefined}){
 need(config.DATABASE_URL===selected.runtimeConnection&&config.DATABASE_URL_UNPOOLED===selected.runtimeConnection&&config.TURAS_ENVIRONMENT_ID===selected.environmentId&&selected.processEnvironmentId===selected.environmentId&&config.TURAS_APP_ORIGIN===selected.origin);
}
export type DrillDatabaseIdentity={environmentId:string;schemaVersion:number;databaseName:string;systemIdentifier:string;timelineId:string|null;ownerRole:string;owner:boolean;mode:string;revision:number;recoveryId:string|null;at:string};
export async function readDrillDatabaseIdentity(db:Client):Promise<DrillDatabaseIdentity>{
 const rows=(await db.query(`SELECT e.environment_id,e.schema_version,current_database() AS database_name,(pg_control_system()).system_identifier::text AS system_identifier,current_setting('neon.timeline_id',true) AS timeline_id,current_user AS owner_role,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner,c.mode,c.revision,c.recovery_id,clock_timestamp() AS now FROM turas_environment e JOIN operations_control c USING(environment_id)`)).rows;
 need(rows.length===1);const row=rows[0];return {environmentId:row.environment_id,schemaVersion:Number(row.schema_version),databaseName:row.database_name,systemIdentifier:row.system_identifier,timelineId:row.timeline_id||null,ownerRole:row.owner_role,owner:row.owner,mode:row.mode,revision:Number(row.revision),recoveryId:row.recovery_id,at:row.now.toISOString()};
}
export type DrillBranchObservation={projectId:string;branchId:string;endpointId:string;host:string;createdAt:string;name:string};
const branchProofs=new WeakSet<object>();
/** Only an actual bounded official readback can brand a branch observation. */
export async function observeDrillBranch(input:{projectId:string;branchId:string;endpointId:string;targetConnection:string;sourceConnection:string;drillId:string;startedAt:string},signal:AbortSignal){
 const token=process.env.NEON_API_KEY;need(token);const get=async(path:string)=>{
  const r=await fetch('https://console.neon.tech/api/v2/projects/'+input.projectId+path,{headers:{authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});need(r.status===200);need(r.body);const reader=r.body!.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;need(size<=1048576);chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 };
 const {branch}=await get('/branches/'+input.branchId),{endpoint}=await get('/endpoints/'+input.endpointId);
 const observation={projectId:branch.project_id,branchId:branch.id,endpointId:endpoint.id,host:endpoint.host,createdAt:branch.created_at,name:branch.name};
 need(branch.project_id===input.projectId&&endpoint.project_id===input.projectId&&endpoint.branch_id===branch.id&&endpoint.type==='read_write');
 assertDrillIsolation(input,observation);branchProofs.add(observation);return Object.freeze(observation);
}
/** Pure identity/chronology guard. A caller-supplied success flag grants nothing. */
export function assertDrillIsolation(input:{targetConnection:string;sourceConnection:string;drillId:string;startedAt:string;branchId:string;endpointId:string},branch:DrillBranchObservation){
 const source=new URL(input.sourceConnection),target=new URL(input.targetConnection),start=Date.parse(input.startedAt),created=Date.parse(branch.createdAt);
 need(target.hostname.endsWith('.neon.tech')&&source.hostname.endsWith('.neon.tech')&&source.hostname!==target.hostname&&target.hostname===branch.host&&source.protocol===target.protocol&&['postgres:','postgresql:'].includes(target.protocol)&&target.searchParams.get('sslmode')==='verify-full');
 need(branch.branchId===input.branchId&&branch.endpointId===input.endpointId&&branch.name==='turas-recovery-drill-'+input.drillId&&Number.isFinite(start)&&Number.isFinite(created)&&created>=start&&created<=Date.now());
}
const archives=new WeakMap<object,string>();
export type DrillArchiveProof=Readonly<{candidate:WorkCaptureCandidate;bundleDigest:string}>;
/** The target admission consumes an in-memory proof from real authenticated cold
 * bytes, never a serialized passed/integrity boolean or a mutable candidate DTO. */
export async function authenticateDrillArchive(input:{candidate:unknown;bundle:string;keyFile:string;signal:AbortSignal}):Promise<DrillArchiveProof>{
 const candidate=workCaptureCandidateSchema.parse(input.candidate);await verifyRecoveryCandidate({...input,candidate,environmentId:candidate.environmentId});
 const proof=Object.freeze({candidate,bundleDigest:candidate.encryptedBundle.digest});archives.set(proof,recoveryDigest(candidate));return proof;
}
function requireDrillArchive(proof:DrillArchiveProof){const digest=archives.get(proof);need(typeof digest==='string'&&digest===recoveryDigest(proof.candidate));return proof.candidate;}
const objectProofs=new WeakMap<object,{db:Client;candidateDigest:string}>();
export async function measureDrillObjects(db:Client,archive:DrillArchiveProof,store:PrivateObjects,signal:AbortSignal){
 const candidate=requireDrillArchive(archive),physical=await verifiedObjectInventory(store,candidate.environmentId,activeObjectNamespaces,signal,{maximumObjects:256,maximumBytes:WORK_BACKUP_LIMITS.objectBytes});
 need(physical.digest===candidate.objects.inventoryDigest&&physical.objects.length===candidate.objects.objectCount);
 const verified=await verifyProductionRecoveryObjects(db,candidate,store,signal),proof=Object.freeze({...verified,inventoryDigest:physical.digest,measuredAt:new Date().toISOString()});
 objectProofs.set(proof,{db,candidateDigest:recoveryDigest(candidate)});return proof;
}
const proofs=new WeakMap<object,{db:Client;branch:DrillBranchObservation;state:DrillDatabaseIdentity;denials:RetainedWorkDenials}>();
/** Root first restores cold bytes with the runtime closed and locks ONLY the
 * isolated target through normal control transitions. This never touches Source. */
export async function verifyClosedDrillDatabase(db:Client,input:{branch:DrillBranchObservation;drillId:string;archive:DrillArchiveProof;objects:Awaited<ReturnType<typeof measureDrillObjects>>;denials:RetainedWorkDenials}){
 const candidate=requireDrillArchive(input.archive),objects=objectProofs.get(input.objects);need(objects?.db===db&&objects.candidateDigest===recoveryDigest(candidate)&&Date.now()-Date.parse(input.objects.measuredAt)<=900000);need(branchProofs.has(input.branch)&&(db as any).connectionParameters.host===input.branch.host);requireAuthenticatedRetainedDenials(input.denials,candidate.environmentId);
 await db.query('BEGIN');let initial:DrillDatabaseIdentity,grants:string;
 try{
  initial=await readDrillDatabaseIdentity(db);need(initial.owner&&initial.environmentId===candidate.environmentId&&initial.schemaVersion===CURRENT_SCHEMA_VERSION&&initial.databaseName===candidate.sourceDatabaseName&&initial.mode==='locked'&&initial.recoveryId===input.drillId);
  await requireClosedDrillRuntime(db);need(await recoveryContentDigest(db)===candidate.acceptedContentDigest);
  const ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;need(recoveryDigest(ledger)===candidate.ledgerDigest);grants=await recoveryGrantCheckpoint(db);await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
 const scope={environmentId:initial!.environmentId,recoveryId:input.drillId,controlRevision:initial!.revision,snapshotDigest:input.denials.contextDigest,backupCapturedAt:candidate.capturedAt};
 const denials=await reconcileLockedWorkCredentialDenials(db,input.denials,scope,{databaseName:initial!.databaseName,ownerRole:initial!.ownerRole});
 const replay=await auditRecoveredRequestFences(db,input.denials.snapshot,scope);
 await db.query('BEGIN');let reconciledStateDigest:string;try{reconciledStateDigest=await currentRecoveryStateDigest(db);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
 const proof=Object.freeze({reconciledStateDigest:reconciledStateDigest!,contract:'production-isolated-drill-database-v1' as const,candidateId:candidate.id,bundleDigest:candidate.encryptedBundle.digest,initial:initial!,objects:{captured:input.objects.capturedObjectCount,required:input.objects.requiredObjectCount,verified:input.objects.verifiedObjectCount,inventoryDigest:input.objects.inventoryDigest},targetGrantsDigest:grants!,denialSnapshotDigest:input.denials.contextDigest,denials,replay,fullFailoverVerified:false as const});
 proofs.set(proof,{db,branch:input.branch,state:initial!,denials:input.denials});return proof;
}
export async function requireClosedDrillRuntime(db:Client){
 await requireRetiredLegacyWorkRuntime(db);
 const roles=(await db.query(`SELECT (r.rolvaliduntil IS NULL OR r.rolvaliduntil>clock_timestamp()) AS not_expired,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,pg_has_role(r.oid,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS owner_membership,EXISTS(SELECT 1 FROM pg_roles n WHERE n.rolname='neon_superuser' AND pg_has_role(r.oid,n.oid,'MEMBER')) AS administrative_membership FROM pg_roles r WHERE r.rolname='turas_runtime_016'`)).rows;
 need(roles.length===1&&roles[0].not_expired&&!roles[0].rolcanlogin&&!roles[0].rolsuper&&!roles[0].rolcreatedb&&!roles[0].rolcreaterole&&!roles[0].rolreplication&&!roles[0].rolbypassrls&&!roles[0].owner_membership&&!roles[0].administrative_membership);
 need(!(await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename IN('turas_runtime','turas_runtime_016')")).rowCount);
 need((await db.query("SELECT has_table_privilege('turas_runtime_016','operations_control','UPDATE') AS can_open")).rows[0]?.can_open===false);
}
/** Explicit owner admission of this fresh isolated drill only. It is NOT the
 * incident/failover unlock path and creates no full-recovery verification row. */
export async function admitVerifiedIsolatedDrill(db:Client,proof:Awaited<ReturnType<typeof verifyClosedDrillDatabase>>){
 const actual=proofs.get(proof);need(actual?.db===db&&branchProofs.has(actual.branch));requireAuthenticatedRetainedDenials(actual!.denials,actual!.state.environmentId);
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[actual!.state.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[actual!.state.environmentId]);
  const current=await readDrillDatabaseIdentity(db);need(current.owner&&current.systemIdentifier===actual!.state.systemIdentifier&&current.databaseName===actual!.state.databaseName&&current.ownerRole===actual!.state.ownerRole&&current.mode==='locked'&&current.recoveryId===actual!.state.recoveryId&&current.revision===actual!.state.revision);
  await requireClosedDrillRuntime(db);need(await recoveryGrantCheckpoint(db)===proof.targetGrantsDigest&&await currentRecoveryStateDigest(db)===proof.reconciledStateDigest);need(!await recoveryLeasesOutstanding(db));
  const active=(await db.query(`SELECT EXISTS(SELECT 1 FROM operations_local_jobs WHERE state NOT IN('succeeded','failed','cancelled')) OR EXISTS(SELECT 1 FROM operations_hosted_jobs WHERE state NOT IN('succeeded','failed','cancelled')) OR EXISTS(SELECT 1 FROM response_attempts WHERE response_state IN('pending','dispatching','running','stopping')) OR EXISTS(SELECT 1 FROM report_deliveries WHERE state='dispatching') OR EXISTS(SELECT 1 FROM operations_recovery_quarantines q WHERE NOT EXISTS(SELECT 1 FROM operations_recovery_quarantine_resolutions r WHERE r.environment_id=q.environment_id AND r.recovery_id=q.recovery_id AND r.scope_kind=q.scope_kind)) AS active`)).rows[0]?.active;need(active===false);
  const operationId=randomUUID(),operationDigest=createHash('sha256').update(JSON.stringify({kind:'non-disruptive-isolated-drill',branch:actual!.branch,proof})).digest('hex'),revision=current.revision+1;
  await db.query('UPDATE operations_control SET mode=\'open\',revision=$2,owner_operation_digest=$3,verified_bundle_digest=$4,updated_at=clock_timestamp() WHERE environment_id=$1',[current.environmentId,revision,operationDigest,proof.bundleDigest]);
  await db.query("INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest,bundle_digest) VALUES($1,$2,'locked','open',$3,$4,$5,$6)",[operationId,current.environmentId,revision,current.recoveryId,operationDigest,proof.bundleDigest]);
  await db.query('ALTER ROLE turas_runtime_016 LOGIN');await db.query('COMMIT');return {operationId,operationDigest,revision,kind:'non-disruptive-isolated-drill' as const,fullFailoverVerified:false as const};
 }catch(error){await db.query('ROLLBACK');throw error;}
}

/** Deny-only compensation for a lost admission COMMIT acknowledgement. The
 * caller supplies the same measured target, never the live Source connection. */
export async function refenceDrillTarget(db:Client,expected:{environmentId:string;databaseName:string;systemIdentifier:string;host:string;drillId:string}){
 need((db as any).connectionParameters.host===expected.host);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[expected.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[expected.environmentId]);
  const state=await readDrillDatabaseIdentity(db);need(state.owner&&state.environmentId===expected.environmentId&&state.databaseName===expected.databaseName&&state.systemIdentifier===expected.systemIdentifier&&state.recoveryId===expected.drillId&&['open','locked'].includes(state.mode));
  let operationId:string|null=null;
  if(state.mode==='open'){
   operationId=randomUUID();const digest=recoveryDigest({kind:'isolated-drill-failure-refence',drillId:expected.drillId,operationId}),revision=state.revision+1;
   await db.query("UPDATE operations_control SET mode='locked',revision=$2,owner_operation_digest=$3,updated_at=clock_timestamp() WHERE environment_id=$1",[expected.environmentId,revision,digest]);
   await db.query("INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest,bundle_digest) SELECT $1,environment_id,'open','locked',revision,recovery_id,$2,verified_bundle_digest FROM operations_control WHERE environment_id=$3",[operationId,digest,expected.environmentId]);
  }
  await db.query('ALTER ROLE turas_runtime_016 NOLOGIN');await db.query('COMMIT');
  await db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='turas_runtime_016' AND pid<>pg_backend_pid()");
  const after=await readDrillDatabaseIdentity(db),role=(await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='turas_runtime_016'")).rows[0];
  need(after.mode==='locked'&&role?.rolcanlogin===false&&!(await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='turas_runtime_016'")).rowCount);
  return {targetRefenced:true as const,operationId,mode:'locked' as const,runtimeLogin:false as const};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
