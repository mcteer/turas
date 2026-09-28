import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { canonicalRecordKey, type ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { evidenceIds, validateEvidence, validateMaturityEvidenceScope,
  persistEvidenceLinks } from "./eligibility";
import { validateMaturityAssessment } from "./maturity";
import { validateProfileRelationships } from "./profile-records";
import { validateOwnedClaimSource } from "./chat-claims";

type Proposal = Extract<ProfileCommand, { action: "propose_record" | "propose_revision" }>;

export async function addProposal(client: PoolClient, actor: ProfileActor, customerId: string,
  command: Proposal, submissionChannel: "profile_form" | "agent_proposal" | "artifact_share" = "profile_form",
  artifactSelectionId?: string):
  Promise<{ recordId: string; revisionId: string; reviewState: "pending" }> {
  const payload = command.payload;
  if ((submissionChannel === "artifact_share") !== Boolean(artifactSelectionId && command.artifactSelectionDigest)) {
    throw new HttpFailure(422, "artifact_support_required", "Exact artifact support is required");
  }
  if (submissionChannel !== "artifact_share" && command.artifactSelectionDigest) {
    throw new HttpFailure(422, "artifact_support_required", "Use the artifact proposal route");
  }
  if (artifactSelectionId) {
    const exact = await client.query<{ version_id: string; run_id: string;
      lifecycle_generation: string; ranges: unknown; excerpt_digest: string;
      audience: string; data_category: string }>(`
      SELECT version_id,run_id,lifecycle_generation,ranges,excerpt_digest,audience,data_category
      FROM artifact_evidence_selections
      WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 AND owner_principal_id=$4`,
    [artifactSelectionId,actor.workspaceId,customerId,actor.principalId]);
    const selection = exact.rows[0];
    const digest = selection && createHash("sha256").update(JSON.stringify({
      versionId: selection.version_id,runId: selection.run_id,
      lifecycleGeneration: Number(selection.lifecycle_generation),
      ranges: (selection.ranges as Array<{ unitId: string; start: number; end: number }>).map(
        (range) => ({ unitId: range.unitId,start: range.start,end: range.end })),
      excerptDigest: selection.excerpt_digest,audience: selection.audience,
      dataCategory: selection.data_category })).digest("hex");
    if (digest !== command.artifactSelectionDigest) {
      throw hiddenRecord();
    }
  }
  validateMaturityAssessment(payload);
  if (actor.kind === "partner" && (command.requestedAudience !== "delivery" || command.dataCategory !== "delivery_context")) {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
  if (command.requestedAudience === "delivery" && command.dataCategory !== "delivery_context") {
    throw new HttpFailure(422, "invalid_audience", "This content is internal only");
  }
  const workloadId = command.action === "propose_revision" ? command.workloadId ?? null : command.workloadId ?? null;
  if (payload.kind === "stakeholder" && payload.classification === "internal" && command.requestedAudience === "delivery") {
    throw new HttpFailure(422, "invalid_audience", "Internal stakeholder details cannot be shared for delivery");
  }
  if (workloadId) {
    const workload = await client.query("SELECT 1 FROM customer_workloads WHERE id=$1 AND customer_id=$2 AND workspace_id=$3",
      [workloadId, customerId, actor.workspaceId]);
    if (!workload.rowCount) throw hiddenRecord();
  }
  await validateProfileRelationships(client, actor, customerId, workloadId, payload);
  const claimLineage = await validateOwnedClaimSource(client, actor, customerId, payload);
  let recordId: string;
  if (command.action === "propose_revision") {
    const record = await client.query<{ id: string; kind: string; workload_id: string | null; canonical_key: string | null; version: string; current_accepted_revision_id: string | null }>(
      "SELECT id,kind,workload_id,canonical_key,version,current_accepted_revision_id FROM profile_records WHERE id=$1 AND customer_id=$2 AND workspace_id=$3 FOR UPDATE",
      [command.recordId, customerId, actor.workspaceId]);
    const row = record.rows[0];
    if (!row || row.kind !== payload.kind || row.workload_id !== workloadId) throw hiddenRecord();
    if (Number(row.version) !== command.expectedRecordVersion || row.current_accepted_revision_id !== command.expectedAcceptedRevisionId) {
      throw new HttpFailure(409, "stale_revision", "Profile changed; reload and retry");
    }
    if (actor.kind === "partner" && row.current_accepted_revision_id) {
      const visible = await client.query(`SELECT 1 FROM profile_revisions
        WHERE id=$1 AND audience='delivery' AND data_category='delivery_context'`,
      [row.current_accepted_revision_id]);
      if (!visible.rowCount) throw hiddenRecord();
    }
    if (row.canonical_key !== canonicalRecordKey(payload.kind, workloadId, payload)) {
      throw new HttpFailure(422, "immutable_key", "Create a new record for a different key");
    }
    recordId = row.id;
  } else {
    const canonicalKey = canonicalRecordKey(payload.kind, workloadId, payload);
    if (payload.kind === "workload_details" && !workloadId) throw new HttpFailure(422, "invalid_scope", "Workload required");
    if (payload.kind === "customer_details" && workloadId) throw new HttpFailure(422, "invalid_scope", "Customer details cannot be scoped to a workload");
    const newId = randomUUID();
    const inserted = await client.query<{ id: string }>(`INSERT INTO profile_records
      (id,workspace_id,customer_id,workload_id,kind,canonical_key,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING RETURNING id`,
    [newId, actor.workspaceId, customerId, workloadId, payload.kind, canonicalKey, actor.membershipId]);
    if (inserted.rows[0]) recordId = newId;
    else if (canonicalKey) {
      const prior = await client.query<{ id: string }>(`SELECT id FROM profile_records
        WHERE workspace_id=$1 AND customer_id=$2 AND kind=$3
          AND workload_id IS NOT DISTINCT FROM $4::uuid AND canonical_key=$5 FOR UPDATE`,
      [actor.workspaceId, customerId, payload.kind, workloadId, canonicalKey]);
      if (!prior.rows[0]) throw new HttpFailure(503, "unavailable", "Service unavailable");
      recordId = prior.rows[0].id;
    } else throw new HttpFailure(503, "unavailable", "Service unavailable");
  }
  const supportIds = evidenceIds(payload, command.evidenceRevisionIds);
  if (supportIds.length > 20) throw new HttpFailure(422, "too_many_evidence", "At most 20 evidence references are allowed");
  const links = await validateEvidence(client, actor, customerId, supportIds);
  if (payload.kind === "maturity_assessment") {
    await validateMaturityEvidenceScope(client, workloadId, links);
  }
  const sequence = await client.query<{ candidate_sequence: string; current_accepted_revision_id: string | null }>(
    "UPDATE profile_records SET candidate_sequence=candidate_sequence+1 WHERE id=$1 RETURNING candidate_sequence,current_accepted_revision_id", [recordId]);
  const revisionId = randomUUID();
  const payloadDigest = createHash("sha256").update(JSON.stringify({ payload, qualityInput: command.qualityInput,
    audience: command.requestedAudience, category: command.dataCategory, source: command.sourceUrl,
    excerpt: command.sourceExcerpt, evidence: command.evidenceRevisionIds,
    artifactSelectionDigest: command.artifactSelectionDigest })).digest("hex");
  await client.query(`INSERT INTO profile_revisions
    (id,record_id,workspace_id,customer_id,revision_number,base_accepted_revision_id,payload_schema_version,
     payload,quality_input,author_membership_id,origin,audience,data_category,source_references,
     content_digest,submission_channel)
    VALUES ($1,$2,$3,$4,$5,$6,'profile-v1',$7,$8,$9,'manual',$10,$11,$12,$13,$14)`,
  [revisionId, recordId, actor.workspaceId, customerId, sequence.rows[0].candidate_sequence,
    sequence.rows[0].current_accepted_revision_id, JSON.stringify(payload), JSON.stringify(command.qualityInput),
    actor.membershipId, command.requestedAudience, command.dataCategory,
    JSON.stringify(command.evidenceRevisionIds), payloadDigest,
    submissionChannel === "artifact_share" ? "artifact_share" :
      submissionChannel === "agent_proposal" ? "agent_proposal" :
      claimLineage ? "chat_share" : submissionChannel]);
  await persistEvidenceLinks(client, actor, customerId, revisionId, links);
  if (artifactSelectionId) {
    await client.query(`INSERT INTO profile_evidence_links
      (id,workspace_id,customer_id,profile_revision_id,artifact_selection_id,
       support_role,scope_explanation)
      VALUES($1,$2,$3,$4,$5,'support','Exact artifact excerpt')`,
    [randomUUID(), actor.workspaceId, customerId, revisionId, artifactSelectionId]);
  }
  if (claimLineage) await client.query(`INSERT INTO profile_private_lineage
    (profile_revision_id,conversation_id,message_id,span_digest) VALUES ($1,$2,$3,$4)`,
  [revisionId, claimLineage.conversationId, claimLineage.messageId, claimLineage.spanDigest]);
  return { recordId, revisionId, reviewState: "pending" };
}
