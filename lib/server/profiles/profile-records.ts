import type { PoolClient } from "pg";
import type { ProfilePayload } from "../../contracts/profile-payloads";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileActor } from "./policy";

export async function validateProfileRelationships(client: PoolClient, actor: ProfileActor,
  customerId: string, workloadId: string | null, payload: ProfilePayload): Promise<void> {
  if (payload.kind === "stakeholder" && payload.classification === "internal" && actor.kind === "partner") {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
  const ownerId = payload.kind === "workload_details" || payload.kind === "product_use"
    ? payload.ownerReferenceId : undefined;
  if (ownerId) {
    const owner = await client.query(`SELECT 1 FROM profile_records r
      JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
      WHERE r.id=$1 AND r.workspace_id=$2 AND r.customer_id=$3 AND r.kind='stakeholder'
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'
          AND v.payload->>'classification'='delivery'))`,
    [ownerId, actor.workspaceId, customerId, actor.kind === "internal"]);
    if (!owner.rowCount) throw hiddenRecord();
  }
  if (payload.kind === "next_review" && payload.recordReferenceId) {
    const target = await client.query(`SELECT 1 FROM profile_records r
      JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
      WHERE r.id=$1 AND r.workspace_id=$2 AND r.customer_id=$3
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))`,
    [payload.recordReferenceId, actor.workspaceId, customerId, actor.kind === "internal"]);
    if (!target.rowCount) throw hiddenRecord();
  }
  if (payload.kind === "workload_details" && payload.mergeTargetId) {
    if (!workloadId || workloadId === payload.mergeTargetId) {
      throw new HttpFailure(422, "invalid_merge", "Merge target must be another workload");
    }
    const target = await client.query(`SELECT 1 FROM customer_workloads
      WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 AND lifecycle='active'`,
    [payload.mergeTargetId, actor.workspaceId, customerId]);
    if (!target.rowCount) throw hiddenRecord();
  }
}
