import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {enqueueReportJob,claimReportJobs,failReportJob} from '../../../lib/server/reports/jobs';
it('keeps the original render deadline across retries and refuses expired work',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase()});const db=await pool.connect();
 try{await db.query('BEGIN');
 const authority={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:DEMO_IDS.workspace,customerId:DEMO_IDS.sharedCustomer,ownerMembershipId:DEMO_IDS.mcteerMembership,ownerDecisionId:null,policyRevisionId:null};
 const queued=await enqueueReportJob(db,authority,'render',{synthetic:randomUUID()});const [first]=await claimReportJobs(db,'render');expect(first.id).toBe(queued.id);
 expect(await failReportJob(db,first.id,first.lease_token,'renderer_failed')).toBe(true);
 await db.query("UPDATE report_jobs SET available_at=now()-interval '1 second' WHERE id=$1",[queued.id]);
 const [second]=await claimReportJobs(db,'render');expect(second.deadline_at.toISOString()).toBe(first.deadline_at.toISOString());expect(second.lease_token).not.toBe(first.lease_token);
 expect(await failReportJob(db,second.id,second.lease_token,'renderer_failed')).toBe(true);
 await db.query("UPDATE report_jobs SET available_at=now()-interval '1 second',deadline_at=now()-interval '1 second' WHERE id=$1",[queued.id]);
 expect(await claimReportJobs(db,'render')).toHaveLength(0);
 expect((await db.query('SELECT state,failure_code FROM report_jobs WHERE id=$1',[queued.id])).rows[0]).toEqual({state:'failed',failure_code:'deadline_expired'});
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
});
