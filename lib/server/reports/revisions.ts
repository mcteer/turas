import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportDigest} from './commands';
import {reportSelectionSchema,type reportPrepareSchema} from './schema';
import {captureReportSnapshot} from './snapshots';
import {composeWeeklyReport} from './weekly';
import {composeExecutiveReport} from './executive';
import {registerReportBrand,requireCurrentReportBrand} from './brand';
import {prepareReportMail} from './mail-content';
import {chargeReportRate} from './rates';
import type {z} from 'zod';
export type ReportAuthor=Pick<CurrentSession,'workspaceId'|'membershipId'>;
export async function reportHead(db:PoolClient,actor:ReportAuthor,id:string,lock=false){
 const row=(await db.query(`SELECT s.*,s.from_date::text AS from_date,s.to_date::text AS to_date,v.partial FROM report_scopes s LEFT JOIN report_revisions v ON v.id=s.current_revision_id WHERE s.id=$1 AND s.environment_id=$2 AND s.workspace_id=$3 ${lock?'FOR UPDATE OF s':''}`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return row;
}
export async function appendReportRevision(db:PoolClient,actor:ReportAuthor,head:any,annotations:string[]=[],predecessorId:string|null=null){
 await chargeReportRate(db,actor.workspaceId,'draft-generation',20,3600);
 const selection=reportSelectionSchema.parse({kind:head.kind,audience:head.audience,timezone:head.timezone,engagementIds:head.engagement_ids,workloadIds:head.workload_ids,includeCustomerLevel:head.include_customer_level});
 const snapshot=await captureReportSnapshot(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:actor.workspaceId,customerId:head.customer_id,audience:selection.audience},selection,head.from_date,head.to_date,head.partial??false);
 const document=selection.kind==='weekly'?composeWeeklyReport(snapshot,annotations,predecessorId):composeExecutiveReport(snapshot,annotations,predecessorId),contentDigest=reportDigest(document),brandId=await registerReportBrand(db,actor.workspaceId),brand=await requireCurrentReportBrand(db,actor.workspaceId,brandId,false);
 const number=Number((await db.query('SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM report_revisions WHERE report_id=$1',[head.id])).rows[0].n),revisionId=randomUUID();
 await db.query(`INSERT INTO report_revisions(id,environment_id,workspace_id,customer_id,report_id,revision_number,predecessor_id,schema_version,template_version,projection_version,formula_version,as_of,partial,content_digest,source_set_digest,brand_id,brand_version,generation_watches,author_membership_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,'reports-v1',$8,'report-projection-v1','report-metrics-v1',$9,$10,$11,$12,$13,$14,$15,$16)`,[revisionId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,head.customer_id,head.id,number,predecessorId,document.templateVersion,snapshot.asOf,document.partial,contentDigest,snapshot.sourceSetDigest,brandId,Number(brand.version),JSON.stringify(snapshot.generationWatches),actor.membershipId]);
 await db.query(`INSERT INTO report_revision_payloads(revision_id,document) VALUES($1,$2)`,[revisionId,JSON.stringify(document)]);
 for(const source of snapshot.dependencies)await db.query(`INSERT INTO report_dependencies(id,environment_id,workspace_id,customer_id,revision_id,source_kind,source_id,source_revision_id,decision_id,engagement_id,generation,content_digest,eligibility_class)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,head.customer_id,revisionId,source.kind,source.id,source.revisionId,source.decisionId,source.engagementId,source.generation,source.contentDigest,source.kind==='approved_time'?'approved_aggregate':selection.audience]);
 const inputs={effort:snapshot.calculations.map(calculation=>({engagementId:calculation.engagementId,input:calculation.input,inputDigest:calculation.inputDigest})),measurements:snapshot.measurements.map(measurement=>measurement.input)};
 await db.query(`INSERT INTO report_calculations(revision_id,formula_version,inputs,results,input_digest,time_decisions) VALUES($1,'report-metrics-v1',$2,$3,$4,$5)`,[revisionId,JSON.stringify(inputs),JSON.stringify({effort:snapshot.calculations.map(calculation=>({engagementId:calculation.engagementId,results:calculation.results})),measurements:snapshot.measurements.map(measurement=>({revisionId:measurement.input.revisionId,result:measurement.result}))}),reportDigest(inputs),JSON.stringify(snapshot.calculations.flatMap(calculation=>calculation.timeDecisions))]);
 const mail=prepareReportMail(document);
 await db.query(`INSERT INTO report_mail_payloads(revision_id,html,plain_text,content_digest) VALUES($1,$2,$3,$4)`,[revisionId,mail.html,mail.plainText,mail.contentDigest]);
 await db.query(`INSERT INTO report_revision_states(revision_id,state) VALUES($1,'draft')`,[revisionId]);
 await db.query('UPDATE report_scopes SET current_revision_id=$2,version=version+1 WHERE id=$1',[head.id,revisionId]);
 return {reportId:head.id,revisionId,version:Number(head.version)+1};
}
export async function prepareReportRevision(db:PoolClient,actor:ReportAuthor,customerId:string,command:z.infer<typeof reportPrepareSchema>){
 const scopeDigest=reportDigest({selection:{...command.selection,engagementIds:[...command.selection.engagementIds].sort(),workloadIds:[...command.selection.workloadIds].sort()},fromDate:command.fromDate,toDate:command.toDate});
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-scope:${process.env.TURAS_ENVIRONMENT_ID}:${actor.workspaceId}:${scopeDigest}`]);
 const prior=(await db.query('SELECT id FROM report_scopes WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND scope_digest=$4',[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,scopeDigest])).rows[0];
 if(prior)throw new HttpFailure(409,'version_conflict','This period already has a report; create a new revision');
 const id=randomUUID();
 await db.query(`INSERT INTO report_scopes(id,environment_id,workspace_id,customer_id,kind,audience,timezone,from_date,to_date,engagement_ids,workload_ids,include_customer_level,scope_digest,owner_membership_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,command.selection.kind,command.selection.audience,command.selection.timezone,command.fromDate,command.toDate,command.selection.engagementIds,command.selection.workloadIds,command.selection.includeCustomerLevel,scopeDigest,actor.membershipId]);
 return appendReportRevision(db,actor,{id,customer_id:customerId,kind:command.selection.kind,audience:command.selection.audience,timezone:command.selection.timezone,from_date:command.fromDate,to_date:command.toDate,engagement_ids:command.selection.engagementIds,workload_ids:command.selection.workloadIds,include_customer_level:command.selection.includeCustomerLevel,version:1,partial:command.partial});
}
