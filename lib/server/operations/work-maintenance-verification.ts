import {createHash} from 'node:crypto';
import {publishRecoveryMeasurement} from './recovery-measurement-group';
import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {deriveWorkMaintenanceInventoryInTransaction,type OwnedMaintenanceRecord} from './owned-maintenance-inventory';
import {withAuthenticatedWorkRecoveryRead} from './authenticated-recovery-read';
import {issueWorkRecoveryHttpRead,retireOwnedRecoveryHttpRead} from './recovery-http-read-issuer';
import {profileProjection,planProjection,ordinaryPath} from './maintenance-read-projections';
import {readProfile} from '../profiles/read';
import {readPlan} from '../plans/read';
import {readExecutionRecoveryBinding,readRecoveryExecution} from './recovery-execution-read';
import {getServerConfig} from '../config';
import {sessionCookie} from '../auth/sessions';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const selectionSchema=z.array(z.strictObject({kind:z.enum(['profile','artifact','report','workforce','gap','plan','execution']),recordId:z.uuid()})).min(1).max(8);
type TargetInput=Parameters<typeof withLockedWorkRecoveryTarget>[0];
type Scope={environmentId:string;recoveryId:string;controlRevision:number};
export type WorkMaintenanceHttpBatch=Readonly<{contract:'pilot-work-maintenance-http-batch-v1';environmentId:string;recoveryId:string;controlRevision:number;targetDigest:string;inventoryDigest:string;selectedRecords:readonly string[];verifiedRecords:number;verifiedOriginalBytes:number;completedAt:string;maintenanceHttpVerified:true;probeRetirementVerified:true;requiredScopeHealthy:false;restorationReady:false}>;
type Probe={id:string|null;sessionId:string};
const measured=new WeakMap<object,{targetDigest:string;probes:readonly Probe[]}>();
function scope(target:LockedWorkRecoveryTarget):Scope{return {environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision};}
function targetDigest(target:LockedWorkRecoveryTarget){const {deadline,contract,...identity}=target;return recoveryDigest(identity);}
const key=(record:Pick<OwnedMaintenanceRecord,'kind'|'recordId'>)=>record.kind+':'+record.recordId;
async function transaction<T>(db:Client,run:()=>Promise<T>){await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{const result=await run();await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
async function bytes(response:Response,maximum:number,signal:AbortSignal){
 const reader=response.body?.getReader();if(!reader)throw Error('Work maintenance response body absent');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw Error('Work maintenance response exceeds bound');chunks.push(next.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return Buffer.concat(chunks,size);
}
async function requireRetired(db:Client,probes:readonly Probe[]){
 for(const probe of probes){const rows=probe.id===null?(await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[probe.sessionId])).rows:(await db.query('SELECT a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL AS retired FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.id=$1 AND s.id=$2',[probe.id,probe.sessionId])).rows;if(rows.length!==1||rows[0].retired!==true)throw Error('Actual work maintenance probe retirement required');}
}
/** Finite actual HTTP batch. Every batch derives the whole ledger before selecting
 * at most eight records. Its result deliberately cannot certify full service.
 * No supplied transport, record payload, healthy flag or owner-created client is accepted. */
export async function measureWorkMaintenanceHttpBatch(input:{target:TargetInput;records:z.infer<typeof selectionSchema>;password:string;journalDirectory:string;protectionBypass?:string}){
 const records=selectionSchema.parse(input.records);z.string().min(1).max(4096).parse(input.password);if(input.protectionBypass!==undefined)z.string().min(1).max(8192).parse(input.protectionBypass);
 const requested=new Set(records.map(key));if(requested.size!==records.length)throw Error('Unique work maintenance record selection required');
 // Brand only after the target constructor's final platform/source verification
 // and independent cleanup have succeeded. A retained callback value is not proof.
 const result=await withLockedWorkRecoveryTarget(input.target,async(db,target)=>{
  const inventory=await transaction(db,()=>deriveWorkMaintenanceInventoryInTransaction(db,target,input.target.signal));
  const selected=inventory.records.filter(record=>requested.has(key(record)));if(selected.length!==requested.size)throw Error('Complete selected work maintenance inventory required');
  const probes:Probe[]=[];let originalBytes=0;
  const signal=AbortSignal.any([input.target.signal,AbortSignal.timeout(Math.max(1,target.deadline-Date.now()))]);
  async function request(path:string,headers:Headers){
   signal.throwIfAborted();if(input.protectionBypass)headers.set('x-vercel-protection-bypass',input.protectionBypass);
   const response=await fetch(target.origin+path,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
   if(response.headers.get('x-turas-code-version')!==target.sourceCommit){await response.body?.cancel();throw Error('Work maintenance serving release differs');}return response;
  }
  async function denied(path:string,headers:Headers,statuses:readonly number[]){const response=await request(path,headers);await response.body?.cancel();if(!statuses.includes(response.status))throw Error('Work maintenance denial unverified');}
  for(const record of selected){
   signal.throwIfAborted();const deadline=Math.min(target.deadline,Date.now()+59000),client=db as unknown as PoolClient;
   let canonical:string|undefined;
   if(['profile','plan','execution'].includes(record.kind))canonical=await transaction(db,()=>withAuthenticatedWorkRecoveryRead(db,target,{...scope(target),workspaceId:record.workspaceId,deadline,password:input.password},input.journalDirectory,async actor=>{
    probes.push({id:null,sessionId:actor.sessionId});
    if(actor.membershipId!==record.membershipId)throw Error('Work maintenance canonical owner differs');
    if(record.kind==='profile')return profileProjection(await readProfile(actor,record.customerId!,client,undefined,undefined,false,true),record);
    if(record.kind==='plan')return planProjection(await readPlan(actor,record.recordId,record.parentId!,client),record);
    const binding=await readExecutionRecoveryBinding(client,{environmentId:target.environmentId,workspaceId:record.workspaceId,customerId:record.customerId!,engagementId:record.recordId});if(binding.bindingDigest!==record.bindingDigest)throw Error('Work maintenance execution inventory changed');return recoveryDigest(await readRecoveryExecution(client,actor,binding));
   }));
   const admission=await transaction(db,()=>issueWorkRecoveryHttpRead(db,target,{...scope(target),workspaceId:record.workspaceId,customerId:record.customerId,deadline,password:input.password,maximumRequests:2,deploymentId:target.deploymentId,readKind:record.kind,...(record.kind==='profile'?{}:{recordId:record.recordId})},input.journalDirectory));
   probes.push({id:admission.id,sessionId:admission.actor.sessionId});
   const path='/api/operations/recovery-read/'+admission.id+'/'+record.kind,headers=new Headers({cookie:sessionCookie(admission.actor.token,admission.actor.expiresAt,{...getServerConfig(),TURAS_APP_ORIGIN:target.origin}).split(';')[0],'x-turas-recovery-read':admission.secret});
   let readFailure:unknown;
   try{
    if(admission.actor.membershipId!==record.membershipId)throw Error('Work maintenance HTTP owner differs');
    const foreign=new Headers(headers);foreign.set('x-turas-recovery-read',createHash('sha256').update(admission.secret+'foreign').digest('base64url'));await denied(path,foreign,[403]);
    await denied('/api/operations/recovery-read/'+admission.id+'/'+(record.kind==='profile'?'artifact':'profile'),new Headers(headers),[403]);
    await denied(ordinaryPath(record),new Headers(headers),[401,403,503]);
    const response=await request(path,new Headers(headers));if(response.status!==200){await response.body?.cancel();throw Error('Work maintenance required read unavailable');}
    const content=await bytes(response,record.object?.sizeBytes??2097152,signal);
    if(record.object){if(content.length!==record.object.sizeBytes||createHash('sha256').update(content).digest('hex')!==record.object.digest||!/^attachment(?:;|$)/i.test(response.headers.get('content-disposition')??'')||response.headers.get('x-content-type-options')!=='nosniff')throw Error('Work maintenance original bytes or headers differ');originalBytes+=content.length;}
    else{if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Work maintenance response type differs');const value=(JSON.parse(content.toString()) as {data?:unknown}).data;const observed=record.kind==='profile'?profileProjection(value,record):record.kind==='plan'?planProjection(value,record):recoveryDigest(value);if(observed!==canonical)throw Error('Work maintenance HTTP and canonical projections differ');}
    await retireOwnedRecoveryHttpRead(client,admission.id);await denied(path,new Headers(headers),[403]);
   }catch(error){readFailure=error;throw error;}finally{try{await retireOwnedRecoveryHttpRead(client,admission.id);}catch(retirement){if(readFailure)throw new AggregateError([readFailure,retirement],'Work maintenance read and retirement incomplete');throw retirement;}}
  }
  await requireRetired(db,probes);const final=await transaction(db,()=>deriveWorkMaintenanceInventoryInTransaction(db,target,signal));if(final.inventoryDigest!==inventory.inventoryDigest)throw Error('Work maintenance inventory changed');
  const proof:WorkMaintenanceHttpBatch=Object.freeze({contract:'pilot-work-maintenance-http-batch-v1',...scope(target),targetDigest:targetDigest(target),inventoryDigest:inventory.inventoryDigest,selectedRecords:Object.freeze(selected.map(key)),verifiedRecords:selected.length,verifiedOriginalBytes:originalBytes,completedAt:new Date().toISOString(),maintenanceHttpVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});return {proof,probes};
 });
 publishRecoveryMeasurement(()=>measured.set(result.proof,{targetDigest:result.proof.targetDigest,probes:Object.freeze(result.probes)}));return result.proof;
}
/** Final composition rebinds genuine in-process measurements to a newly verified
 * exact target, current whole inventory and still-retired credentials. JSON is not authority. */
export async function requireMeasuredWorkMaintenanceHttpBatch(db:Client,target:LockedWorkRecoveryTarget,proof:WorkMaintenanceHttpBatch,signal:AbortSignal){
 await requireLockedWorkRecoveryConnection(db,target,scope(target));signal.throwIfAborted();
 const inventory=await deriveWorkMaintenanceInventoryInTransaction(db,target,signal);
 return requireBatchAgainstInventory(db,target,proof,signal,inventory);
}
async function requireBatchAgainstInventory(db:Client,target:LockedWorkRecoveryTarget,proof:WorkMaintenanceHttpBatch,signal:AbortSignal,inventory:Awaited<ReturnType<typeof deriveWorkMaintenanceInventoryInTransaction>>){
 const actual=measured.get(proof);if(!actual)throw Error('Actual fresh work maintenance HTTP measurement required');const age=Date.now()-Date.parse(proof.completedAt);if(actual.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>300000)throw Error('Actual fresh work maintenance HTTP measurement required');
 if(inventory.inventoryDigest!==proof.inventoryDigest||proof.verifiedRecords!==proof.selectedRecords.length||proof.selectedRecords.some(value=>!inventory.records.some(record=>key(record)===value)))throw Error('Measured work maintenance coverage changed');
 await requireRetired(db,actual.probes);signal.throwIfAborted();return proof;
}

/** Exact union of genuine measured batches, consumed inside the final owner
 * transaction. This establishes seven-kind record coverage only; authorization,
 * SDK, Workflow, effects and full required service remain separate gates. */
export async function requireMeasuredWorkMaintenanceHttpCoverage(db:Client,target:LockedWorkRecoveryTarget,batches:readonly WorkMaintenanceHttpBatch[],signal:AbortSignal){
 if(!Array.isArray(batches)||batches.length<1||batches.length>256)throw Error('Finite actual work maintenance batches required');
 const inventory=await deriveWorkMaintenanceInventoryInTransaction(db,target,signal),observed=new Set<string>();let originalBytes=0;
 if(!inventory.records.length)throw Error('Required work maintenance record inventory empty');
 for(const batch of batches){
  // This decision retains the original ordered fences. Derive its complete
  // inventory once, then bind every original batch to that same current ledger.
  await requireBatchAgainstInventory(db,target,batch,signal,inventory);
  for(const record of batch.selectedRecords){if(observed.has(record))throw Error('Duplicate work maintenance record measurement');observed.add(record);}
  originalBytes+=batch.verifiedOriginalBytes;
 }
 if(observed.size!==inventory.records.length||inventory.records.some(record=>!observed.has(key(record))))throw Error('Complete work maintenance record coverage required');
 const requiredBytes=inventory.records.reduce((sum,record)=>sum+(record.object?.sizeBytes??0),0);
 if(originalBytes!==requiredBytes)throw Error('Complete work maintenance original byte coverage required');
 signal.throwIfAborted();
 return Object.freeze({contract:'pilot-work-maintenance-http-coverage-v1' as const,...scope(target),targetDigest:targetDigest(target),inventoryDigest:inventory.inventoryDigest,verifiedRecords:observed.size,verifiedOriginalBytes:originalBytes,verifiedKinds:Object.freeze([...new Set(inventory.records.map(record=>record.kind))].sort()),maintenanceRecordCoverageVerified:true as const,probeRetirementVerified:true as const,requiredScopeHealthy:false as const,restorationReady:false as const});
}
