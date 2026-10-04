import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportTransaction,reportDigest} from './commands';
import {lockReportActor,isReportReviewer} from './policy';
import {reportHead} from './revisions';
import {reportRevisionFence} from './release';
import {validateReportDocument} from '../../reports/document';
import {chargeReportRate} from './rates';
import {createReportCursor,readReportCursor} from './cursors';
import {requireReportGlyphs,reportDocumentText} from './fonts';
const listSchema=z.strictObject({kind:z.enum(['weekly','monthly','quarterly']).optional(),audience:z.enum(['delivery','account_team','leadership']).optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(2000).optional()});
export async function reportReadProjection(db:PoolClient,actor:CurrentSession,reportId:string,revisionId?:string){
 const head=await reportHead(db,actor,reportId);
 const published=(await db.query(`SELECT * FROM report_publications WHERE report_id=$1 ${revisionId?'AND revision_id=$2':''} ORDER BY publication_number DESC LIMIT 1`,revisionId?[reportId,revisionId]:[reportId])).rows[0];
 const selectedId=revisionId??(actor.kind==='partner'?published?.revision_id:head.current_revision_id);
 await lockReportActor(db,actor,head.customer_id,'read',head.audience,Boolean(published && published.revision_id===selectedId));
 if(!selectedId)throw hiddenRecord();
 const metadata=(await db.query('SELECT id,revision_number,as_of,partial,report_id FROM report_revisions WHERE id=$1 AND report_id=$2',[selectedId,reportId])).rows[0];if(!metadata)throw hiddenRecord();
 const base={reportId,revisionId:selectedId,version:Number(head.version),revisionNumber:Number(metadata.revision_number),customerId:head.customer_id,kind:head.kind,audience:head.audience,
   period:{fromDate:head.from_date,toDate:head.to_date},timezone:head.timezone,asOf:new Date(metadata.as_of).toISOString(),partial:metadata.partial,publicationId:published?.revision_id===selectedId?published.id:null,canReview:isReportReviewer(actor)};
 try{
  const fence=await reportRevisionFence(db,actor.workspaceId,selectedId,{published:Boolean(base.publicationId)});
  const payload=(await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[selectedId])).rows[0];
  const document=validateReportDocument(payload.document);if(reportDigest(document)!==fence.content_digest)throw new HttpFailure(409,'source_changed','Report changed');
  await requireReportGlyphs(reportDocumentText(document));
  const artifacts=(await db.query(`SELECT id,format,size_bytes,content_digest FROM report_artifacts WHERE revision_id=$1 AND validation_id IS NOT NULL ORDER BY format`,[selectedId])).rows.map(row=>({id:row.id,format:row.format,sizeBytes:Number(row.size_bytes),contentDigest:row.content_digest}));
  return {...base,state:fence.state,visibility:fence.reviewRequired?'review_required':'current',document,artifacts};
 }catch(error){if(error instanceof HttpFailure && ['source_changed','brand_unapproved','font_unavailable'].includes(error.code))return {...base,state:'withheld',visibility:'withheld',document:null,artifacts:[]};throw error;}
}
export async function readReport(actor:CurrentSession,reportId:string,revisionId?:string){
 return reportTransaction(async db=>{const head=await reportHead(db,actor,reportId);await lockReportActor(db,actor,head.customer_id,'read',head.audience,actor.kind==='partner');await chargeReportRate(db,actor.workspaceId,`read:${actor.membershipId}`,120,60);return reportReadProjection(db,actor,reportId,revisionId);});
}
export async function listCustomerReports(actor:CurrentSession,customerId:string,raw:unknown){
 const parsed=listSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report filters');const input=parsed.data;
 return reportTransaction(async db=>{
  await lockReportActor(db,actor,customerId,'read',actor.kind==='partner'?'delivery':input.audience??'delivery',actor.kind==='partner');
  await chargeReportRate(db,actor.workspaceId,`read:${actor.membershipId}`,120,60);
  if(actor.kind==='partner' && input.audience && input.audience!=='delivery')throw hiddenRecord();
  const scope={actor:actor.membershipId,workspace:actor.workspaceId,customerId,kind:input.kind??null,audience:input.audience??null,partner:actor.kind==='partner'},cursor=readReportCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT s.id,s.kind,s.audience,s.from_date::text,s.to_date::text,s.timezone,s.version,s.created_at,st.state,st.visibility,
    EXISTS(SELECT 1 FROM report_publications p WHERE p.report_id=s.id) AS published
   FROM report_scopes s LEFT JOIN report_revision_states st ON st.revision_id=s.current_revision_id
   WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3 AND ($4::text IS NULL OR s.kind=$4) AND ($5::text IS NULL OR s.audience=$5)
   AND (NOT $6::boolean OR (s.audience='delivery' AND EXISTS(SELECT 1 FROM report_publications p WHERE p.report_id=s.id)))
   AND ($7::timestamptz IS NULL OR (s.created_at,s.id)<($7::timestamptz,$8::uuid)) ORDER BY s.created_at DESC,s.id DESC LIMIT $9`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,input.kind??null,input.audience??null,actor.kind==='partner',cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const page=rows.slice(0,input.limit),last=page.at(-1);
  return {reports:page.map(row=>({reportId:row.id,kind:row.kind,audience:row.audience,period:{fromDate:row.from_date,toDate:row.to_date},timezone:row.timezone,version:Number(row.version),state:actor.kind==='partner'?'published':row.state,visibility:actor.kind==='partner'?'check_on_open':row.visibility,published:row.published})),cursor:rows.length>input.limit && last?createReportCursor(scope,new Date(last.created_at).toISOString(),last.id):null};
 });
}
