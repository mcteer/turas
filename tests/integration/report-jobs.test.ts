import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withReportsDatabase} from '../fixtures/reports/environment';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {enqueueReportJob,claimReportJobs,completeReportJob,failReportJob} from '../../lib/server/reports/jobs';
describe('report durable fencing',()=>{
  it('gives another customer progress before draining the first customer backlog',async()=>withReportsDatabase(async db=>{
   await db.query('BEGIN');try{
    const authority={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:DEMO_IDS.workspace,customerId:DEMO_IDS.sharedCustomer,ownerMembershipId:DEMO_IDS.mcteerMembership,ownerDecisionId:null,policyRevisionId:null};
    for(let index=0;index<5;index++)await enqueueReportJob(db,authority,'draft',{synthetic:randomUUID()});
    await db.query("UPDATE report_jobs SET available_at=now()-interval '1 minute' WHERE customer_id=$1",[DEMO_IDS.sharedCustomer]);
    const other=await enqueueReportJob(db,{...authority,customerId:DEMO_IDS.deniedCustomer},'draft',{synthetic:randomUUID()});
    const batch=await claimReportJobs(db,'draft',2);
    expect(new Set(batch.map(row=>row.customer_id)).size).toBe(2);
    expect(batch.map(row=>row.id)).toContain(other.id);
   }finally{await db.query('ROLLBACK');}
  }));
 it('rejects stale completion and bounds attempt retry delays',async()=>withReportsDatabase(async db=>{
  await db.query('BEGIN');
  try{
   const authority={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:DEMO_IDS.workspace,customerId:DEMO_IDS.sharedCustomer,ownerMembershipId:DEMO_IDS.mcteerMembership,ownerDecisionId:null,policyRevisionId:null};
   const queued=await enqueueReportJob(db,authority,'draft',{synthetic:randomUUID()});
   const [claimed]=await claimReportJobs(db,'draft');expect(claimed.id).toBe(queued.id);expect(claimed.attempt_count).toBe(1);
   await expect(completeReportJob(db,queued.id,randomUUID(),queued.inputDigest,'1'.repeat(64),async()=>{})).rejects.toMatchObject({code:'version_conflict'});
   expect(await failReportJob(db,queued.id,claimed.lease_token,'synthetic_failure')).toBe(true);
   expect(await claimReportJobs(db,'draft')).toHaveLength(0);
   await db.query("UPDATE report_jobs SET available_at=now()-interval '1 second' WHERE id=$1",[queued.id]);
   const [second]=await claimReportJobs(db,'draft');expect(second.attempt_count).toBe(2);expect(second.lease_token).not.toBe(claimed.lease_token);
   await expect(completeReportJob(db,queued.id,claimed.lease_token,queued.inputDigest,'1'.repeat(64),async()=>{})).rejects.toMatchObject({code:'version_conflict'});
   await completeReportJob(db,queued.id,second.lease_token,queued.inputDigest,'1'.repeat(64),async()=>{});
   expect((await db.query('SELECT state FROM report_jobs WHERE id=$1',[queued.id])).rows[0].state).toBe('completed');
  }finally{await db.query('ROLLBACK');}
 }));
 it('rechecks current membership instead of an expired browser session',async()=>withReportsDatabase(async db=>{
  await db.query('BEGIN');try{
   const authority={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:DEMO_IDS.workspace,customerId:DEMO_IDS.sharedCustomer,ownerMembershipId:DEMO_IDS.mcteerMembership,ownerDecisionId:null,policyRevisionId:null};
   const job=await enqueueReportJob(db,authority,'draft',{synthetic:randomUUID()});
   await db.query('UPDATE memberships SET active=false WHERE id=$1',[DEMO_IDS.mcteerMembership]);
   expect(await claimReportJobs(db,'draft')).toHaveLength(0);
   expect((await db.query('SELECT state FROM report_jobs WHERE id=$1',[job.id])).rows[0].state).toBe('cancelled');
  }finally{await db.query('ROLLBACK');}
 }));
});
