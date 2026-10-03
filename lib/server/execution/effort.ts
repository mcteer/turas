import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {HttpFailure} from "../../contracts/http";
import type {ExecutionActor} from "./policy";
import type {ExecutionRecordContent} from "./schema";
export function validateEffortContent(actor:ExecutionActor,content:ExecutionRecordContent){
  if(content.kind!=="effort_budget"&&content.kind!=="estimate")return;
  if(actor.kind!=="internal")throw new HttpFailure(403,"forbidden","Internal delivery authoring required");
  if(content.kind==="estimate"&&Date.parse(content.asOf)>Date.now())throw new HttpFailure(422,"invalid_input","Estimate as-of cannot be in the future");
}
export async function effortReviewInputs(db:PoolClient,engagementId:string,baselineId:string,recordId:string,content:ExecutionRecordContent){
  if(content.kind!=="effort_budget"&&content.kind!=="estimate")return null;
  const head=(await db.query<{id:string;version:string;revision_id:string;record_id:string}>(`SELECT h.id,h.version,h.revision_id,v.record_id FROM execution_effort_heads h
    JOIN execution_record_revisions v ON v.id=h.revision_id WHERE h.engagement_id=$1 AND h.baseline_id=$2 AND h.work_package_key=$3 AND h.kind=$4 FOR UPDATE OF h`,
    [engagementId,baselineId,content.workPackageKey,content.kind])).rows[0]??null;
  const previous=head&&head.record_id!==recordId?(await db.query<{id:string;accepted_revision_id:string;current_revision_id:string;version:string;content_digest:string}>(`SELECT r.id,r.accepted_revision_id,r.current_revision_id,r.version,v.content_digest
    FROM execution_records r JOIN execution_record_revisions v ON v.id=r.accepted_revision_id WHERE r.id=$1`,[head.record_id])).rows:[];
  if(content.references.some(ref=>previous.some(r=>r.accepted_revision_id===ref.sourceRevisionId)))throw new HttpFailure(422,"approval_blocked","Effort cannot depend on the acceptance it replaces");
  return {head,previous};
}
export async function acceptEffort(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,revisionId:string,content:ExecutionRecordContent){
  if(content.kind!=="effort_budget"&&content.kind!=="estimate")return;
  await db.query(`INSERT INTO execution_effort_heads(id,environment_id,workspace_id,customer_id,engagement_id,baseline_id,work_package_key,kind,revision_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(baseline_id,work_package_key,kind) DO UPDATE SET revision_id=excluded.revision_id,version=execution_effort_heads.version+1`,
    [randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,baselineId,content.workPackageKey,content.kind,revisionId]);
}
