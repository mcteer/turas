import {gapExportChunks,assertGapExportCurrent} from './report-release';
import type {GapActor} from './policy';
import {gapRead} from './commands';
import {gapApprovedReport} from './report-release';
import {getServerConfig} from '../config';
import {hiddenRecord} from '../../contracts/http';
export async function gapExportResponse(actor:GapActor,reportId:string,exportId:string){
 const metadata=await gapRead(actor,async db=>{const row=(await db.query('SELECT e.*,a.format FROM gap_export_receipts e JOIN gap_export_artifacts a ON a.id=e.artifact_id WHERE e.id=$1 AND e.report_id=$2 AND e.environment_id=$3 AND e.workspace_id=$4 AND e.actor_membership_id=$5',[exportId,reportId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];if(!row)throw hiddenRecord();const current=await gapApprovedReport(db,actor,reportId,row.review_id);return {...row,approvedAt:current.review.created_at.toISOString(),reviewer:current.review.reviewer_membership_id};},true);
 const iterator=gapExportChunks(actor,reportId,exportId),first=await iterator.next();let pending:IteratorResult<Buffer>|null=first;
 const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const item=pending??await iterator.next();if(pending){await assertGapExportCurrent(actor,reportId,exportId);pending=null;}if(item.done)controller.close();else controller.enqueue(item.value);}catch(error){await iterator.return();controller.error(error);}},async cancel(){await iterator.return();}});
 return new Response(stream,{headers:{'Cache-Control':'private, no-store','Content-Type':metadata.format==='json'?'application/json; charset=utf-8':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${exportId}.${metadata.format==='json'?'json':'md'}"`,'X-Content-Type-Options':'nosniff','X-Turas-Review-Id':metadata.review_id,'X-Turas-Approved-At':metadata.approvedAt,'X-Turas-Reviewer':metadata.reviewer,'X-Turas-Audience-Digest':metadata.audience_digest,'X-Turas-Content-Digest':metadata.content_digest,'X-Turas-Byte-Length':String(metadata.size_bytes)}});
}
