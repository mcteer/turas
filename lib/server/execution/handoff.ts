import {Temporal} from "@js-temporal/polyfill";
import type {PoolClient} from "pg";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import type {ExecutionActor} from "./policy";
import type {ExecutionRecordContent,ExecutionSource} from "./schema";
/** Extra relationships are captured as exact immutable source edges at intake.
 * Submission and review reuse these edges, never a newly selected obligation head. */
export async function handoffReferences(db:PoolClient,actor:ExecutionActor,engagementId:string,baselineId:string,content:ExecutionRecordContent):Promise<ExecutionSource[]>{
  if(content.kind!=="handoff"&&content.kind!=="closeout")return [];
  const rows=(await db.query(`SELECT r.id,v.id AS revision_id,v.revision_number,v.content_digest,r.kind FROM execution_records r
    JOIN execution_record_revisions v ON v.id=r.accepted_revision_id WHERE r.engagement_id=$1 AND r.baseline_id=$2 AND r.workspace_id=$3 AND r.environment_id=$4
    AND (v.audience='delivery' OR $5='internal') AND (r.id=ANY($6::uuid[]) OR v.id=$7) ORDER BY r.id`,
    [engagementId,baselineId,actor.workspaceId,process.env.TURAS_ENVIRONMENT_ID,content.audience,content.openObligationIds,content.kind==="closeout"?content.handoffRevisionId:null])).rows;
  if(content.openObligationIds.some(id=>!rows.some(r=>r.id===id))||content.kind==="closeout"&&!rows.some(r=>r.revision_id===content.handoffRevisionId&&r.kind==="handoff"))throw hiddenRecord();
  return rows.map(r=>({kind:"execution_record",id:r.id,sourceRevisionId:r.revision_id,generation:Number(r.revision_number),contentDigest:r.content_digest}));
}
export async function validateHandoffContent(db:PoolClient,actor:ExecutionActor,engagementId:string,baselineId:string,content:ExecutionRecordContent){
  if(!["handoff","closeout","outcome"].includes(content.kind))return;
  if(actor.kind!=="internal")throw new HttpFailure(403,"forbidden","Internal delivery authoring required");
  const today=Temporal.Now.plainDateISO(content.timezone).toString();
  if(content.kind==="outcome"){
    if(content.measurementEnd&&content.measurementEnd>today)throw new HttpFailure(422,"invalid_input","Measurement window cannot end in the future");return;
  }
  if(content.kind!=="handoff"&&content.kind!=="closeout")return;
  if(content.acknowledgement.eventDate&&content.acknowledgement.eventDate>today)throw new HttpFailure(422,"invalid_input","Acknowledgement cannot be future dated");
  const keys=(await db.query("SELECT item_key FROM execution_baseline_items WHERE baseline_id=$1 AND item_kind='milestone'",[baselineId])).rows;
  if(content.deliverables.some(d=>!keys.some(k=>k.item_key===d.milestoneKey)))throw new HttpFailure(422,"invalid_input","Use exact accepted milestone criteria");
  await handoffReferences(db,actor,engagementId,baselineId,content);
}
