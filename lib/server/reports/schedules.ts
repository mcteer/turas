import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportId} from './schema';
import {readReportPolicy} from './recipient-policy';
import {requireReportEnvironment} from './readiness';
import {lockReportActor} from './policy';
import {lockReportJobAuthority,type ReportJobAuthority} from './actor';
import {requireVerifiedReportSender} from './senders';
import {enqueueReportJob} from './jobs';
import {nextReportScheduleRun,latestReportSchedulePeriod} from '../../reports/schedule-calendar';
export const reportScheduleInput=z.strictObject({policyId:reportId,localTime:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).default('09:00')});
export async function readReportSchedule(db:PoolClient,actor:CurrentSession,scheduleId:string){
 const row=(await db.query('SELECT * FROM report_schedules WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[scheduleId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();
 await lockReportActor(db,actor,row.customer_id,'policy',row.audience);
 return {scheduleId:row.id,customerId:row.customer_id,policyRevisionId:row.policy_revision_id,state:row.state,timezone:row.timezone,localTime:row.local_time,version:Number(row.version),nextRunAt:row.next_run_at.toISOString(),lastPeriod:row.last_period??null};
}
export async function changeReportSchedule(db:PoolClient,actor:CurrentSession,customerId:string,command:{scheduleId:string;expectedVersion:number;action:'pause_schedule'|'resume_schedule'}){
 const visible=await readReportSchedule(db,actor,command.scheduleId);if(visible.customerId!==customerId)throw hiddenRecord();
 const resume=command.action==='resume_schedule';await lockReportActor(db,actor,customerId,'policy',(await db.query('SELECT audience FROM report_schedules WHERE id=$1',[command.scheduleId])).rows[0].audience,false,resume);
 // Policy authority locks precede the mutable schedule lock, matching the worker.
 const policy=(await db.query('SELECT * FROM report_recipient_policies WHERE id=$1',[visible.policyRevisionId])).rows[0];
 const schedule=(await db.query('SELECT * FROM report_schedules WHERE id=$1',[command.scheduleId])).rows[0];
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-schedule:${actor.workspaceId}:${customerId}:${schedule.scope_digest}:${schedule.timezone}`]);
 if(resume){await lockReportJobAuthority(db,{environmentId:schedule.environment_id,workspaceId:schedule.workspace_id,customerId,ownerMembershipId:policy.owner_membership_id,ownerDecisionId:schedule.owner_decision_id,policyRevisionId:policy.id},true);await requireVerifiedReportSender(db,actor.workspaceId,policy.sender_id);}
 const locked=(await db.query('SELECT * FROM report_schedules WHERE id=$1 FOR UPDATE',[command.scheduleId])).rows[0];
 if(Number(locked.version)!==command.expectedVersion || locked.state!==(resume?'paused':'active'))throw new HttpFailure(409,'version_conflict','Schedule changed');
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();
 if(resume && (await db.query("SELECT 1 FROM report_schedules WHERE id<>$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND scope_digest=$5 AND audience=$6 AND timezone=$7 AND state='active'",[locked.id,locked.environment_id,locked.workspace_id,customerId,locked.scope_digest,locked.audience,locked.timezone])).rowCount)throw new HttpFailure(409,'version_conflict','An active schedule already exists for this scope');
 await db.query('UPDATE report_schedules SET state=$2,version=version+1,next_run_at=$3 WHERE id=$1',[locked.id,resume?'active':'paused',resume?nextReportScheduleRun(now,locked.local_time,locked.timezone):locked.next_run_at]);
 if(!resume)await db.query("UPDATE report_jobs SET state='cancelled',failure_code='schedule_paused',lease_token=NULL,lease_until=NULL WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND kind='draft' AND input->>'scheduleId'=$4 AND state IN ('queued','leased')",[locked.environment_id,locked.workspace_id,customerId,locked.id]);
 if(!resume)await db.query("UPDATE report_schedule_periods SET state='missed' WHERE schedule_id=$1 AND state='queued' AND EXISTS(SELECT 1 FROM report_jobs j WHERE j.id=job_id AND j.state='cancelled')",[locked.id]);
 return {scheduleId:locked.id,version:command.expectedVersion+1};
}
export async function createReportSchedule(db:PoolClient,actor:CurrentSession,customerId:string,raw:unknown){
 const parsed=reportScheduleInput.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid weekly schedule');
 const policy=await readReportPolicy(db,actor,parsed.data.policyId);if(policy.customerId!==customerId)throw new HttpFailure(404,'not_found','Resource not found');
 await lockReportActor(db,actor,customerId,'policy',policy.selection.audience,false,true);
 if(policy.state!=='approved' || policy.selection.kind!=='weekly')throw new HttpFailure(409,'policy_changed','Approve a weekly policy before scheduling');
 const head=(await db.query("SELECT approval_decision_id FROM report_policy_heads WHERE policy_id=$1 AND current_revision_id=$2 AND state='approved' FOR SHARE",[policy.policyId,policy.policyRevisionId])).rows[0];
 if(!head?.approval_decision_id)throw new HttpFailure(409,'policy_changed','Approved scheduling authority unavailable');
 await requireVerifiedReportSender(db,actor.workspaceId,policy.senderId);
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString(),id=randomUUID();
 const revision=(await db.query('SELECT scope_digest FROM report_recipient_policies WHERE id=$1',[policy.policyRevisionId])).rows[0];
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-schedule:${actor.workspaceId}:${customerId}:${revision.scope_digest}:${policy.selection.timezone}`]);
 if((await db.query("SELECT 1 FROM report_schedules WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND scope_digest=$4 AND audience=$5 AND timezone=$6 AND state='active'",[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,revision.scope_digest,policy.selection.audience,policy.selection.timezone])).rowCount)throw new HttpFailure(409,'version_conflict','An active schedule already exists for this scope');
 await db.query(`INSERT INTO report_schedules(id,environment_id,workspace_id,customer_id,policy_revision_id,timezone,local_time,owner_decision_id,state,scope_digest,audience,next_run_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11)`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,policy.policyRevisionId,policy.selection.timezone,parsed.data.localTime,head.approval_decision_id,revision.scope_digest,policy.selection.audience,nextReportScheduleRun(now,parsed.data.localTime,policy.selection.timezone)]);
 return {scheduleId:id,policyId:policy.policyId,policyRevisionId:policy.policyRevisionId,version:1};
}
/** Trusted worker clock only; no browser-supplied historical timestamp reaches this function. */
export async function tickReportSchedules(db:PoolClient,now?:string){
 await requireReportEnvironment(db,true);
 const instant=now??(await db.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-schedule-tick:${process.env.TURAS_ENVIRONMENT_ID}`]);
 const candidates=(await db.query(`SELECT * FROM (SELECT s.*,row_number() OVER(PARTITION BY customer_id ORDER BY next_run_at,id) AS customer_order FROM report_schedules s
 WHERE environment_id=$1 AND state='active' AND next_run_at<=$2) ranked ORDER BY customer_order,next_run_at,customer_id,id LIMIT 10`,[process.env.TURAS_ENVIRONMENT_ID,instant])).rows;
 let count=0;
 for(const candidate of candidates){
  const policy=(await db.query('SELECT * FROM report_recipient_policies WHERE id=$1',[candidate.policy_revision_id])).rows[0];
  const authority:ReportJobAuthority={environmentId:candidate.environment_id,workspaceId:candidate.workspace_id,customerId:candidate.customer_id,ownerMembershipId:policy.owner_membership_id,ownerDecisionId:candidate.owner_decision_id,policyRevisionId:policy.id};
  try{await lockReportJobAuthority(db,authority,true);await requireVerifiedReportSender(db,authority.workspaceId,policy.sender_id);}catch(error){
   if(!(error instanceof HttpFailure))throw error;await db.query("UPDATE report_schedules SET state='paused',version=version+1 WHERE id=$1 AND state='active'",[candidate.id]);continue;
  }
  const schedule=(await db.query("SELECT * FROM report_schedules WHERE id=$1 AND state='active' AND version=$2 AND next_run_at<=$3 FOR UPDATE SKIP LOCKED",[candidate.id,candidate.version,instant])).rows[0];if(!schedule)continue;
  const period=latestReportSchedulePeriod(schedule.next_run_at.toISOString(),instant,schedule.local_time,schedule.timezone);if(!period)continue;
  if(period.missedWeeks>5200)throw new HttpFailure(422,'scope_too_large','Schedule recovery requires operator review');
  await db.query(`INSERT INTO report_schedule_periods(schedule_id,from_date,state) SELECT $1,($2::date-(n*7))::date,'missed' FROM generate_series(1,$3::int) n ON CONFLICT DO NOTHING`,[schedule.id,period.fromDate,period.missedWeeks]);
  const created=await db.query("INSERT INTO report_schedule_periods(schedule_id,from_date,state) VALUES($1,$2,'queued') ON CONFLICT DO NOTHING RETURNING schedule_id",[schedule.id,period.fromDate]);
  if(created.rowCount){const job=await enqueueReportJob(db,authority,'draft',{scheduleId:schedule.id,scheduleVersion:Number(schedule.version),selection:policy.selection,fromDate:period.fromDate,toDate:period.toDate,partial:false});await db.query('UPDATE report_schedule_periods SET job_id=$3 WHERE schedule_id=$1 AND from_date=$2',[schedule.id,period.fromDate,job.id]);count++;}
  await db.query('UPDATE report_schedules SET next_run_at=$2,last_period=$3 WHERE id=$1',[schedule.id,period.nextRunAt,period.fromDate]);
 }
 return count;
}
