import {z} from 'zod';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {reportId,reportSelectionSchema} from './schema';
import {reportTransaction,reportDigest} from './commands';
import {authorityForReportJob,completeReportJob} from './jobs';
import {lockReportJobAuthority} from './actor';
import {prepareReportRevision} from './revisions';
const draftInput=z.strictObject({scheduleId:reportId,scheduleVersion:z.number().int().positive().safe(),selection:reportSelectionSchema,fromDate:z.string(),toDate:z.string(),partial:z.literal(false)});
async function requireDraftSchedule(db:PoolClient,row:any){
 await lockReportJobAuthority(db,authorityForReportJob(row),true);
 const input=draftInput.parse(row.input);
 const schedule=(await db.query("SELECT version,policy_revision_id FROM report_schedules WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND state='active' FOR SHARE",[input.scheduleId,row.environment_id,row.workspace_id,row.customer_id])).rows[0];
 if(!schedule || Number(schedule.version)!==input.scheduleVersion || schedule.policy_revision_id!==row.policy_revision_id || input.selection.kind!=='weekly' || reportDigest({kind:'draft',input:row.input,authority:authorityForReportJob(row)})!==row.input_digest)throw new HttpFailure(409,'policy_changed','Scheduled draft authority changed');
 return input;
}
export async function runReportDraftJob(claim:{id:string;lease_token:string;input_digest:string}){
 return reportTransaction(async db=>{
  const row=(await db.query("SELECT * FROM report_jobs WHERE id=$1 AND environment_id=$2 AND kind='draft' AND state='leased' AND lease_token=$3 AND input_digest=$4 AND lease_until>now() AND deadline_at>now() FOR UPDATE",[claim.id,process.env.TURAS_ENVIRONMENT_ID,claim.lease_token,claim.input_digest])).rows[0];
  if(!row)throw new HttpFailure(409,'version_conflict','Draft lease changed');
  const input=await requireDraftSchedule(db,row);
  const scopeDigest=reportDigest({selection:{...input.selection,engagementIds:[...input.selection.engagementIds].sort(),workloadIds:[...input.selection.workloadIds].sort()},fromDate:input.fromDate,toDate:input.toDate});
  const prior=(await db.query('SELECT id,current_revision_id FROM report_scopes WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND scope_digest=$4',[row.environment_id,row.workspace_id,row.customer_id,scopeDigest])).rows[0];
  const result=prior?{reportId:prior.id,revisionId:prior.current_revision_id}:await prepareReportRevision(db,{workspaceId:row.workspace_id,membershipId:row.owner_membership_id},row.customer_id,{action:'prepare',requestKey:row.id,expectedVersion:0,selection:input.selection,fromDate:input.fromDate,toDate:input.toDate,partial:false});
  await completeReportJob(db,row.id,claim.lease_token,claim.input_digest,reportDigest(result),async(db,current)=>{await requireDraftSchedule(db,current);});
  await db.query("UPDATE report_schedule_periods SET state='completed' WHERE schedule_id=$1 AND from_date=$2 AND job_id=$3",[input.scheduleId,input.fromDate,row.id]);
  return result;
 });
}
