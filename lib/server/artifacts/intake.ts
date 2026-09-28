import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { artifactIntentBatchSchema, artifactUploadIntentReceiptSchema, type ArtifactIntentBatch, type ArtifactUploadIntentReceipt } from "../../contracts/artifacts";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { lockOwnedBinding } from "../conversations/binding";
import { requireArtifactDestructiveAuthority } from "./policy";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function artifactBatchDigest(input: ArtifactIntentBatch): string {
  const { idempotencyKey: _key, ...body } = input;
  return createHash("sha256").update(canonical(body)).digest("hex");
}

type BatchRow = { id: string; request_digest: string; expires_at: Date };
type IntentRow = {
  id: string;
  state: ArtifactUploadIntentReceipt["state"];
  version_id: string | null;
  expected_size_bytes: string;
  staged_actual_size_bytes: string | null;
  expires_at: Date;
  safe_error_code: ArtifactUploadIntentReceipt["safeErrorCode"];
};

function receipt(row: IntentRow): ArtifactUploadIntentReceipt {
  return artifactUploadIntentReceiptSchema.parse({
    id: row.id,
    state: row.state,
    versionId: row.version_id,
    expectedSizeBytes: Number(row.expected_size_bytes),
    receivedBytes: Number(row.staged_actual_size_bytes ?? 0),
    expiresAt: row.expires_at.toISOString(),
    safeErrorCode: row.safe_error_code,
  });
}

export type ArtifactBatchReceipt = {
  batchId: string;
  expiresAt: string;
  intents: ArtifactUploadIntentReceipt[];
};

