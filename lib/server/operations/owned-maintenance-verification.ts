import {createHash,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {deriveOwnedMaintenanceInventory,deriveOwnedMaintenanceInventoryInTransaction,type OwnedMaintenanceRecord} from './owned-maintenance-inventory';
import {withOwnedRestoredRuntime,withOwnedRestoreTarget,requireOwnedRestoreConnection,type OwnedRestoreTarget} from './owned-restore-target';
import {prepareOwnedRecoveryApplication,warmOwnedRecoveryApplication,withOwnedRecoveryApplication,withOwnedRecoveryApplicationConfiguration,retireOwnedRecoveryApplication,type OwnedRecoveryApplication} from '../../../scripts/pilot-owned-recovery-application';
import {pilotSource} from '../../../scripts/pilot-source';
import {issueOwnedRecoveryHttpRead,retireOwnedRecoveryHttpRead} from './recovery-http-read-issuer';
import {withAuthenticatedOwnerRecoveryRead} from './authenticated-recovery-read';
import {readPlan} from '../plans/read';
import {acceptedPlanRecoveryDigest} from './recovery-plan-projection';
import {readProfile} from '../profiles/read';
import {recoveryDigest} from '../../contracts/pilot-recovery';

type Scope={environmentId:string;recoveryId:string;controlRevision:number};
export type OwnedMaintenanceVerification=Readonly<{contract:'pilot-owned-maintenance-verification-v1';environmentId:string;recoveryId:string;controlRevision:number;sourceCommit:string;sourceDigest:string;catalogDigest:string;inventoryDigest:string;verifiedRecords:number;verifiedOriginalBytes:number;physicalOnlyObjects:number;verifiedKinds:readonly string[];completedAt:string;maintenanceHttpVerified:true;probeRetirementVerified:true;currentAuthorityVerified:false;ordinaryServiceVerified:false;workflowReconciled:false;requiredScopeHealthy:false;restorationReady:false}>;
const proofs=new WeakMap<object,{target:OwnedRestoreTarget;scope:Scope}>();
const profileSchema=z.object({customer:z.object({id:z.uuid()}),contextVersion:z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative()]),acceptedFacts:z.array(z.record(z.string(),z.unknown())).max(500),workloads:z.array(z.object({id:z.uuid(),lifecycle:z.string()})).max(500)});
function profileProjection(value:unknown,record:OwnedMaintenanceRecord){
 const profile=profileSchema.parse(value);if(profile.customer.id!==record.customerId||String(profile.contextVersion)!==record.generation)throw Error('Maintenance profile identity or generation differs');
 const facts=profile.acceptedFacts.map((fact):Record<string,unknown>=>{z.uuid().parse(fact.id);const {quality,...rest}=fact;const stable=quality&&typeof quality==='object'&&!Array.isArray(quality)?Object.fromEntries(Object.entries(quality).filter(([key])=>!['asOf','validUntil'].includes(key))):quality;return {...rest,quality:stable};}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return recoveryDigest({customerId:profile.customer.id,contextVersion:String(profile.contextVersion),facts,workloads:profile.workloads.sort((a,b)=>a.id.localeCompare(b.id))});
}
function planProjection(value:unknown,record:OwnedMaintenanceRecord){
 return acceptedPlanRecoveryDigest(value,{planId:record.recordId,customerId:record.customerId!,revisionId:record.parentId!,generation:record.generation!});
}
function ordinaryPath(record:OwnedMaintenanceRecord){
 if(record.kind==='profile')return '/api/customers/'+record.customerId+'/profile';
 if(record.kind==='plan')return '/api/plans/'+record.recordId;
 if(record.kind==='artifact')return '/api/artifacts/'+record.recordId+'/original';
 if(record.kind==='report')return '/api/reports/artifacts/'+record.recordId;
 if(record.kind==='workforce')return '/api/staffing/imports/'+record.recordId+'/content';
 return '/api/product-gaps/reports/'+record.parentId+'/exports/'+record.recordId;
}
async function body(response:Response,maximum:number,signal:AbortSignal){
 const reader=response.body?.getReader();if(!reader)throw Error('Maintenance response body absent');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw Error('Maintenance response exceeds bound');chunks.push(next.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return Buffer.concat(chunks,size);
}
async function denied(application:OwnedRecoveryApplication,path:string,headers:Headers,statuses:readonly number[],signal:AbortSignal){
 const response=await fetch(application.origin+path,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
 await response.body?.cancel();if(!statuses.includes(response.status)||response.headers.get('x-turas-code-version')!==application.sourceCommit)throw Error('Maintenance denial or release differs');
}
async function retire(application:OwnedRecoveryApplication,admission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>){
 const signal=AbortSignal.timeout(20000);
 await withOwnedRecoveryApplicationConfiguration(application,signal,async db=>{
  const rows=(await db.query('SELECT session_id FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows;
  if(!rows.length&&!(await db.query('SELECT 1 FROM login_sessions WHERE id=$1',[admission.actor.sessionId])).rowCount)return;
  if(rows.length!==1||rows[0].session_id!==admission.actor.sessionId)throw Error('Maintenance probe identity retirement unavailable');
  await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);
  const closed=(await db.query('SELECT a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL AS closed FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.id=$1 AND s.id=$2',[admission.id,admission.actor.sessionId])).rows;
  if(closed.length!==1||closed[0].closed!==true)throw Error('Maintenance probe retirement unverified');
 });
}
async function readRecord(application:OwnedRecoveryApplication,record:OwnedMaintenanceRecord,input:{scope:Scope;password:string},deadline:number,signal:AbortSignal){
 let admission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
 try{
  await withOwnedRecoveryApplicationConfiguration(application,signal,async db=>{
   await db.query('BEGIN');try{
    admission=await issueOwnedRecoveryHttpRead(db as unknown as PoolClient,{...input.scope,workspaceId:record.workspaceId,customerId:record.customerId,deadline,password:input.password,maximumRequests:2,deploymentId:null,readKind:record.kind,...(record.kind==='profile'?{}:{recordId:record.recordId})});
    if(admission.actor.membershipId!==record.membershipId)throw Error('Maintenance owner membership differs');await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
  });
  if(!admission)throw Error('Actual maintenance HTTP admission absent');
  const owned=admission,path='/api/operations/recovery-read/'+owned.id+'/'+record.kind,headers=new Headers({cookie:'turas_session='+owned.actor.token,'x-turas-recovery-read':owned.secret});
  let canonical:string|undefined;
  if(record.kind==='profile')canonical=await withOwnedRecoveryApplicationConfiguration(application,signal,async db=>{
   await db.query('BEGIN');try{
    const profile=await withAuthenticatedOwnerRecoveryRead(db as unknown as PoolClient,{...input.scope,workspaceId:record.workspaceId,deadline,password:input.password},actor=>readProfile(actor,record.customerId!,db as unknown as PoolClient,undefined,undefined,false,true));
    const digest=profileProjection(profile,record);await db.query('COMMIT');return digest;
   }catch(error){await db.query('ROLLBACK');throw error;}
  });
  if(record.kind==='plan')canonical=await withOwnedRecoveryApplicationConfiguration(application,signal,async db=>{
   await db.query('BEGIN');try{
    const plan=await withAuthenticatedOwnerRecoveryRead(db as unknown as PoolClient,{...input.scope,workspaceId:record.workspaceId,deadline,password:input.password},actor=>readPlan(actor,record.recordId,record.parentId!,db as unknown as PoolClient));
    const digest=planProjection(plan,record);await db.query('COMMIT');return digest;
   }catch(error){await db.query('ROLLBACK');throw error;}
  });
  const foreign=new Headers(headers);foreign.set('cookie','turas_session='+randomBytes(32).toString('base64url'));
  await denied(application,path,foreign,[403],signal);
  await denied(application,'/api/operations/recovery-read/'+owned.id+'/'+(record.kind==='profile'?'artifact':'profile'),headers,[403],signal);
  await denied(application,ordinaryPath(record),headers,[401,403,503],signal);
  const response=await fetch(application.origin+path,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(response.status!==200||response.headers.get('x-turas-code-version')!==application.sourceCommit){await response.body?.cancel();throw Error('Maintenance positive read or release differs');}
  const bytes=await body(response,record.object?.sizeBytes??2097152,signal);
  if(record.kind==='profile'){
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Maintenance profile response type differs');
   const parsed=JSON.parse(bytes.toString()) as {data?:unknown};if(profileProjection(parsed.data,record)!==canonical)throw Error('Maintenance HTTP and canonical profile projections differ');
  }else if(record.kind==='plan'){
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Maintenance plan response type differs');
   const parsed=JSON.parse(bytes.toString()) as {data?:unknown};if(planProjection(parsed.data,record)!==canonical)throw Error('Maintenance HTTP and canonical accepted plan projections differ');
  }else{
   if(!record.object||bytes.length!==record.object.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==record.object.digest)throw Error('Maintenance original bytes differ');
   if(!/^attachment(?:;|$)/i.test(response.headers.get('content-disposition')??'')||response.headers.get('x-content-type-options')!=='nosniff')throw Error('Maintenance original response headers differ');
  }
  await retire(application,owned);await denied(application,path,headers,[403],signal);
  return record.object?.sizeBytes??0;
 }finally{if(admission)await retire(application,admission);}
}
async function requireRetiredMaintenanceRuntime(db:import('pg').Client,scope:Scope){
  if((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin UNION ALL SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rowCount)throw Error('Maintenance runtime retirement incomplete');
  if((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.environment_id=$1 AND a.recovery_id=$2 AND a.control_revision=$3 AND (a.revoked_at IS NULL OR s.revoked_at IS NULL)',[scope.environmentId,scope.recoveryId,scope.controlRevision])).rowCount)throw Error('Maintenance HTTP retirement incomplete');
}
/** Actual loopback HTTP only; no transport injection, supplied record inventory,
 * approval flag, model delivery or external execution. Full service stays false. */
export async function verifyOwnedMaintenanceRecovery(input:{target:OwnedRestoreTarget;scope:Scope;password:string;rendererImage:string;signal:AbortSignal;deadline:number}){
 input.signal.throwIfAborted();
 z.string().min(1).max(4096).parse(input.password);
 const inventory=await deriveOwnedMaintenanceInventory(input.target,input.scope,input.signal);
 if(!inventory.records.length)throw Error('No maintenance service records available');
 const application=await prepareOwnedRecoveryApplication({target:input.target,scope:input.scope,signal:input.signal,deadline:input.deadline,rendererImage:input.rendererImage});
 let bytes=0,verified=0,failure:unknown;
 try{
  await warmOwnedRecoveryApplication(application,input.signal);
  for(let offset=0;offset<inventory.records.length;offset+=4){
   input.signal.throwIfAborted();const deadline=Math.min(input.deadline,Date.now()+59000),batch=inventory.records.slice(offset,offset+4);
   await withOwnedRestoredRuntime(input.target,input.scope,input.signal,async(_runtime,signal,environment)=>withOwnedRecoveryApplication(application,environment,signal,async()=>{
    for(const record of batch){signal.throwIfAborted();bytes+=await readRecord(application,record,input,deadline,signal);verified++;}
   }));
  }
 }catch(error){failure=error;throw error;}finally{try{await retireOwnedRecoveryApplication(application);}catch(retirement){if(failure)throw new AggregateError([failure,retirement],'Maintenance verification and application retirement failed');throw retirement;}}
 const final=await deriveOwnedMaintenanceInventory(input.target,input.scope,input.signal);
 if(final.inventoryDigest!==inventory.inventoryDigest||verified!==inventory.records.length)throw Error('Maintenance coverage changed or incomplete');
 await withOwnedRestoreTarget(input.target,input.scope,input.signal,async db=>{
  await requireRetiredMaintenanceRuntime(db,input.scope);
 });
 const current=await pilotSource();if(current.sourceCommit!==application.sourceCommit||current.sourceDigest!==application.sourceDigest||current.catalogDigest!==application.catalogDigest)throw Error('Maintenance verification source changed');
 const proof:OwnedMaintenanceVerification=Object.freeze({contract:'pilot-owned-maintenance-verification-v1',...input.scope,sourceCommit:application.sourceCommit,sourceDigest:application.sourceDigest,catalogDigest:application.catalogDigest,inventoryDigest:inventory.inventoryDigest,verifiedRecords:verified,verifiedOriginalBytes:bytes,physicalOnlyObjects:inventory.physicalClassifications.filter(row=>row.classification!=='maintenance-candidate').length,verifiedKinds:Object.freeze([...new Set(inventory.records.map(row=>row.kind))].sort()),completedAt:new Date().toISOString(),maintenanceHttpVerified:true,probeRetirementVerified:true,currentAuthorityVerified:false,ordinaryServiceVerified:false,workflowReconciled:false,requiredScopeHealthy:false,restorationReady:false});
 proofs.set(proof,{target:input.target,scope:Object.freeze({...input.scope})});return proof;
}
export async function requireOwnedMaintenanceVerification(db:import('pg').Client,target:OwnedRestoreTarget,scope:Scope,proof:OwnedMaintenanceVerification,signal:AbortSignal){
 const actual=proofs.get(proof);if(!actual||actual.target!==target||recoveryDigest(actual.scope)!==recoveryDigest(scope)||Date.now()-Date.parse(proof.completedAt)<0||Date.now()-Date.parse(proof.completedAt)>300000)throw Error('Actual fresh owned maintenance verification required');
 const source=await pilotSource();if(source.sourceCommit!==proof.sourceCommit||source.sourceDigest!==proof.sourceDigest||source.catalogDigest!==proof.catalogDigest)throw Error('Maintenance verification source changed');
 await requireOwnedRestoreConnection(db,target,scope,signal);
 const inventory=await deriveOwnedMaintenanceInventoryInTransaction(db,target,scope,signal);
 if(inventory.inventoryDigest!==proof.inventoryDigest)throw Error('Maintenance verification inventory changed');
 await requireRetiredMaintenanceRuntime(db,scope);
 return proof;
}
