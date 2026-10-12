import {randomUUID,createHash} from 'node:crypto';
import {operationalCodeVersion} from './code-version';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {ExecutionOutput} from '../jobs/executor';
import type {SandboxLease} from '../jobs/sandbox-executor';

const identity=z.object({environmentId:z.string().min(1).max(256),domainKind:z.enum(['artifact','workforce','report','gap-report']),domainJobId:z.uuid(),sourceGeneration:z.number().int().positive(),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),imageDigest:z.string().regex(/^[a-f0-9]{64}$/),inputDigest:z.string().regex(/^[a-f0-9]{64}$/),inputBytes:z.number().int().min(1).max(10485760),deadlineAt:z.iso.datetime({offset:true}),reservationId:z.uuid()}).strict();
export type JobAdmission=z.infer<typeof identity>;
export type JobHandle={id:string;environmentId:string;leaseId:string;creationTag:string;deadlineAt:string};
/** Acquire the domain's source/generation/authority row locks for the transaction. */
export type SourceFence=(db:PoolClient)=>Promise<boolean>;
/** Authority must check a durable, explicitly admitted service reservation. No permissive default exists. */
export type ServiceBudgetAuthority={verifyReserved:(db:PoolClient,reservationId:string,jobId:string)=>Promise<boolean>;markDispatch:(db:PoolClient,reservationId:string)=>Promise<void>;holdUnknown:(db:PoolClient,reservationId:string)=>Promise<void>;isSettled:(db:PoolClient,reservationId:string)=>Promise<boolean>;releaseUndispatched:(db:PoolClient,reservationId:string)=>Promise<void>};
export type JobTransaction=<T>(run:(db:PoolClient)=>Promise<T>)=>Promise<T>;
export type OwnedProvider={id:string;tags:Record<string,string>;persistent:boolean};
export type ProviderReconciler={findByCreationTag:(tag:string,signal:AbortSignal)=>Promise<{items:OwnedProvider[];complete:boolean}>;stopAndDelete:(id:string,signal:AbortSignal)=>Promise<void>};