/** Reserve the whole batch before receiving any bytes. The actor and customer locks serialize races. */
export async function createArtifactUploadBatch(
  actor: CurrentSession,
  rawInput: ArtifactIntentBatch,
  existingClient?: PoolClient,
  replacement?: { versionId: string; expectedGeneration: number },
): Promise<ArtifactBatchReceipt> {
  const input = artifactIntentBatchSchema.parse(rawInput);
  const digest = replacement ? createHash("sha256").update(canonical({
    batch: artifactBatchDigest(input),replacement,initiatingPrincipalId: actor.principalId,
  })).digest("hex") : artifactBatchDigest(input);
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const execute = async (client: PoolClient): Promise<ArtifactBatchReceipt> => {
    let ownerPrincipalId = actor.principalId;
    if (replacement) {
      const source = await client.query<{ environment_id: string; workspace_id: string;
        customer_id: string; owner_principal_id: string; submitted_at: Date | null;
        lifecycle_generation: string; state: string; origin_conversation_id: string;
        workload_id: string | null }>(`
        SELECT v.environment_id,v.workspace_id,v.customer_id,v.owner_principal_id,
          v.submitted_at,v.lifecycle_generation,v.state,a.origin_conversation_id,a.workload_id
        FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
        WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3`,
      [replacement.versionId,environmentId,actor.workspaceId]);
      const row = source.rows[0];
      if (!row || row.customer_id !== input.customerId ||
          row.origin_conversation_id !== input.conversationId ||
          row.workload_id !== (input.workloadId ?? null)) throw hiddenRecord();
      await requireArtifactDestructiveAuthority(client,actor,{ environmentId,
        workspaceId: actor.workspaceId,customerId: row.customer_id,
        ownerPrincipalId: row.owner_principal_id,submittedAt: row.submitted_at });
      const locked = await client.query<{ state: string; lifecycle_generation: string }>(
        "SELECT state,lifecycle_generation FROM artifact_versions WHERE id=$1 FOR UPDATE",
        [replacement.versionId]);
      if (!["ready","partial","failed","withdrawn"].includes(locked.rows[0]?.state ?? "") ||
          Number(locked.rows[0]?.lifecycle_generation) !== replacement.expectedGeneration) {
        throw new HttpFailure(409,"source_changed","Source changed; reload replacement");
      }
      ownerPrincipalId = row.owner_principal_id;
    } else {
      const binding = await lockOwnedBinding(client, actor, input.conversationId);
      if (binding.customer_id !== input.customerId) throw hiddenRecord();
    }
    const replay = await client.query<BatchRow>(`
      SELECT id,request_digest,expires_at FROM artifact_upload_batches
      WHERE environment_id=$1 AND workspace_id=$2 AND owner_principal_id=$3
        AND origin_conversation_id=$4 AND idempotency_key=$5 FOR UPDATE
    `, [environmentId, actor.workspaceId, ownerPrincipalId, input.conversationId, input.idempotencyKey]);
    if (replay.rows[0]) {
      if (replay.rows[0].request_digest !== digest) throw new HttpFailure(409, "idempotency_conflict", "Request key already used");
      const previous = await client.query<IntentRow>(`
        SELECT id,state,version_id,expected_size_bytes,staged_actual_size_bytes,expires_at,safe_error_code
        FROM artifact_upload_intents WHERE batch_id=$1 ORDER BY ordinal
      `, [replay.rows[0].id]);
      return { batchId: replay.rows[0].id, expiresAt: replay.rows[0].expires_at.toISOString(), intents: previous.rows.map(receipt) };
    }
    const recent = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM artifact_upload_batches
      WHERE environment_id=$1 AND workspace_id=$2 AND owner_principal_id=$3
        AND created_at > now() - interval '1 minute'
    `, [environmentId, actor.workspaceId, ownerPrincipalId]);
    if (Number(recent.rows[0]?.count ?? 0) >= 5) throw new HttpFailure(429, "upload_rate_limited", "Try again shortly", 60);
    const open = await client.query<{ count: string }>(`
      SELECT count(DISTINCT b.id)::text AS count FROM artifact_upload_batches b
      JOIN artifact_upload_intents i ON i.batch_id=b.id
      WHERE b.environment_id=$1 AND b.workspace_id=$2 AND b.owner_principal_id=$3
        AND i.state IN ('uploading','staged') AND i.expires_at > now()
    `, [environmentId, actor.workspaceId, ownerPrincipalId]);
    if (Number(open.rows[0]?.count ?? 0) >= 2) throw new HttpFailure(429, "too_many_open_batches", "Finish or cancel an upload first", 30);
    await client.query(`
      INSERT INTO artifact_workspace_quotas (environment_id,workspace_id)
      VALUES ($1,$2) ON CONFLICT (environment_id,workspace_id) DO NOTHING
    `, [environmentId, actor.workspaceId]);
    const quota = await client.query<{ reserved_bytes: string; committed_bytes: string }>(`
      SELECT reserved_bytes,committed_bytes FROM artifact_workspace_quotas
      WHERE environment_id=$1 AND workspace_id=$2 FOR UPDATE
    `, [environmentId, actor.workspaceId]);
    const requestedBytes = input.files.reduce((sum, file) => sum + file.expectedSizeBytes, 0);
    if (Number(quota.rows[0].reserved_bytes) + Number(quota.rows[0].committed_bytes) + requestedBytes > 2_147_483_648) {
      throw new HttpFailure(429, "artifact_quota_exceeded", "Artifact storage limit reached", 60);
    }
    const customerQueue = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM artifact_versions
      WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
        AND state IN ('quarantined','processing')
    `, [environmentId, actor.workspaceId, input.customerId]);
    const workspaceQueue = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM artifact_versions
      WHERE environment_id=$1 AND workspace_id=$2 AND state IN ('quarantined','processing')
    `, [environmentId, actor.workspaceId]);
    if (Number(customerQueue.rows[0]?.count ?? 0) + input.files.length > 10 ||
        Number(workspaceQueue.rows[0]?.count ?? 0) + input.files.length > 50) {
      throw new HttpFailure(429, "artifact_queue_full", "Artifact processing queue is full", 30);
    }
    const batchId = randomUUID();
    const batch = await client.query<{ expires_at: Date }>(`
      INSERT INTO artifact_upload_batches
        (id,environment_id,workspace_id,customer_id,workload_id,owner_principal_id,
         origin_conversation_id,idempotency_key,request_digest,file_count,expected_total_bytes,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+interval '30 minutes')
      RETURNING expires_at
    `, [batchId, environmentId, actor.workspaceId, input.customerId, input.workloadId ?? null,
      ownerPrincipalId, input.conversationId, input.idempotencyKey, digest, input.files.length, requestedBytes]);
    const intents: ArtifactUploadIntentReceipt[] = [];
    for (const [index, file] of input.files.entries()) {
      const id = randomUUID();
      const inserted = await client.query<IntentRow>(`
        INSERT INTO artifact_upload_intents
          (id,batch_id,ordinal,environment_id,workspace_id,customer_id,owner_principal_id,
           expected_name,expected_size_bytes,declared_type,source_published_on,source_observed_on,
           rights_note,audience,data_category,expires_at,replacement_of_version_id,
           replacement_expected_generation,initiating_principal_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          now()+interval '30 minutes',$16,$17,$18)
        RETURNING id,state,version_id,expected_size_bytes,staged_actual_size_bytes,expires_at,safe_error_code
      `, [id, batchId, index + 1, environmentId, actor.workspaceId, input.customerId,
        ownerPrincipalId, file.name, file.expectedSizeBytes, file.declaredType,
        file.sourcePublishedOn, file.sourceObservedOn, file.rightsNote, file.audience,
        file.dataCategory,replacement?.versionId ?? null,
        replacement?.expectedGeneration ?? null,replacement ? actor.principalId : null]);
      intents.push(receipt(inserted.rows[0]));
    }
    await client.query(`
      UPDATE artifact_workspace_quotas SET reserved_bytes=reserved_bytes+$3,updated_at=now()
      WHERE environment_id=$1 AND workspace_id=$2
    `, [environmentId, actor.workspaceId, requestedBytes]);
    return { batchId, expiresAt: batch.rows[0].expires_at.toISOString(), intents };
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

/** Caller must have already locked the actor/customer and intent in that order. */
export async function releaseArtifactIntentReservation(
  client: PoolClient,
  input: { intentId: string; environmentId: string; workspaceId: string; terminalState: "cancelled" | "expired" | "failed" },
): Promise<boolean> {
  const found = await client.query<{ state: string; expected_size_bytes: string; reservation_state: string }>(`
    SELECT state,expected_size_bytes,reservation_state FROM artifact_upload_intents
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE
  `, [input.intentId, input.environmentId, input.workspaceId]);
  const row = found.rows[0];
  if (!row) throw hiddenRecord();
  if (row.state === input.terminalState && row.reservation_state === "released") return false;
  if (row.state === "completed" || row.reservation_state !== "reserved") {
    throw new HttpFailure(409, "intent_state_conflict", "Upload state changed");
  }
  await client.query(`
    UPDATE artifact_upload_intents SET state=$2,reservation_state='released',updated_at=now()
    WHERE id=$1
  `, [input.intentId, input.terminalState]);
  const released = await client.query(`
    UPDATE artifact_workspace_quotas SET reserved_bytes=reserved_bytes-$3,updated_at=now()
    WHERE environment_id=$1 AND workspace_id=$2 AND reserved_bytes >= $3
  `, [input.environmentId, input.workspaceId, Number(row.expected_size_bytes)]);
  if (released.rowCount !== 1) throw new Error("Artifact quota reservation missing");
  return true;
}
