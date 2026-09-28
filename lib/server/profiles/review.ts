import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { requireSteward } from "./policy";
import { validateEvidence, validateMaturityEvidenceScope, validateArtifactReviewSupport } from "./eligibility";
import { validateMaturityAssessment } from "./maturity";
import type { ProfilePayload } from "../../contracts/profile-payloads";
import { validateProfileRelationships } from "./profile-records";
import { persistApprovedQuality } from "./evidence";

type ReviewCommand = Extract<ProfileCommand, { action: "accept_revision" | "reject_revision" }>;
type ReviewRow = {
  record_id: string; record_version: string; current_accepted_revision_id: string | null;
  kind: string; workload_id: string | null; revision_id: string; payload: Record<string, unknown>;
  content_digest: string; author_membership_id: string; audience: string; data_category: string;
  quality_input: unknown;
  decision: string | null;
};

export async function reviewRevision(client: PoolClient, actor: ProfileActor, customerId: string,
  command: ReviewCommand, receiptId: string): Promise<{ recordId: string; revisionId: string; reviewState: "accepted" | "rejected"; recordVersion: number }> {
  await requireSteward(client, actor, customerId);
  if (command.action === "accept_revision") {
    await validateArtifactReviewSupport(client, command.revisionId, actor.workspaceId, customerId);
  }
  const result = await client.query<ReviewRow>(`SELECT r.id AS record_id,r.version AS record_version,
    r.current_accepted_revision_id,r.kind,r.workload_id,v.id AS revision_id,v.payload,
    v.content_digest,v.author_membership_id,v.audience,v.data_category,v.quality_input,d.decision
    FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
    LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
    WHERE v.id=$1 AND v.customer_id=$2 AND v.workspace_id=$3 FOR UPDATE OF r`,
  [command.revisionId, customerId, actor.workspaceId]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  if (row.decision) throw new HttpFailure(409, "already_decided", "This proposal was already reviewed");
  if (Number(row.record_version) !== command.expectedRecordVersion ||
      (command.action === "accept_revision" && row.current_accepted_revision_id !== command.expectedAcceptedRevisionId)) {
    throw new HttpFailure(409, "stale_revision", "Profile changed; reload and retry");
  }
  if (command.action === "accept_revision" && row.content_digest !== command.digest) {
    throw new HttpFailure(409, "digest_mismatch", "Proposal changed; reload and retry");
  }
  const author = await client.query<{ kind: string }>("SELECT kind FROM memberships WHERE id=$1", [row.author_membership_id]);
  if (author.rows[0]?.kind === "partner" && !command.partnerSafeReason) {
    throw new HttpFailure(422, "safe_reason_required", "Provide a partner-safe decision reason");
  }
  if (command.action === "accept_revision") {
    validateMaturityAssessment(row.payload as ProfilePayload);
    await validateProfileRelationships(client, actor, customerId, row.workload_id,
      row.payload as ProfilePayload);
    if (row.audience === "delivery" && row.data_category !== "delivery_context") {
      throw new HttpFailure(422, "invalid_audience", "This content is internal only");
    }
    if (row.current_accepted_revision_id) {
      const old = await client.query<{ audience: string; data_category: string; payload: Record<string, unknown> }>(
        "SELECT audience,data_category,payload FROM profile_revisions WHERE id=$1", [row.current_accepted_revision_id]);
      if (old.rows[0]?.audience === "internal" && row.audience === "delivery") {
        throw new HttpFailure(422, "audience_widening", "Internal accepted data cannot be declassified by a correction");
      }
      if (row.kind === "maturity_assessment") {
        const priorEnd = Date.parse(String(old.rows[0]?.payload.observationEnd));
        const proposedEnd = Date.parse(String(row.payload.observationEnd));
        if (Number.isFinite(priorEnd) && Number.isFinite(proposedEnd) && proposedEnd < priorEnd &&
            !command.acknowledgeOlderObservation) {
          throw new HttpFailure(409, "older_observation", "Confirm replacement with an older observation window");
        }
      }
    }
    const links = await client.query<{ source_revision_id: string | null; supporting_profile_revision_id: string | null }>(
      "SELECT source_revision_id,supporting_profile_revision_id FROM profile_evidence_links WHERE profile_revision_id=$1",
      [row.revision_id]);
    const eligibleLinks = await validateEvidence(client, actor, customerId, links.rows.map((link) =>
      link.source_revision_id ?? link.supporting_profile_revision_id).filter((id): id is string => Boolean(id)));
    if (row.kind === "maturity_assessment") {
      await validateMaturityEvidenceScope(client, row.workload_id, eligibleLinks);
    }
    if (row.audience === "delivery") {
      const restricted = await client.query(`SELECT 1 FROM profile_evidence_links l
        LEFT JOIN evidence_source_revisions s ON s.id=l.source_revision_id
        LEFT JOIN profile_revisions p ON p.id=l.supporting_profile_revision_id
        WHERE l.profile_revision_id=$1 AND
          ((s.id IS NOT NULL AND s.audience<>'delivery') OR
           (p.id IS NOT NULL AND (p.audience<>'delivery' OR p.data_category<>'delivery_context')))
        LIMIT 1`, [row.revision_id]);
      if (restricted.rowCount && !command.partnerSafeAttestation) {
        throw new HttpFailure(422, "attestation_required", "Provide a safe explanation for restricted support");
      }
    }
    await persistApprovedQuality(client, { revisionId: row.revision_id,
      customerId, proposerMembershipId: row.author_membership_id,
      reviewerMembershipId: actor.membershipId, payload: row.payload,
      qualityInput: row.quality_input });
  }
  const state = command.action === "accept_revision" ? "accepted" : "rejected";
  await client.query(`INSERT INTO profile_review_decisions
    (revision_id,decision,reviewer_membership_id,rationale,partner_safe_reason,partner_safe_attestation,command_receipt_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [row.revision_id, state === "accepted" ? "accept" : "reject", actor.membershipId,
    command.rationale, command.partnerSafeReason ?? null,
    command.action === "accept_revision" ? command.partnerSafeAttestation ?? null : null, receiptId]);
  let version = Number(row.record_version);
  if (state === "accepted") {
    version++;
    await client.query("UPDATE profile_records SET current_accepted_revision_id=$1,version=$2 WHERE id=$3",
      [row.revision_id, version, row.record_id]);
    if (row.current_accepted_revision_id) {
      await client.query(`INSERT INTO profile_lifecycle_events
        (id,record_id,revision_id,event_type,previous_head_id,new_head_id,actor_membership_id,rationale,command_receipt_id)
        VALUES ($1,$2,$3,'supersede',$4,$5,$6,$7,$8)`,
      [randomUUID(), row.record_id, row.revision_id, row.current_accepted_revision_id,
        row.revision_id, actor.membershipId, command.rationale, receiptId]);
    }
    if (row.kind === "customer_details") {
      const name = row.payload.displayName;
      if (typeof name !== "string") throw new HttpFailure(422, "invalid_payload", "Invalid customer name");
      await client.query("UPDATE customer_references SET display_name=$1 WHERE id=$2 AND workspace_id=$3",
        [name, customerId, actor.workspaceId]);
    }
    if (row.kind === "workload_details") {
      const name = row.payload.name;
      if (typeof name !== "string" || !row.workload_id) throw new HttpFailure(422, "invalid_payload", "Invalid workload name");
      await client.query("UPDATE customer_workloads SET display_name=$1 WHERE id=$2 AND customer_id=$3",
        [name, row.workload_id, customerId]);
      const mergeTargetId = row.payload.mergeTargetId;
      if (typeof mergeTargetId === "string") {
        await client.query(`UPDATE customer_workloads
          SET lifecycle='merged',merged_into_id=$1 WHERE id=$2 AND customer_id=$3`,
        [mergeTargetId, row.workload_id, customerId]);
      } else {
        await client.query(`UPDATE customer_workloads
          SET lifecycle='active',merged_into_id=NULL WHERE id=$1 AND customer_id=$2`,
        [row.workload_id, customerId]);
      }
    }
    const prior = row.current_accepted_revision_id ? await client.query<{ audience: string }>(
      "SELECT audience FROM profile_revisions WHERE id=$1", [row.current_accepted_revision_id]) : null;
    const deliveryAffected = row.audience === "delivery" || prior?.rows[0]?.audience === "delivery";
    await client.query(`UPDATE customer_profile_state SET version=version+1,
      internal_generation=internal_generation+1,
      delivery_generation=delivery_generation+$1,updated_at=now() WHERE customer_id=$2`,
    [deliveryAffected ? 1 : 0, customerId]);
  }
  return { recordId: row.record_id, revisionId: row.revision_id, reviewState: state, recordVersion: version };
}
