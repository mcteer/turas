import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {query,withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import type {SourceFence} from './hosted-jobs';
type LocalJob={id:string;environmentId:string;leaseId:string;deadlineAt:string};
export async function admitLocalJob(db:PoolClient,input:{id:string;domainKind:string;domainJobId:string;sourceGeneration:number;sourceDigest:string;imageDigest:string;deadlineAt:string},sourceCurrent:SourceFence):Promise<LocalJob>{
 if(!await sourceCurrent(db))throw Error('Execution source changed');
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID,leaseId=randomUUID();
 await db.query(`INSERT INTO operations_local_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,image_digest,lease_id,deadline_at,lease_expires_at,state)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,LEAST($9::timestamptz,clock_timestamp()+interval '30 seconds'),'running')`,[input.id,environmentId,input.domainKind,input.domainJobId,input.sourceGeneration,input.sourceDigest,input.imageDigest,leaseId,input.deadlineAt]);
 return {id:input.id,environmentId,leaseId,deadlineAt:input.deadlineAt};
}
export async function fenceLocalJob(db:PoolClient,handle:LocalJob,sourceCurrent:SourceFence){
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[handle.environmentId]);
 const row=(await db.query(`SELECT 1 FROM operations_local_jobs j JOIN operations_control c ON c.environment_id=j.environment_id
 WHERE j.id=$1 AND j.environment_id=$2 AND j.lease_id=$3 AND j.deadline_at=$4::timestamptz AND j.state='running'
 AND c.mode='open' AND j.lease_expires_at>clock_timestamp() AND j.deadline_at>clock_timestamp() FOR UPDATE OF j`,[handle.id,handle.environmentId,handle.leaseId,handle.deadlineAt])).rowCount;
 return Boolean(row&&await sourceCurrent(db));
}
export async function withLocalHeartbeat<T>(handle:LocalJob,sourceCurrent:SourceFence,parentSignal:AbortSignal|undefined,run:(signal:AbortSignal)=>Promise<T>){
 const controller=new AbortController(),abort=()=>controller.abort();let pending:Promise<void>|undefined;
 parentSignal?.throwIfAborted();parentSignal?.addEventListener('abort',abort,{once:true});
 const deadline=setTimeout(abort,Math.max(1,Date.parse(handle.deadlineAt)-Date.now()));
 const timer=setInterval(()=>{if(pending)return;pending=withTransaction(async db=>{if(!await fenceLocalJob(db,handle,sourceCurrent)){abort();return;}await db.query("UPDATE operations_local_jobs SET lease_expires_at=LEAST(deadline_at,clock_timestamp()+interval '30 seconds') WHERE id=$1",[handle.id]);}).catch(abort).finally(()=>{pending=undefined;});},10000);
 try{return await run(controller.signal);}
 finally{clearTimeout(deadline);clearInterval(timer);parentSignal?.removeEventListener('abort',abort);if(pending)await pending;}
}
export async function settleLocalJob(handle:LocalJob,state:'failed'|'reconciling'){
 await query(`UPDATE operations_local_jobs SET state=$4,finished_at=CASE WHEN $4='failed' THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND environment_id=$2 AND lease_id=$3 AND state='running'`,[handle.id,handle.environmentId,handle.leaseId,state]);
}
