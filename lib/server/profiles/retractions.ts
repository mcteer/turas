import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { requireSteward } from "./policy";
import { retireRetrievalProjection } from "../retrieval/projections";

type RetractionCommand = Extract<ProfileCommand, { action: "request_retraction" | "retract_revision" | "decline_retraction" | "withdraw_source" }>;

export async function handleRetraction(client: PoolClient, actor: ProfileActor, customerId: string,
  command: RetractionCommand, receiptId: string): Promise<unknown> {
  if (command.action === "withdraw_source") {
    await requireSteward(client, actor, customerId);
    const source = await client.query<{ id: string; audience: string }>(
      "SELECT id,audience FROM evidence_source_revisions WHERE id=$1 AND workspace_id=$2 AND customer_id=$3",
      [command.sourceRevisionId, actor.workspaceId, customerId]);
    if (!source.rows[0]) throw hiddenRecord();
    const lifecycle = await client.query<{ event_type: string }>(
      "SELECT event_type FROM evidence_source_events WHERE source_revision_id=$1 ORDER BY lifecycle_version DESC LIMIT 1",
      [command.sourceRevisionId]);
    if (lifecycle.rows[0]?.event_type === "withdraw" || lifecycle.rows[0]?.event_type === "supersede") {
      throw new HttpFailure(409, "source_inactive", "Source is no longer active");
    }
    const current = await client.query<{ version: string }>(
      "SELECT coalesce(max(lifecycle_version),0)::text AS version FROM evidence_source_events WHERE source_revision_id=$1",
      [command.sourceRevisionId]);
    const version = Number(current.rows[0]?.version ?? 0);
    if (version !== command.expectedLifecycleVersion) throw new HttpFailure(409, "stale_revision", "Source changed; reload and retry");
    const eventId = randomUUID();
    await client.query(`INSERT INTO evidence_source_events
      (id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale,command_receipt_id)
      VALUES ($1,$2,$3,'withdraw',$4,$5,$6)`,
    [eventId, command.sourceRevisionId, version + 1, actor.membershipId, command.rationale, receiptId]);
    await retireRetrievalProjection(client,"verified_research",command.sourceRevisionId);
    const dependents = await client.query(`SELECT 1 FROM profile_evidence_links l
      JOIN profile_revisions v ON v.id=l.profile_revision_id AND v.audience='delivery'
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      WHERE l.source_revision_id=$1 LIMIT 1`, [command.sourceRevisionId]);
    await bumpGenerations(client, customerId,
      source.rows[0].audience === "delivery" || Boolean(dependents.rowCount));
    return { sourceRevisionId: command.sourceRevisionId, lifecycleVersion: version + 1, state: "withdrawn" };
  }
  if (command.action === "decline_retraction") {
    await requireSteward(client, actor, customerId);
    const request = await client.query<{ state: string; version: string; accepted_revision_id: string;
      requesting_membership_id: string }>(`
      SELECT q.state,q.version,q.accepted_revision_id,q.requesting_membership_id
      FROM profile_retraction_requests q
      JOIN profile_revisions v ON v.id=q.accepted_revision_id
      WHERE q.id=$1 AND v.customer_id=$2 AND v.workspace_id=$3 FOR UPDATE OF q`,
    [command.requestId, customerId, actor.workspaceId]);
    if (request.rows[0]?.state !== "open" ||
        Number(request.rows[0].version) !== command.expectedVersion) {
      throw new HttpFailure(409, "stale_request", "Request changed; reload and retry");
    }
    const requester = await client.query<{ kind: string }>(
      "SELECT kind FROM memberships WHERE id=$1", [request.rows[0].requesting_membership_id]);
    if (requester.rows[0]?.kind === "partner" && !command.partnerSafeReason) {
      throw new HttpFailure(422, "safe_reason_required", "Provide a partner-safe decision reason");
    }
    await client.query(`UPDATE profile_retraction_requests SET state='declined',version=version+1,
      resolution_rationale=$2,partner_safe_reason=$3,resolved_at=now() WHERE id=$1`,
    [command.requestId, command.rationale, command.partnerSafeReason ?? null]);
    return { requestId: command.requestId, state: "declined", version: command.expectedVersion + 1 };
  }
  if (command.action === "retract_revision") await requireSteward(client, actor, customerId);
  const target = await client.query<{ record_id: string; version: string; head: string | null; audience: string; kind: string; workload_id: string | null }>(`
    SELECT r.id AS record_id,r.version,r.current_accepted_revision_id AS head,
      v.audience,r.kind,r.workload_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
    WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3 FOR UPDATE OF r`,
  [command.revisionId, actor.workspaceId, customerId]);
  const row = target.rows[0];
  if (!row || (actor.kind === "partner" && row.audience !== "delivery")) throw hiddenRecord();
  if (row.head !== command.revisionId || Number(row.version) !== command.expectedRecordVersion) {
    throw new HttpFailure(409, "stale_revision", "Profile changed; reload and retry");
  }
  if (command.action === "request_retraction") {
    const existing = await client.query(`SELECT 1 FROM profile_retraction_requests
      WHERE accepted_revision_id=$1 AND requesting_membership_id=$2 AND state='open'`,
    [command.revisionId, actor.membershipId]);
    if (existing.rowCount) throw new HttpFailure(409, "request_open", "A retraction request is already open");
    const requestId = randomUUID();
    await client.query(`INSERT INTO profile_retraction_requests
      (id,accepted_revision_id,requesting_membership_id,reason) VALUES ($1,$2,$3,$4)`,
    [requestId, command.revisionId, actor.membershipId, command.reason]);
    return { requestId, state: "open", version: 1 };
  }
  if (command.requestId) {
    const request = await client.query<{ state: string; accepted_revision_id: string }>(`
      SELECT q.state,q.accepted_revision_id FROM profile_retraction_requests q
      JOIN profile_revisions v ON v.id=q.accepted_revision_id
      WHERE q.id=$1 AND v.customer_id=$2 AND v.workspace_id=$3 FOR UPDATE OF q`,
    [command.requestId, customerId, actor.workspaceId]);
    if (request.rows[0]?.state !== "open" || request.rows[0].accepted_revision_id !== command.revisionId) {
      throw new HttpFailure(409, "stale_request", "Request changed; reload and retry");
    }
  }
  const eventId = randomUUID();
  await client.query(`INSERT INTO profile_lifecycle_events
    (id,record_id,revision_id,event_type,previous_head_id,new_head_id,actor_membership_id,rationale,command_receipt_id)
    VALUES ($1,$2,$3,'retract',$3,NULL,$4,$5,$6)`,
  [eventId, row.record_id, command.revisionId, actor.membershipId, command.rationale, receiptId]);
  await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL,version=version+1 WHERE id=$1", [row.record_id]);
  await retireRetrievalProjection(client,"accepted_profile",command.revisionId);
  if (row.kind === "customer_details") await client.query(
    "UPDATE customer_references SET display_name='Unknown customer' WHERE id=$1 AND workspace_id=$2",
    [customerId, actor.workspaceId]);
  if (row.kind === "workload_details" && row.workload_id) await client.query(
    "UPDATE customer_workloads SET display_name='Unknown workload' WHERE id=$1 AND customer_id=$2",
    [row.workload_id, customerId]);
  if (command.requestId) await client.query(
    `UPDATE profile_retraction_requests SET state='resolved',version=version+1,
      resolving_event_id=$1,resolution_rationale=$3,resolved_at=now()
      WHERE id=$2 AND state='open'`,
    [eventId, command.requestId, command.rationale]);
  await bumpGenerations(client, customerId, row.audience === "delivery");
  return { recordId: row.record_id, revisionId: command.revisionId, state: "retracted", recordVersion: Number(row.version) + 1 };
}

async function bumpGenerations(client: PoolClient, customerId: string, delivery: boolean): Promise<void> {
  await client.query(`UPDATE customer_profile_state SET version=version+1,
    internal_generation=internal_generation+1,
    delivery_generation=delivery_generation+$1,updated_at=now() WHERE customer_id=$2`,
  [delivery ? 1 : 0, customerId]);
}
