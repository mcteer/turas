import type {PoolClient} from "pg";
import {HttpFailure} from "../../contracts/http";
import type {ExecutionActor} from "./policy";
import type {ExecutionRecordContent,ExecutionSource} from "./schema";
import {executionDigest} from "./commands";
import {executionRevisionEligible} from "./sources";

export async function closeoutReferences(db:PoolClient,actor:ExecutionActor,engagementId:string,baselineId:string):Promise<ExecutionSource[]>{
  const rows=(await db.query(`SELECT r.id,v.id AS revision_id,v.revision_number,v.content_digest FROM execution_records r
    JOIN execution_record_revisions v ON v.id=r.accepted_revision_id WHERE r.engagement_id=$1 AND r.baseline_id=$2 AND r.kind<>'closeout'
    AND r.workspace_id=$3 AND r.environment_id=$4 AND (v.audience='delivery' OR $5='internal') ORDER BY r.id LIMIT 201`,
    [engagementId,baselineId,actor.workspaceId,process.env.TURAS_ENVIRONMENT_ID,actor.kind])).rows;
  if(rows.length>200)throw new HttpFailure(422,"scope_too_large","Narrow the closeout evidence snapshot");
  return rows.map(r=>({kind:"execution_record",id:r.id,sourceRevisionId:r.revision_id,generation:Number(r.revision_number),contentDigest:r.content_digest}));
}
/** Opaque metadata for current closeout validation. Never returns private record
 * names, counts or payloads to a partner. All caller paths hold live scope access. */
async function closeoutMetadata(db:PoolClient,engagementId:string,baselineId:string,handoffRevisionId:string){
  const records=(await db.query(`SELECT id,accepted_revision_id AS revision_id FROM execution_records
    WHERE engagement_id=$1 AND baseline_id=$2 AND kind<>'closeout' AND accepted_revision_id IS NOT NULL ORDER BY id`,[engagementId,baselineId])).rows;
  const milestones=(await db.query(`SELECT id,milestone_key,state,version,current_event_id FROM execution_milestone_heads WHERE engagement_id=$1 AND baseline_id=$2 ORDER BY id`,[engagementId,baselineId])).rows;
  const actuals=(await db.query(`SELECT entry_id,revision_id,decision_id,minutes FROM execution_actual_days WHERE engagement_id=$1 ORDER BY entry_id`,[engagementId])).rows;
  const pendingTime=Number((await db.query("SELECT count(*) AS n FROM execution_time_entries WHERE engagement_id=$1 AND state='submitted'",[engagementId])).rows[0].n);
  if(records.length>200||actuals.length>10000)throw new HttpFailure(422,"scope_too_large","Narrow the closeout snapshot");
  const result={baselineId,handoffRevisionId,records,milestones,actuals,pendingTime};
  if(Buffer.byteLength(JSON.stringify(result),"utf8")>262144)throw new HttpFailure(422,"scope_too_large","Narrow the closeout snapshot");
  return result;
}
export async function closeoutReviewInputs(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,content:ExecutionRecordContent){
  if(content.kind!=="closeout")return null;
  const inputs=await closeoutMetadata(db,engagementId,baselineId,content.handoffRevisionId),blockers:string[]=[];
  if(!inputs.milestones.length||inputs.milestones.some(m=>!["accepted","waived"].includes(m.state)))blockers.push("milestones_incomplete");
  for(const m of inputs.milestones){
    const evidence=(await db.query("SELECT evidence_revision_ids FROM execution_milestone_events WHERE id=$1",[m.current_event_id])).rows[0]?.evidence_revision_ids??[];
    for(const revision of evidence)if(!await executionRevisionEligible(db,actor,customerId,engagementId,revision,"internal",false))blockers.push("milestone_evidence_unavailable");
  }
  const records=(await db.query<{id:string;kind:string;revision_id:string;content:ExecutionRecordContent}>(`SELECT r.id,r.kind,r.accepted_revision_id AS revision_id,p.content FROM execution_records r
    LEFT JOIN execution_record_payloads p ON p.revision_id=r.accepted_revision_id WHERE r.engagement_id=$1 AND r.baseline_id=$2 AND r.accepted_revision_id IS NOT NULL AND r.kind IN ('raid','handoff')`,[engagementId,baselineId])).rows;
  if(records.some(r=>r.kind==="raid"&&(!r.content||(r.content.kind==="raid"&&["issue","dependency"].includes(r.content.raidType)&&["high","critical"].includes(r.content.severity)&&!["resolved","accepted_exception"].includes(r.content.status)))))blockers.push("blocking_concerns");
  const handoff=records.find(r=>r.kind==="handoff"&&r.revision_id===content.handoffRevisionId)?.content;
  if(!handoff||handoff.kind!=="handoff"||handoff.acknowledgement.state!=="recorded"||content.acknowledgement.state!=="recorded"||
    handoff.acknowledgement.eventDate!==content.acknowledgement.eventDate||executionDigest(handoff.receiver)!==executionDigest(content.receiver))blockers.push("receiver_acknowledgement_missing");
  if(inputs.pendingTime)blockers.push("submitted_time_pending");
  if(blockers.length)throw new HttpFailure(422,"approval_blocked",`Closeout conditions unmet: ${[...new Set(blockers)].join(", ")}`);
  return {inputs,inputDigest:executionDigest(inputs)};
}
export async function recordCloseout(db:PoolClient,executionId:string,revisionId:string,snapshot:NonNullable<Awaited<ReturnType<typeof closeoutReviewInputs>>>){
  await db.query("INSERT INTO execution_closeout_snapshots(revision_id,input_digest,inputs) VALUES($1,$2,$3)",[revisionId,snapshot.inputDigest,JSON.stringify(snapshot.inputs)]);
  await db.query("UPDATE execution_workspaces SET state='closed',closeout_revision_id=$2 WHERE id=$1",[executionId,revisionId]);
}
/** Source mutators enqueue exact revision invalidations in their transaction.
 * Checking that durable metadata makes source loss visible even with purge paused,
 * without reading or exposing internal record payloads to a delivery-only reader. */
export async function closeoutNeedsReview(db:PoolClient,engagementId:string,baselineId:string,revisionId:string):Promise<boolean>{
  const snapshot=(await db.query<{input_digest:string;inputs:{handoffRevisionId:string;records:Array<{revision_id:string}>}}>("SELECT input_digest,inputs FROM execution_closeout_snapshots WHERE revision_id=$1",[revisionId])).rows[0];
  if(!snapshot||(await db.query("SELECT 1 FROM execution_closeout_invalidations WHERE revision_id=$1",[revisionId])).rowCount)return true;
  const metadata=await closeoutMetadata(db,engagementId,baselineId,snapshot.inputs.handoffRevisionId);
  if(executionDigest(metadata)!==snapshot.input_digest)return true;
  return !!(await db.query(`SELECT 1 FROM execution_cleanup_jobs WHERE engagement_id=$1 AND payload_kind='record' AND revision_id=ANY($2::uuid[]) LIMIT 1`,
    [engagementId,snapshot.inputs.records.map(r=>r.revision_id)])).rowCount;
}
