import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { createArtifactUploadBatch } from "../../lib/server/artifacts/intake";

export async function createArtifactDatabaseFixture(
  client: PoolClient,
  actor: CurrentSession,
  customerId: string,
  sourcePublishedOn: string | null = null,
): Promise<{ conversationId: string; versionId: string; runId: string; originalDigest: string; imageDigest: string }> {
  const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
  const conversationId = randomUUID();
  const audience = actor.kind === "internal" ? "internal" : "delivery";
  const generation = await client.query<{ value: string }>(`
    SELECT ${audience === "internal" ? "internal_generation" : "delivery_generation"} AS value
    FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2
  `, [customerId, actor.workspaceId]);
  await client.query(`INSERT INTO conversations
    (id,environment_id,workspace_id,customer_id,owner_principal_id,
     creation_operation_id,binding_state,title,context_audience,context_generation,
     context_snapshot_schema,context_login_session_id,context_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic artifact fixture',$7,$8,
      'customer-context-v1',$9,$10)`,
  [conversationId, environmentId, actor.workspaceId, customerId, actor.principalId,
    randomUUID(), audience, generation.rows[0].value, actor.sessionId, actor.membershipId]);
  const bytes = Buffer.from("Synthetic artifact", "utf8");
  const originalDigest = createHash("sha256").update(bytes).digest("hex");
  const imageDigest = randomBytes(32).toString("hex");
  const batch = await createArtifactUploadBatch(actor, {
    conversationId, customerId, idempotencyKey: `fixture-${randomUUID()}`,
    files: [{ name: "synthetic.txt", expectedSizeBytes: bytes.length, declaredType: "text/plain",
      sourcePublishedOn, sourceObservedOn: null, rightsNote: "Synthetic fixture rights",
      audience: "internal", dataCategory: "other_internal" }],
  }, client);
  const intentId = batch.intents[0].id;
  const artifactId = randomUUID();
  const versionId = randomUUID();
  const runId = randomUUID();
  const objectKey = randomBytes(32).toString("hex");
  await client.query(`UPDATE artifact_upload_intents SET state='staged',staged_key=$2,
    staged_sha256_digest=$3,staged_actual_size_bytes=$4,updated_at=now() WHERE id=$1`,
  [intentId, randomBytes(32).toString("hex"), originalDigest, bytes.length]);
  await client.query(`INSERT INTO artifacts
    (id,environment_id,workspace_id,customer_id,owner_principal_id,origin_conversation_id)
    VALUES($1,$2,$3,$4,$5,$6)`,
  [artifactId, environmentId, actor.workspaceId, customerId, actor.principalId, conversationId]);
  await client.query(`INSERT INTO artifact_versions
    (id,artifact_id,environment_id,workspace_id,customer_id,owner_principal_id,version_number,
     filename,declared_type,actual_size_bytes,sha256_digest,object_key,rights_note,audience,data_category,
     source_published_on)
    VALUES($1,$2,$3,$4,$5,$6,1,'synthetic.txt','text/plain',$7,$8,$9,'Synthetic fixture rights',
      'internal','other_internal',$10)`,
  [versionId, artifactId, environmentId, actor.workspaceId, customerId, actor.principalId,
    bytes.length, originalDigest, objectKey,sourcePublishedOn]);
  await client.query(`INSERT INTO artifact_extraction_runs
    (id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,
     initiating_principal_id,lifecycle_generation,original_digest,scan_policy_version,
     parser_policy_version,parser_image_digest)
    VALUES($1,$2,$3,$4,$5,$6,$6,1,$7,'004-v1','004-v1',$8)`,
  [runId, versionId, environmentId, actor.workspaceId, customerId, actor.principalId,
    originalDigest, imageDigest]);
  await client.query(`UPDATE artifact_upload_intents SET state='completed',reservation_state='converted',
    finalized_object_key=$2,version_id=$3,completion_receipt='{}',updated_at=now() WHERE id=$1`,
  [intentId, objectKey, versionId]);
  await client.query(`UPDATE artifact_workspace_quotas SET reserved_bytes=reserved_bytes-$3,
    committed_bytes=committed_bytes+$3,updated_at=now() WHERE environment_id=$1 AND workspace_id=$2`,
  [environmentId, actor.workspaceId, bytes.length]);
  return { conversationId, versionId, runId, originalDigest, imageDigest };
}
