import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
export async function chargeReportRate(db:PoolClient,workspaceId:string,bucket:string,limit:number,seconds:number,amount=1){
 const result=await db.query(`INSERT INTO report_rate_windows(environment_id,workspace_id,bucket,window_start,count)
 VALUES($1,$2,$3,to_timestamp(floor(extract(epoch FROM now())/$4)*$4),$5)
 ON CONFLICT(environment_id,workspace_id,bucket,window_start) DO UPDATE SET count=report_rate_windows.count+EXCLUDED.count
 WHERE report_rate_windows.count+EXCLUDED.count<=$6 RETURNING count`,[process.env.TURAS_ENVIRONMENT_ID,workspaceId,bucket,seconds,amount,limit]);
 if(!result.rowCount || result.rows[0].count>limit)throw new HttpFailure(429,'rate_limited','Report rate limit reached',seconds);
}
export async function requireReportQueueCapacity(db:PoolClient,workspaceId:string,kind:'draft'|'delivery',amount=1){
 const table=kind==='draft'?'report_jobs':'report_deliveries';
 const predicate=kind==='draft'?"kind IN ('draft','render') AND state IN ('queued','leased')":"state IN ('authorized','queued','dispatching','retryable_failure','uncertain')";
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-queue:${process.env.TURAS_ENVIRONMENT_ID}:${workspaceId}`]);
 const count=Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE environment_id=$1 AND workspace_id=$2 AND ${predicate}`,[process.env.TURAS_ENVIRONMENT_ID,workspaceId])).rows[0].n);
 if(count+amount>(kind==='draft'?100:500))throw new HttpFailure(429,'rate_limited','Report queue is full',60);
}