export async function admitHostedJob(db:PoolClient,input:JobAdmission,budget:ServiceBudgetAuthority,sourceCurrent:SourceFence):Promise<JobHandle>{
 input=identity.parse(input);const id=randomUUID(),leaseId=randomUUID(),creationTag=randomUUID();
 const clock=(await db.query('SELECT clock_timestamp() AS current')).rows[0].current as Date;
 const remaining=Date.parse(input.deadlineAt)-clock.getTime();if(remaining<=0||remaining>300000)throw Error('Original finite job deadline required');
 if(!await sourceCurrent(db)||!await budget.verifyReserved(db,input.reservationId,id))throw Error('Source or service budget admission denied');
 await db.query(`INSERT INTO operations_hosted_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,lease_id,lease_expires_at,creation_tag,image_digest,state,deadline_at,input_digest,input_bytes,budget_reservation_id,code_version)
 VALUES($1,$2,$3,$4,$5,$6,$7,LEAST($8::timestamptz,clock_timestamp()+interval '30 seconds'),$9,$10,'admitted',$8,$11,$12,$13,$14)`,[id,input.environmentId,input.domainKind,input.domainJobId,input.sourceGeneration,input.sourceDigest,leaseId,input.deadlineAt,creationTag,input.imageDigest,input.inputDigest,input.inputBytes,input.reservationId,operationalCodeVersion()]);
 return {id,environmentId:input.environmentId,leaseId,creationTag,deadlineAt:input.deadlineAt};
}
type HostedRow={id:string;mode:string;state:string;deadline_at:Date;db_now:Date;lease_expires_at:Date;provider_id:string|null;budget_reservation_id:string};
async function lockJob(db:PoolClient,handle:JobHandle){
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[handle.environmentId]);
 return (await db.query<HostedRow>(`SELECT j.*,c.mode,clock_timestamp() AS db_now FROM operations_hosted_jobs j JOIN operations_control c ON c.environment_id=j.environment_id
 WHERE j.id=$1 AND j.environment_id=$2 AND j.lease_id=$3 AND j.creation_tag=$4 AND j.deadline_at=$5::timestamptz FOR UPDATE OF j`,[handle.id,handle.environmentId,handle.leaseId,handle.creationTag,handle.deadlineAt])).rows[0];
}
function isCurrent(row:HostedRow|undefined){return Boolean(row&&row.mode==='open'&&['admitted','starting','running'].includes(row.state)&&row.deadline_at>row.db_now&&row.lease_expires_at>row.db_now);}
export async function startHostedJob(db:PoolClient,handle:JobHandle,budget:ServiceBudgetAuthority,sourceCurrent:SourceFence){
 const row=await lockJob(db,handle);if(!row||!isCurrent(row)||row.state!=='admitted'||!await sourceCurrent(db)||!await budget.verifyReserved(db,row.budget_reservation_id,handle.id))throw Error('Hosted dispatch denied');
 // Record dispatch before contacting the provider. A crash after this point is uncertain, never a paid retry.
 await budget.markDispatch(db,row.budget_reservation_id);
 await db.query("UPDATE operations_hosted_jobs SET state='starting',started_at=clock_timestamp() WHERE id=$1",[handle.id]);
}
export function hostedSandboxLease(handle:JobHandle,transaction:JobTransaction,budget:ServiceBudgetAuthority,sourceCurrent:SourceFence):SandboxLease{
 const hold=()=>transaction(async db=>{const row=await lockJob(db,handle);if(!row||!['starting','running','reconciling'].includes(row.state))return;await budget.holdUnknown(db,row.budget_reservation_id);await db.query("UPDATE operations_hosted_jobs SET state='reconciling',safe_failure='provider_unknown' WHERE id=$1",[handle.id]);});
 return {creationTag:handle.creationTag,environmentDigest:createHash('sha256').update(handle.environmentId).digest('hex'),
 verifyCurrent:()=>transaction(async db=>{const row=await lockJob(db,handle);return Boolean(row&&isCurrent(row)&&row.state!=='admitted'&&await sourceCurrent(db));}),
 bindProvider:(providerId)=>transaction(async db=>{if(!/^[a-zA-Z0-9_-]{1,256}$/.test(providerId))return false;const row=await lockJob(db,handle);if(!row||row.state!=='starting'||!isCurrent(row)||!await sourceCurrent(db))return false;await db.query("UPDATE operations_hosted_jobs SET provider_id=$2,state='running' WHERE id=$1",[handle.id,providerId]);return true;}),
 creationUnknown:hold,stopFailed:hold};
}
export async function renewHostedLease(db:PoolClient,handle:JobHandle,sourceCurrent:SourceFence){
 const row=await lockJob(db,handle);if(!isCurrent(row)||!await sourceCurrent(db))return false;
 await db.query("UPDATE operations_hosted_jobs SET lease_expires_at=LEAST(deadline_at,clock_timestamp()+interval '30 seconds') WHERE id=$1",[handle.id]);return true;
}
/** Validation and domain publication share the same transaction and source locks. */
export async function publishHostedOutput(db:PoolClient,handle:JobHandle,output:ExecutionOutput,sourceCurrent:SourceFence,validateAndPublish:(db:PoolClient,output:ExecutionOutput)=>Promise<void>){
 const row=await lockJob(db,handle);if(!row||!isCurrent(row)||row.state!=='running'||!row.provider_id||!await sourceCurrent(db))throw Error('Hosted result source or lease changed');
 if(output.exitCode!==0||!Number.isSafeInteger(output.durationMs)||output.durationMs<0||output.durationMs>300000)throw Error('Hosted result invalid');
 const parts=[output.stdout,...Object.entries(output.files).sort(([a],[b])=>a.localeCompare(b)).flatMap(([name,bytes])=>[Buffer.from(name),bytes!])];
 const size=parts.reduce((sum,b)=>sum+b.length,0);if(size>52428800)throw Error('Hosted result exceeds domain limit');
 const digest=createHash('sha256').update(JSON.stringify({contract:'pilot-job-output-v1',stdout:{size:output.stdout.length,digest:createHash('sha256').update(output.stdout).digest('hex')},files:Object.entries(output.files).sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>({name,size:bytes!.length,digest:createHash('sha256').update(bytes!).digest('hex')}))}));
 await validateAndPublish(db,output); // Must validate actual manifest/format; exit 0 alone is never accepted.
 // Source locks remain held through the callback. Its own accepted transition may
 // change source eligibility; rechecking a pre-publication state would undo it.
 if(!isCurrent(await lockJob(db,handle)))throw Error('Hosted publication source changed');
 await db.query("UPDATE operations_hosted_jobs SET state='succeeded',finished_at=clock_timestamp(),output_digest=$2,output_bytes=$3 WHERE id=$1",[handle.id,digest.digest('hex'),size]);
}
export async function cancelHostedJob(db:PoolClient,handle:JobHandle,budget:ServiceBudgetAuthority){
 const row=await lockJob(db,handle);if(!row||['succeeded','failed','cancelled'].includes(row.state))return;
 if(row.state==='admitted'){await budget.releaseUndispatched(db,row.budget_reservation_id);await db.query("UPDATE operations_hosted_jobs SET state='cancelled',finished_at=clock_timestamp() WHERE id=$1",[handle.id]);}
 else{await budget.holdUnknown(db,row.budget_reservation_id);await db.query("UPDATE operations_hosted_jobs SET state='reconciling',safe_failure='provider_unknown' WHERE id=$1",[handle.id]);}
}
/** Called by a separate finite watchdog. Partial enumeration never clears a hold. */
export async function reconcileHostedJob(handle:JobHandle,transaction:JobTransaction,budget:ServiceBudgetAuthority,provider:ProviderReconciler,signal:AbortSignal){
 const observed=await transaction(async db=>{const row=await lockJob(db,handle);if(!row||!['starting','running','reconciling'].includes(row.state))return undefined;
 if(row.state!=='reconciling'&&row.deadline_at>row.db_now&&row.lease_expires_at>row.db_now)return undefined;
 await budget.holdUnknown(db,row.budget_reservation_id);await db.query("UPDATE operations_hosted_jobs SET state='reconciling',safe_failure='provider_unknown' WHERE id=$1",[handle.id]);return row;});
 if(!observed)return {state:'current' as const};
 const found=await provider.findByCreationTag(handle.creationTag,signal);signal.throwIfAborted();
 const environmentDigest=createHash('sha256').update(handle.environmentId).digest('hex');
 if(!found.complete||found.items.length>1||!found.items.length&&!observed.provider_id)return {state:'held' as const};
 const owned=found.items[0]??{id:observed.provider_id,tags:{turas_creation:handle.creationTag,turas_job:handle.id,turas_environment:environmentDigest},persistent:false};
 if(!/^[a-zA-Z0-9_-]{1,256}$/.test(owned.id))return {state:'held' as const};if(owned.persistent||owned.tags.turas_creation!==handle.creationTag||owned.tags.turas_job!==handle.id||owned.tags.turas_environment!==environmentDigest||observed.provider_id&&owned.id!==observed.provider_id)return {state:'held' as const};
 await transaction(async db=>{const row=await lockJob(db,handle);if(!row||row.state!=='reconciling'||row.provider_id&&row.provider_id!==owned.id)throw Error('Reconciliation identity changed');if(!row.provider_id)await db.query('UPDATE operations_hosted_jobs SET provider_id=$2 WHERE id=$1',[handle.id,owned.id]);});
 await provider.stopAndDelete(owned.id,signal);signal.throwIfAborted();
 return transaction(async db=>{const row=await lockJob(db,handle);if(!row||row.state!=='reconciling'||row.provider_id!==owned.id)throw Error('Reconciliation identity changed');
 if(!await budget.isSettled(db,row.budget_reservation_id))return {state:'held' as const};
 await db.query("UPDATE operations_hosted_jobs SET state='cancelled',finished_at=clock_timestamp(),safe_failure=NULL WHERE id=$1",[handle.id]);return {state:'stopped' as const};});
}

/** Heartbeats renew only the lease; they never move the original execution deadline. */
export async function withHostedHeartbeat<T>(handle:JobHandle,transaction:JobTransaction,sourceCurrent:SourceFence,run:(signal:AbortSignal)=>Promise<T>,parentSignal?:AbortSignal):Promise<T>{
 const controller=new AbortController();let renewal:Promise<void>|undefined;
 const abort=()=>controller.abort();parentSignal?.throwIfAborted();parentSignal?.addEventListener('abort',abort,{once:true});
 const deadline=setTimeout(abort,Math.max(1,Date.parse(handle.deadlineAt)-Date.now()));
 const timer=setInterval(()=>{if(renewal)return;renewal=transaction(db=>renewHostedLease(db,handle,sourceCurrent)).then(current=>{if(!current)abort();},abort).finally(()=>{renewal=undefined;});},10000);
 try{const result=await run(controller.signal);controller.signal.throwIfAborted();return result;}
 finally{clearInterval(timer);clearTimeout(deadline);parentSignal?.removeEventListener('abort',abort);if(renewal)await renewal;}
}
