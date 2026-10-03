import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
import { hiddenRecord } from "../../contracts/http";
import { isExecutionReviewer, type ExecutionActor } from "./policy";
import { executionRevisionEligible } from "./sources";

export type ExecutionRecordMetadata = { id: string; author_membership_id: string; current_revision_id: string | null;
  accepted_revision_id: string | null; version: string; state: string; kind: string; baseline_id: string };
/** Select proposal and accepted heads independently. A pending correction never
 * removes another reader's accepted head or releases a hidden proposal identity. */
export function visibleExecutionRevision(actor: ExecutionActor, record: ExecutionRecordMetadata): string | null {
  return record.author_membership_id === actor.membershipId || isExecutionReviewer(actor)
    ? record.current_revision_id : record.accepted_revision_id;
}
export async function projectExecutionRecord(db: PoolClient, actor: ExecutionActor, customerId: string,
  engagementId: string, record: ExecutionRecordMetadata, acceptedOnly=false) {
  const revisionId = acceptedOnly ? record.accepted_revision_id : visibleExecutionRevision(actor, record);
  if (!revisionId) return null;
  const audience = actor.kind === "partner" ? "delivery" : "internal";
  const header = (await db.query<{ id: string; audience: string; revision_number: string; content_digest: string; event_date: string; timezone: string }>(`SELECT id,audience,revision_number,content_digest,event_date::text,timezone
    FROM execution_record_revisions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4
      AND engagement_id=$5 AND (audience='delivery' OR $6='internal')`,
    [revisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,audience])).rows[0];
  if (!header) return null;
  const eligible = await executionRevisionEligible(db, actor, customerId, engagementId, revisionId, audience, true);
  const own=record.author_membership_id===actor.membershipId,reviewer=isExecutionReviewer(actor);
  const acceptedVersion=acceptedOnly||(!own&&!reviewer)?(await db.query<{expected_version:string}>("SELECT expected_version FROM execution_review_decisions WHERE revision_id=$1 AND action='accept' ORDER BY created_at DESC LIMIT 1",[revisionId])).rows[0]?.expected_version:null;
  const acceptedDigest=reviewer&&record.accepted_revision_id?(await db.query<{content_digest:string}>("SELECT content_digest FROM execution_record_revisions WHERE id=$1",[record.accepted_revision_id])).rows[0]?.content_digest:null;
  const metadata = { id: record.id, revisionId, kind: record.kind, baselineId: record.baseline_id,
    acceptedRevisionId:own||reviewer?record.accepted_revision_id:revisionId, acceptedContentDigest:acceptedOnly?header.content_digest:acceptedDigest??null, version: acceptedVersion?Number(acceptedVersion)+1:Number(record.version), canRevise:!acceptedOnly&&own&&!["submitted","retracted"].includes(record.state), canSubmit:!acceptedOnly&&own&&record.state==="draft", canReview:!acceptedOnly&&reviewer&&record.state==="submitted", canRetract:!acceptedOnly&&reviewer&&record.accepted_revision_id!==null, contentDigest: header.content_digest, revisionNumber: Number(header.revision_number), audience: header.audience,
    state: revisionId === record.accepted_revision_id ? "accepted" : record.state, reviewRequired: !eligible };
  if (!eligible) return { ...metadata, content: null };
  const payload = (await db.query<{ content: unknown }>("SELECT content FROM execution_record_payloads WHERE revision_id=$1",[revisionId])).rows[0];
  const active=(await db.query("SELECT active_baseline_id FROM engagements WHERE id=$1",[engagementId])).rows[0]?.active_baseline_id;
  const content=payload?.content as {kind?:string;state?:string;replacementBaselineId?:string}|undefined;
  const current=active===record.baseline_id||(content?.kind==="scope_change"&&content.state==="implemented"&&content.replacementBaselineId===active);
  return { ...metadata, reviewRequired:!current, content: payload?.content ?? null };
}
export function requireExecutionTimeVisibility(actor: ExecutionActor, entry: { author_membership_id: string; subject_membership_id: string | null }) {
  if (!isExecutionReviewer(actor) && entry.author_membership_id !== actor.membershipId && entry.subject_membership_id !== actor.membershipId) throw hiddenRecord();
}
