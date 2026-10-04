import type {CurrentSession} from '../auth/sessions';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {reportTransaction} from './commands';
import {reportHead} from './revisions';
import {lockReportActor} from './policy';
import {readReportCursor,createReportCursor} from './cursors';
import {reportReadProjection} from './read';
import {reportCorrectionComparison} from './corrections';

const pageSchema=z.strictObject({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(2000).optional()});
export async function readReportHistory(actor:CurrentSession,reportId:string,raw:unknown){
 const parsed=pageSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid history filters');
 return reportTransaction(async db=>{
   const head=await reportHead(db,actor,reportId);
   const published=actor.kind==='partner'&&Boolean((await db.query('SELECT 1 FROM report_publications WHERE report_id=$1 AND environment_id=$2 AND workspace_id=$3 LIMIT 1',[reportId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rowCount);
   await lockReportActor(db,actor,head.customer_id,'read',head.audience,published);
  const scope={actor:actor.membershipId,reportId,kind:'history'},input=parsed.data,cursor=readReportCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT r.id,r.revision_number,r.as_of,r.predecessor_id,r.created_at,
   p.id AS publication_id,p.correction_of,st.visibility FROM report_revisions r
   JOIN report_revision_states st ON st.revision_id=r.id LEFT JOIN report_publications p ON p.revision_id=r.id
   WHERE r.report_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3 AND (NOT $4 OR p.id IS NOT NULL)
   AND ($5::timestamptz IS NULL OR (r.created_at,r.id)<($5::timestamptz,$6::uuid))
   ORDER BY r.created_at DESC,r.id DESC LIMIT $7`,[reportId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.kind==='partner',cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
   const page=rows.slice(0,input.limit),items=[];
   // Transaction-local only: current authority and exact source fences are still
   // checked once for every distinct revision, never reused across requests.
   const projections=new Map<string,ReturnType<typeof reportReadProjection>>();
   const project=(revisionId:string)=>{
    let projection=projections.get(revisionId);
    if(!projection){projection=reportReadProjection(db,actor,reportId,revisionId);projections.set(revisionId,projection);}
    return projection;
   };
   for(const row of page){
    const current=await project(row.id);
   items.push({revisionId:row.id,revisionNumber:Number(row.revision_number),asOf:row.as_of.toISOString(),publicationId:row.publication_id??null,
    correctionOf:row.correction_of??null,visibility:current.visibility,state:current.state,
     comparison:row.predecessor_id?await reportCorrectionComparison(db,actor,reportId,row.id,project):null});
  }
  const last=page.at(-1);
  return {revisions:items,cursor:rows.length>input.limit&&last?createReportCursor(scope,last.created_at.toISOString(),last.id):null};
 });
}

export async function readReportSourceLabels(actor:CurrentSession,reportId:string){
 return reportTransaction(async db=>{
  const view=await reportReadProjection(db,actor,reportId);
  return {reportId,revisionId:view.revisionId,visibility:view.visibility,sources:view.document?.citations??[]};
 });
}
