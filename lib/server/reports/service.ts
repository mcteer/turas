import type {CurrentSession} from '../auth/sessions';
import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {executeReportCommand,reportTransaction} from './commands';
import {reportPrepareSchema,reportRevisionCommandSchema,reportPublicationPreviewSchema,reportPublicationDecisionSchema,reportId,reportPolicyPreviewSchema,reportPolicyDecisionSchema} from './schema';
import {prepareReportRevision,reportHead,appendReportRevision} from './revisions';
import {reportReadProjection} from './read';
import {lockReportActor} from './policy';
import {validateWeeklyRevision} from './validation';
import {enqueueReportRender} from './render-jobs';
import {createPublicationPreview,decideReportPublication} from './publication';
import {createReportPolicyPreview,decideReportPolicy,readReportPolicy,createReportRecipientPolicy} from './recipient-policy';
import {reportRecipientPolicySchema} from './recipients';
import {reportScheduleInput,createReportSchedule,changeReportSchedule,readReportSchedule} from './schedules';
import {reportSendPreviewSchema,reportSendDecisionSchema} from './schema';
import {createReportSendPreview,authorizeReportSend} from './send-review';
import {readReportDelivery} from './delivery-commands';
import {reportBrandProjection} from './brand-review';
import {reportAuditExpired} from '../../reports/retention';
const createPolicyCommand=z.strictObject({action:z.literal('create_policy'),requestKey:reportId,expectedVersion:z.literal(0),policy:reportRecipientPolicySchema});
const revisePolicyCommand=z.strictObject({action:z.literal('revise_policy'),requestKey:reportId,expectedVersion:z.number().int().positive().safe(),policyId:reportId,policy:reportRecipientPolicySchema});
const policyCustomerCommand=z.discriminatedUnion('action',[createPolicyCommand,revisePolicyCommand]);
const createScheduleCommand=z.strictObject({action:z.literal('create_schedule'),requestKey:reportId,expectedVersion:z.literal(0),schedule:reportScheduleInput});
const changeScheduleCommand=z.strictObject({action:z.enum(['pause_schedule','resume_schedule']),requestKey:reportId,expectedVersion:z.number().int().positive().safe(),scheduleId:reportId});
export async function previewReportSend(actor:CurrentSession,publicationId:string,raw:unknown){
 const parsed=reportSendPreviewSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid send preview');
 return reportTransaction(db=>createReportSendPreview(db,actor,publicationId,parsed.data));
}
export async function submitReportSendDecision(actor:CurrentSession,publicationId:string,raw:unknown){
 const parsed=reportSendDecisionSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid send decision');
 const policy=await reportTransaction(db=>readReportPolicy(db,actor,parsed.data.policyId));
 return executeReportCommand(actor,policy.customerId,policy.selection.audience,'send',reportSendDecisionSchema,parsed.data,
  (db,command)=>authorizeReportSend(db,actor,publicationId,command),async(db,ids)=>{
   const head=await reportHead(db,actor,String(ids.reportId));await lockReportActor(db,actor,head.customer_id,'send',head.audience);
   const deliveries=(await db.query('SELECT id,state,attempt_count,failure_code FROM report_deliveries WHERE publication_id=$1 ORDER BY id',[publicationId])).rows;
   return {publicationId,reportId:head.id,deliveries:deliveries.map(row=>({deliveryId:row.id,state:row.state,attemptCount:row.attempt_count,failureCode:row.failure_code}))};
  },{subjectId:publicationId});
}
export async function submitReportCustomerCommand(actor:CurrentSession,customerId:string,raw:unknown){
 if(raw && typeof raw==='object' && 'action' in raw && raw.action==='create_schedule'){
  const parsed=createScheduleCommand.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid schedule command');
  const policy=await reportTransaction(db=>readReportPolicy(db,actor,parsed.data.schedule.policyId));
  return executeReportCommand(actor,customerId,policy.selection.audience,'policy',createScheduleCommand,parsed.data,(db,command)=>createReportSchedule(db,actor,customerId,command.schedule),(db,ids)=>readReportSchedule(db,actor,String(ids.scheduleId)));
 }
 if(raw && typeof raw==='object' && 'action' in raw && ['pause_schedule','resume_schedule'].includes(String(raw.action))){
  const parsed=changeScheduleCommand.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid schedule command');
  return executeReportCommand(actor,customerId,'delivery','policy',changeScheduleCommand,parsed.data,(db,command)=>changeReportSchedule(db,actor,customerId,command),(db,ids)=>readReportSchedule(db,actor,String(ids.scheduleId)),{settlement:parsed.data.action==='pause_schedule'});
 }
 if(raw && typeof raw==='object' && 'action' in raw && ['create_policy','revise_policy'].includes(String(raw.action))){
  const parsed=policyCustomerCommand.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid policy command');
  return executeReportCommand(actor,customerId,parsed.data.policy.selection.audience,'policy',policyCustomerCommand,parsed.data,
   (db,command)=>createReportRecipientPolicy(db,actor,customerId,command.policy,command.action==='revise_policy'?{policyId:command.policyId,expectedVersion:command.expectedVersion}:undefined),
   (db,ids)=>readReportPolicy(db,actor,String(ids.policyId)));
 }
 const parsed=reportPrepareSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report preparation');
 return executeReportCommand(actor,customerId,parsed.data.selection.audience,'prepare',reportPrepareSchema,parsed.data,
   (db,command)=>prepareReportRevision(db,actor,customerId,command),(db,ids)=>reportReadProjection(db,actor,String(ids.reportId)));
}
export async function submitReportRevisionCommand(actor:CurrentSession,reportId:string,raw:unknown){
 const parsed=reportRevisionCommandSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report command');
 const head=await reportTransaction(db=>reportHead(db,actor,reportId));
 return executeReportCommand(actor,head.customer_id,head.audience,'revise',reportRevisionCommandSchema,parsed.data,async(db,command):Promise<Record<string,string|number>>=>{
  const current=await reportHead(db,actor,reportId,true);
  if(Number(current.version)!==command.expectedVersion)throw new HttpFailure(409,'version_conflict','Report changed');
  if(command.action==='render'){
   if(current.kind!=='weekly'){const job=await enqueueReportRender(db,actor,current.current_revision_id);return {reportId,...job};}
   const result=await validateWeeklyRevision(db,actor.workspaceId,current.current_revision_id);return {reportId,revisionId:current.current_revision_id,validationId:result.validationId};
  }
  if(command.action==='cancel_job'){
   if(!command.jobId)throw new HttpFailure(422,'invalid_input','Job identity required');
   const row=(await db.query(`UPDATE report_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=$1 AND revision_id=$2 AND environment_id=$3 AND workspace_id=$4 AND state IN ('queued','leased') RETURNING id`,[command.jobId,current.current_revision_id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return {reportId,jobId:row.id};
  }
  const predecessor=command.predecessorRevisionId??current.current_revision_id;
  if(!(await db.query('SELECT 1 FROM report_revisions WHERE id=$1 AND report_id=$2',[predecessor,reportId])).rowCount)throw hiddenRecord();
  if(command.action==='correct' && !(await db.query('SELECT 1 FROM report_publications WHERE revision_id=$1',[predecessor])).rowCount)throw new HttpFailure(409,'version_conflict','Select an exact published predecessor');
  return appendReportRevision(db,actor,current,command.annotations,predecessor);
 },(db,ids)=>reportReadProjection(db,actor,String(ids.reportId)),{settlement:parsed.data.action==='cancel_job',subjectId:reportId});
}
export async function previewReportPublication(actor:CurrentSession,reportId:string,raw:unknown){
 if(raw && typeof raw==='object' && 'action' in raw && raw.action==='send'){
  const publicationId=await sendPublicationForReport(actor,reportId);
  return previewReportSend(actor,publicationId,raw);
 }
 const parsed=reportPublicationPreviewSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid publication preview');
 return reportTransaction(async db=>{const head=await reportHead(db,actor,reportId);await lockReportActor(db,actor,head.customer_id,'publish',head.audience,false,parsed.data.action!=='withdraw');
 return createPublicationPreview(db,actor,reportId,parsed.data.action,parsed.data.expectedVersion);});
}
export async function previewReportPolicy(actor:CurrentSession,policyId:string,raw:unknown){
 const parsed=reportPolicyPreviewSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid policy preview');
 return reportTransaction(db=>createReportPolicyPreview(db,actor,policyId,parsed.data.action,parsed.data.expectedVersion));
}
export async function submitReportPolicyDecision(actor:CurrentSession,policyId:string,raw:unknown){
 const parsed=reportPolicyDecisionSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid policy decision');
 const current=await reportTransaction(db=>readReportPolicy(db,actor,policyId));
 return executeReportCommand(actor,current.customerId,current.selection.audience,'policy',reportPolicyDecisionSchema,parsed.data,
  (db,command)=>decideReportPolicy(db,actor,policyId,command),(db)=>readReportPolicy(db,actor,policyId),{settlement:['pause','revoke'].includes(parsed.data.action),subjectId:policyId});
}
export async function submitReportPublicationDecision(actor:CurrentSession,reportId:string,raw:unknown){
 if(raw && typeof raw==='object' && 'action' in raw && raw.action==='send'){
  const publicationId=await sendPublicationForReport(actor,reportId);
  return submitReportSendDecision(actor,publicationId,raw);
 }
 const parsed=reportPublicationDecisionSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report decision');
 const head=await reportTransaction(db=>reportHead(db,actor,reportId));
 return executeReportCommand(actor,head.customer_id,head.audience,'publish',reportPublicationDecisionSchema,parsed.data,
 (db,command)=>decideReportPublication(db,actor,reportId,command),(db,ids)=>reportReadProjection(db,actor,String(ids.reportId)),{settlement:parsed.data.action==='withdraw',subjectId:reportId});
}
async function sendPublicationForReport(actor:CurrentSession,reportId:string){
 return reportTransaction(async db=>{
  const head=await reportHead(db,actor,reportId);await lockReportActor(db,actor,head.customer_id,'send',head.audience);
  const row=(await db.query('SELECT id FROM report_publications WHERE report_id=$1 AND revision_id=$2',[reportId,head.current_revision_id])).rows[0];
  if(!row)throw new HttpFailure(409,'version_conflict','Publish the report before reviewing delivery');return row.id as string;
 });
}
export async function readReportCommandReceipt(actor:CurrentSession,requestKey:string){
 reportId.parse(requestKey);
 return reportTransaction(async db=>{
   const row=(await db.query('SELECT customer_id,action,result_ids,created_at FROM report_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4',[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,requestKey])).rows[0];if(!row)throw hiddenRecord();
  const capability=row.action==='prepare'?'prepare':['revise','correct','render','cancel_job'].includes(row.action)?'revise':['publish','reject','withdraw'].includes(row.action)?'publish':row.action==='send'?'send':row.result_ids.brandId?'brand':row.result_ids.deliveryId?'reconcile':row.result_ids.policyId||row.result_ids.scheduleId?'policy':'read';
   await lockReportActor(db,actor,row.customer_id,capability,'delivery');
   if(reportAuditExpired(new Date(row.created_at)))throw new HttpFailure(409,'payload_expired','Report command audit has expired');
  return row.result_ids.reportId?reportReadProjection(db,actor,row.result_ids.reportId):row.result_ids.scheduleId?readReportSchedule(db,actor,row.result_ids.scheduleId):row.result_ids.policyId?readReportPolicy(db,actor,row.result_ids.policyId):row.result_ids.deliveryId?readReportDelivery(db,actor,row.result_ids.deliveryId):row.result_ids.brandId?reportBrandProjection(db,actor,row.result_ids.brandId,row.customer_id):{requestKey,resultIds:row.result_ids};
 });
}
