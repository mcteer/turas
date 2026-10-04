import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {reportDigest} from './commands';
import {lockReportJobAuthority,type ReportJobAuthority} from './actor';
import {requireReportQueueCapacity} from './rates';
export type ReportJobKind='draft'|'render'|'dispatch'|'reconcile'|'cleanup';
export async function enqueueReportJob(db:PoolClient,authority:ReportJobAuthority,kind:ReportJobKind,input:unknown,revisionId:string|null=null){
 await lockReportJobAuthority(db,authority,kind==='dispatch');
 const id=randomUUID(),digest=reportDigest({kind,input,authority});
 const existing=(await db.query('SELECT id FROM report_jobs WHERE environment_id=$1 AND workspace_id=$2 AND kind=$3 AND input_digest=$4',[authority.environmentId,authority.workspaceId,kind,digest])).rows[0];if(existing)return {id:existing.id,inputDigest:digest};
 if(kind==='draft' || kind==='render')await requireReportQueueCapacity(db,authority.workspaceId,'draft');
 const row=(await db.query(`INSERT INTO report_jobs(id,environment_id,workspace_id,customer_id,kind,input,input_digest,owner_membership_id,owner_decision_id,policy_revision_id,revision_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(environment_id,workspace_id,kind,input_digest) DO UPDATE SET input_digest=report_jobs.input_digest RETURNING id`,[id,authority.environmentId,authority.workspaceId,authority.customerId,kind,JSON.stringify(input),digest,authority.ownerMembershipId,authority.ownerDecisionId,authority.policyRevisionId,revisionId])).rows[0];return {id:row.id,inputDigest:digest};
}
export function authorityForReportJob(row:any):ReportJobAuthority{return {environmentId:row.environment_id,workspaceId:row.workspace_id,customerId:row.customer_id,ownerMembershipId:row.owner_membership_id,ownerDecisionId:row.owner_decision_id,policyRevisionId:row.policy_revision_id};}
export async function claimReportJobs(db:PoolClient,kind:ReportJobKind,limit=1){
 if(!Number.isInteger(limit) || limit<1 || limit>10)throw new HttpFailure(422,'invalid_input','Invalid claim limit');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-claims:${process.env.TURAS_ENVIRONMENT_ID}:${kind}`]);
 const concurrency=kind==='render' || kind==='dispatch'?2:10;
 const active=Number((await db.query("SELECT count(*) AS n FROM report_jobs WHERE environment_id=$1 AND kind=$2 AND state='leased' AND lease_until>now()",[process.env.TURAS_ENVIRONMENT_ID,kind])).rows[0].n);
 const capacity=Math.max(0,Math.min(limit,concurrency-active));if(!capacity)return [];
 await db.query("UPDATE report_jobs SET state='failed',failure_code='attempts_exhausted',lease_token=NULL,lease_until=NULL WHERE environment_id=$1 AND kind=$2 AND state='leased' AND lease_until<=now() AND attempt_count>=3",[process.env.TURAS_ENVIRONMENT_ID,kind]);
  const candidates=(await db.query(`WITH ranked AS (
   SELECT id,row_number() OVER(PARTITION BY customer_id ORDER BY attempt_count,available_at,id) AS customer_rank
   FROM report_jobs WHERE environment_id=$1 AND kind=$2 AND ((state='queued' AND available_at<=now()) OR (state='leased' AND lease_until<=now())) AND attempt_count<3
  ),progress AS (
   SELECT customer_id,max(deadline_at) AS last_claim FROM report_jobs WHERE environment_id=$1 AND kind=$2 GROUP BY customer_id
  ) SELECT j.* FROM report_jobs j JOIN ranked r ON r.id=j.id JOIN progress p ON p.customer_id=j.customer_id
  ORDER BY r.customer_rank,p.last_claim NULLS FIRST,j.attempt_count,j.available_at,j.customer_id,j.id
  LIMIT $3 FOR UPDATE OF j SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,kind,capacity])).rows;
 const claimed=[];
 for(const row of candidates){
  try{await lockReportJobAuthority(db,authorityForReportJob(row),kind==='dispatch');}catch{await db.query("UPDATE report_jobs SET state='cancelled',failure_code='authority_changed',lease_token=NULL,lease_until=NULL WHERE id=$1",[row.id]);continue;}
  const token=randomUUID();claimed.push((await db.query(`UPDATE report_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds',deadline_at=now()+($3*interval '1 second'),attempt_count=attempt_count+1 WHERE id=$1 RETURNING *`,[row.id,token,kind==='render'?120:30])).rows[0]);
 }
 return claimed;
}
export async function heartbeatReportJob(db:PoolClient,id:string,token:string){return Boolean((await db.query(`UPDATE report_jobs SET lease_until=now()+interval '180 seconds' WHERE id=$1 AND environment_id=$2 AND state='leased' AND lease_token=$3 AND lease_until>now() AND deadline_at>now() RETURNING id`,[id,process.env.TURAS_ENVIRONMENT_ID,token])).rowCount);}
export async function completeReportJob(db:PoolClient,id:string,token:string,inputDigest:string,resultDigest:string,recheck:(db:PoolClient,row:any)=>Promise<void>){
 const row=(await db.query(`SELECT * FROM report_jobs WHERE id=$1 AND environment_id=$2 AND state='leased' AND lease_token=$3 AND lease_until>now() AND deadline_at>now() AND input_digest=$4 FOR UPDATE`,[id,process.env.TURAS_ENVIRONMENT_ID,token,inputDigest])).rows[0];
 if(!row)throw new HttpFailure(409,'version_conflict','Job lease changed');
 await lockReportJobAuthority(db,authorityForReportJob(row),row.kind==='dispatch');await recheck(db,row);
 await db.query("UPDATE report_jobs SET state='completed',output_digest=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[id,resultDigest]);
}
export async function failReportJob(db:PoolClient,id:string,token:string,code:string){
 if(!/^[a-z][a-z0-9_]{0,79}$/.test(code))code='job_failed';
 return Boolean((await db.query(`UPDATE report_jobs SET state=CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'queued' END,
 available_at=now()+CASE WHEN attempt_count=1 THEN interval '10 seconds' ELSE interval '60 seconds' END,
 failure_code=$4,lease_token=NULL,lease_until=NULL WHERE id=$1 AND environment_id=$2 AND state='leased' AND lease_token=$3 AND lease_until>now() RETURNING id`,[id,process.env.TURAS_ENVIRONMENT_ID,token,code])).rowCount);
}
