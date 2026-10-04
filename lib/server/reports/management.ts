import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportTransaction} from './commands';
import {lockReportActor,isReportReviewer} from './policy';
import {chargeReportRate} from './rates';
import {createReportCursor,readReportCursor} from './cursors';
import {z} from 'zod';
import {configuredReportSender,requireVerifiedReportSender} from './senders';
const pageSchema=z.strictObject({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(2000).optional()});
export async function listReportPolicies(actor:CurrentSession,customerId:string,raw:unknown){
 const parsed=pageSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid policy page');const input=parsed.data;
 return reportTransaction(async db=>{
  await lockReportActor(db,actor,customerId,'read','delivery');if(actor.kind!=='internal')throw hiddenRecord();
  if(!isReportReviewer(actor))return {canManage:false,policies:[],cursor:null};
  await lockReportActor(db,actor,customerId,'policy','delivery');await chargeReportRate(db,actor.workspaceId,`read:${actor.membershipId}`,120,60);
  const scope={kind:'policies',actor:actor.membershipId,workspaceId:actor.workspaceId,customerId},cursor=readReportCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT p.id,p.policy_id,p.selection,p.sender_id,p.created_at,h.state,h.version,COALESCE((SELECT jsonb_agg(jsonb_build_object('identity',r.recipient_identity,'address',r.address,'membershipId',r.membership_id,'entitlementRationale',r.entitlement_rationale) ORDER BY r.recipient_identity) FROM report_policy_recipients r WHERE r.policy_revision_id=p.id AND r.expires_at>now()),'[]'::jsonb) AS recipients,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('scheduleId',s.id,'state',s.state,'version',s.version,'timezone',s.timezone,'localTime',s.local_time,'nextRunAt',s.next_run_at) ORDER BY s.id) FROM report_schedules s WHERE s.policy_revision_id=p.id),'[]'::jsonb) AS schedules
   FROM report_recipient_policies p JOIN report_policy_heads h ON h.current_revision_id=p.id WHERE p.environment_id=$1 AND p.workspace_id=$2 AND p.customer_id=$3 AND ($4::timestamptz IS NULL OR (p.created_at,p.id)<($4::timestamptz,$5::uuid)) ORDER BY p.created_at DESC,p.id DESC LIMIT $6`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const page=rows.slice(0,input.limit),last=page.at(-1);
  const senders:Array<{senderId:string;address:string}>=[];try{const configured=configuredReportSender(),sender=await requireVerifiedReportSender(db,actor.workspaceId,configured.id);senders.push({senderId:sender.id,address:sender.address});}catch(error){if(!(error instanceof HttpFailure))throw error;}
  const memberships=(await db.query("SELECT m.id,p.login_name FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.workspace_id=$1 AND m.kind='internal' AND m.active AND p.active ORDER BY m.id LIMIT 51",[actor.workspaceId])).rows;
  if(memberships.length>50)throw new HttpFailure(422,'scope_too_large','Narrow the internal recipient membership choices');
  return {canManage:true,senders,memberships:memberships.map(row=>({membershipId:row.id,label:row.login_name})),policies:page.map(row=>({policyId:row.policy_id,policyRevisionId:row.id,state:row.state,version:Number(row.version),selection:row.selection,senderId:row.sender_id,recipients:row.recipients,schedules:row.schedules})),cursor:rows.length>input.limit&&last?createReportCursor(scope,last.created_at.toISOString(),last.id):null};
 });
}
export async function listReportDeliveries(actor:CurrentSession,reportId:string,raw:unknown){
 const parsed=pageSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid delivery page');const input=parsed.data;
 return reportTransaction(async db=>{
  const report=(await db.query('SELECT customer_id,audience FROM report_scopes WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[reportId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!report)throw hiddenRecord();
  await lockReportActor(db,actor,report.customer_id,'read',report.audience);if(actor.kind!=='internal')throw hiddenRecord();
  await chargeReportRate(db,actor.workspaceId,`read:${actor.membershipId}`,120,60);
  if(!isReportReviewer(actor))return {canManage:false,summary:(await db.query('SELECT d.state,count(*)::int AS count FROM report_deliveries d JOIN report_publications p ON p.id=d.publication_id WHERE p.report_id=$1 GROUP BY d.state ORDER BY d.state',[reportId])).rows,deliveries:[],cursor:null};
  await lockReportActor(db,actor,report.customer_id,'reconcile',report.audience);
  const scope={kind:'deliveries',actor:actor.membershipId,workspaceId:actor.workspaceId,reportId},cursor=readReportCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT d.id,d.state,d.version,d.attempt_count,d.failure_code,d.provider_message_id,d.first_dispatch_at,d.created_at,p.publication_number,
    (SELECT r.address FROM report_policy_recipients r WHERE r.policy_revision_id=d.policy_revision_id AND r.recipient_identity=d.recipient_identity AND r.expires_at>now()) AS address
   FROM report_deliveries d JOIN report_publications p ON p.id=d.publication_id WHERE p.report_id=$1 AND d.environment_id=$2 AND d.workspace_id=$3 AND ($4::timestamptz IS NULL OR (d.created_at,d.id)<($4::timestamptz,$5::uuid)) ORDER BY d.created_at DESC,d.id DESC LIMIT $6`,[reportId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const page=rows.slice(0,input.limit),last=page.at(-1);
  return {canManage:true,deliveries:page.map(row=>({deliveryId:row.id,state:row.state,version:Number(row.version),attemptCount:row.attempt_count,failureCode:row.failure_code,providerMessageId:row.provider_message_id,firstDispatchAt:row.first_dispatch_at?.toISOString()??null,address:row.address,publicationNumber:Number(row.publication_number)})),cursor:rows.length>input.limit&&last?createReportCursor(scope,last.created_at.toISOString(),last.id):null};
 });
}
