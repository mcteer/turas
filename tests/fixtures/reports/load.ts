import {randomUUID} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {seedExecutionBenchmark} from '../execution/benchmark';
import {requireOwnedReportsDatabase} from './environment';
import {reportTransaction} from '../../../lib/server/reports/commands';
import {submitReportCustomerCommand} from '../../../lib/server/reports/service';
import {reportDigest} from '../../../lib/server/reports/commands';

export const reportLoadShape={engagements:1000,resources:500,timeRevisions:50000,deliveryRevisions:20000,reportHistories:5000,clients:5,warmups:10,samples:100} as const;
/** Bulk history is load, not approval evidence. Constraints and triggers stay enabled. */
export async function seedReportLoad(){
 await requireOwnedReportsDatabase();
 const execution=await seedExecutionBenchmark({reporting:true});
 process.env.TURAS_REPORTS_ENABLED='true';
 const day=Temporal.PlainDate.from(execution.period.from),monday=day.subtract({days:day.dayOfWeek-1});
 const customerId=await reportTransaction(async db=>(await db.query('SELECT customer_id FROM engagements WHERE id=$1',[execution.engagements[0].engagementId])).rows[0].customer_id as string);
 const command={action:'prepare' as const,requestKey:randomUUID(),expectedVersion:0 as const,selection:{kind:'weekly' as const,audience:'delivery' as const,timezone:'UTC',engagementIds:[execution.engagements[0].engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:monday.toString(),toDate:monday.add({days:6}).toString(),partial:true};
 const report=await submitReportCustomerCommand(execution.users[0],customerId,command) as {reportId:string;revisionId:string;document:unknown};
 await reportTransaction(async db=>{
  const template=(await db.query('SELECT * FROM report_revisions WHERE id=$1',[report.revisionId])).rows[0];
  const dependencies=(await db.query('SELECT * FROM report_dependencies WHERE revision_id=$1',[report.revisionId])).rows;
  const payload=(await db.query('SELECT * FROM report_revision_payloads WHERE revision_id=$1',[report.revisionId])).rows[0];
  for(let start=2;start<=reportLoadShape.reportHistories;start+=100){
   const revisions=[],payloads=[],states=[],sources=[];
   for(let index=start;index<Math.min(start+100,reportLoadShape.reportHistories+1);index++){
    const id=randomUUID();revisions.push({...template,id,revision_number:index,predecessor_id:report.revisionId});
    payloads.push({...payload,revision_id:id});states.push({revision_id:id,state:'draft',visibility:'current',generation:1,payload_expires_at:new Date(Date.now()+30*86400000).toISOString(),reason_code:null,updated_at:new Date().toISOString()});
    for(const source of dependencies)sources.push({...source,id:randomUUID(),revision_id:id});
   }
   // Table names are authored constants, not caller-controlled identifiers.
   for(const [table,rows]of [['report_revisions',revisions],['report_revision_payloads',payloads],['report_revision_states',states],['report_dependencies',sources]] as const){
    if(!rows.length)continue;const columns=Object.keys(rows[0]);
    await db.query(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(rows)]);
   }
  }
  const count=Number((await db.query('SELECT count(*) AS n FROM report_revisions')).rows[0].n);
  if(count!==reportLoadShape.reportHistories)throw new Error('Representative report history count differs');
  await db.query('ANALYZE');
 });
 return {...execution,customerId,report,command,expectedApprovedMinutes:5};
}

/** Boundary load only, never a send/review fixture; all database constraints stay on. */
export async function fillReportDeliveryQueue(){
 await requireOwnedReportsDatabase();
 await reportTransaction(async db=>{
  const template=(await db.query('SELECT * FROM report_deliveries')).rows;
  if(template.length!==1)throw new Error('Delivery boundary fixture requires one governed intent');
  const identity=(await db.query('SELECT * FROM report_recipient_identities WHERE id=$1',[template[0].recipient_identity])).rows[0];
  const identities=[],deliveries=[];
  for(let index=1;index<500;index++){
   const id=randomUUID();identities.push({...identity,id,recipient_digest:reportDigest({syntheticLoadIdentity:index})});
   deliveries.push({...template[0],id:randomUUID(),recipient_identity:id,provider_key:randomUUID()});
  }
  for(const [table,rows]of [['report_recipient_identities',identities],['report_deliveries',deliveries]] as const){
   const columns=Object.keys(rows[0]);await db.query(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(rows)]);
  }
 });
}

export async function seedReportRecordOverflow(engagementId:string){
 await requireOwnedReportsDatabase();
 await reportTransaction(async db=>{
  const head=(await db.query("SELECT * FROM execution_records WHERE engagement_id=$1 AND state='accepted' LIMIT 1",[engagementId])).rows[0];
  if(!head)throw new Error('Overflow fixture requires a current accepted load record');
  const revision=(await db.query('SELECT * FROM execution_record_revisions WHERE id=$1',[head.accepted_revision_id])).rows[0];
  const payload=(await db.query('SELECT * FROM execution_record_payloads WHERE revision_id=$1',[revision.id])).rows[0];
  const decision=(await db.query("SELECT * FROM execution_review_decisions WHERE revision_id=$1 AND action='accept'",[revision.id])).rows[0];
  const decisionPayload=(await db.query('SELECT * FROM execution_review_payloads WHERE decision_id=$1',[decision.id])).rows[0];
  for(let start=0;start<1001;start+=100){
   const heads=[],revisions=[],payloads=[],decisions=[],decisionPayloads=[],ids:string[]=[];
   for(let index=start;index<Math.min(start+100,1001);index++){
    const id=randomUUID(),revisionId=randomUUID(),decisionId=randomUUID();ids.push(id);
    heads.push({...head,id,current_revision_id:null,accepted_revision_id:null});revisions.push({...revision,id:revisionId,record_id:id});payloads.push({...payload,revision_id:revisionId});
    decisions.push({...decision,id:decisionId,record_id:id,revision_id:revisionId,request_key:randomUUID()});decisionPayloads.push({...decisionPayload,decision_id:decisionId});
   }
   for(const [table,rows]of [['execution_records',heads],['execution_record_revisions',revisions],['execution_record_payloads',payloads],['execution_review_decisions',decisions],['execution_review_payloads',decisionPayloads]] as const){
    const columns=Object.keys(rows[0]);await db.query(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(rows)]);
   }
   await db.query('UPDATE execution_records h SET current_revision_id=r.id,accepted_revision_id=r.id FROM execution_record_revisions r WHERE r.record_id=h.id AND h.id=ANY($1::uuid[])',[ids]);
  }
 });
}
