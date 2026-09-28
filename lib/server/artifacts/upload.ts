import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { artifactUploadIntentReceiptSchema, type ArtifactUploadIntentReceipt } from "../../contracts/artifacts";
import { lockOwnedBinding } from "../conversations/binding";
import { LocalArtifactStore } from "./local-store";
import { releaseArtifactIntentReservation } from "./intake";
import { preparedArtifactImages } from "./prepared";
import { requireArtifactDestructiveAuthority } from "./policy";

type Intent = {
  id: string; batch_id: string; environment_id: string; workspace_id: string; customer_id: string;
  owner_principal_id: string; origin_conversation_id: string; workload_id: string | null;
  state: ArtifactUploadIntentReceipt["state"]; version_id: string | null;
  expected_name: string; expected_size_bytes: string; declared_type: string;
  source_published_on: Date | null; source_observed_on: Date | null;
  rights_note: string; audience: string; data_category: string;
  staged_key: string | null; staged_sha256_digest: string | null; staged_actual_size_bytes: string | null;
  finalized_object_key: string | null; expires_at: Date; safe_error_code: ArtifactUploadIntentReceipt["safeErrorCode"];
  replacement_of_version_id: string | null; replacement_expected_generation: string | null;
  initiating_principal_id: string | null;
};

function store(): LocalArtifactStore {
  return new LocalArtifactStore(parseArtifactStoreConfig(process.env));
}

function receipt(row: Intent): ArtifactUploadIntentReceipt {
  return artifactUploadIntentReceiptSchema.parse({ id: row.id, state: row.state,
    versionId: row.version_id, expectedSizeBytes: Number(row.expected_size_bytes),
    receivedBytes: Number(row.staged_actual_size_bytes ?? 0),
    expiresAt: row.expires_at.toISOString(), safeErrorCode: row.safe_error_code });
}

async function ownedIntent(client: PoolClient, actor: CurrentSession, intentId: string, lock = false): Promise<Intent> {
  const result = await client.query<Intent>(`
    SELECT i.*,b.origin_conversation_id,b.workload_id FROM artifact_upload_intents i
    JOIN artifact_upload_batches b ON b.id=i.batch_id
    WHERE i.id=$1 AND i.environment_id=$2 AND i.workspace_id=$3
      AND (i.owner_principal_id=$4 OR i.initiating_principal_id=$4)
  `, [intentId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.principalId]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  if (row.replacement_of_version_id) {
    if (row.initiating_principal_id !== actor.principalId) throw hiddenRecord();
    const source = await client.query<{ state: string; lifecycle_generation: string;
      submitted_at: Date | null }>(`
      SELECT state,lifecycle_generation,submitted_at FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4
        AND owner_principal_id=$5`,
    [row.replacement_of_version_id,row.environment_id,row.workspace_id,
      row.customer_id,row.owner_principal_id]);
    if (!source.rows[0]) throw hiddenRecord();
    await requireArtifactDestructiveAuthority(client,actor,{ environmentId: row.environment_id,
      workspaceId: row.workspace_id,customerId: row.customer_id,
      ownerPrincipalId: row.owner_principal_id,submittedAt: source.rows[0].submitted_at });
    const lockedSource = await client.query<{ state: string; lifecycle_generation: string }>(
      "SELECT state,lifecycle_generation FROM artifact_versions WHERE id=$1 FOR UPDATE",
      [row.replacement_of_version_id]);
    if (Number(lockedSource.rows[0]?.lifecycle_generation) !== Number(row.replacement_expected_generation) ||
        !["ready","partial","failed","withdrawn"].includes(lockedSource.rows[0]?.state ?? "")) {
      throw new HttpFailure(409,"source_changed","Source changed; reload replacement");
    }
  } else {
    if (row.owner_principal_id !== actor.principalId) throw hiddenRecord();
    const binding = await lockOwnedBinding(client, actor, row.origin_conversation_id);
    if (binding.customer_id !== row.customer_id) throw hiddenRecord();
  }
  if (!lock) return row;
  const locked = await client.query<Intent>(`
    SELECT i.*,b.origin_conversation_id,b.workload_id FROM artifact_upload_intents i
    JOIN artifact_upload_batches b ON b.id=i.batch_id
    WHERE i.id=$1 AND i.environment_id=$2 AND i.workspace_id=$3
      AND (i.owner_principal_id=$4 OR i.initiating_principal_id=$4) FOR UPDATE OF i
  `, [intentId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.principalId]);
  if (!locked.rows[0]) throw hiddenRecord();
  return locked.rows[0];
}

export async function readArtifactUploadIntent(actor: CurrentSession, intentId: string,
  existingClient?: PoolClient): Promise<ArtifactUploadIntentReceipt> {
  const execute = async (client: PoolClient) => {
    const row = await ownedIntent(client,actor,intentId,true);
    if (await expireIfNeeded(client,row)) return receipt({ ...row,state: "expired" });
    return receipt(row);
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

async function expireIfNeeded(client: PoolClient, row: Intent): Promise<boolean> {
  if (row.state !== "uploading" && row.state !== "staged") return false;
  if (row.expires_at.getTime() > Date.now()) return false;
  await releaseArtifactIntentReservation(client, { intentId: row.id, environmentId: row.environment_id,
    workspaceId: row.workspace_id, terminalState: "expired" });
  return true;
}

function expiredIntent(): HttpFailure {
  return new HttpFailure(409, "intent_expired", "Upload intent expired");
}

export async function stageArtifactUpload(actor: CurrentSession, intentId: string,
  bytes: AsyncIterable<Uint8Array>, contentLength: number): Promise<void> {
  const row = await withTransaction(async (client) => {
    const intent = await ownedIntent(client, actor, intentId);
    if (await expireIfNeeded(client, intent)) return null;
    if (intent.state !== "uploading" && intent.state !== "staged") throw new HttpFailure(409, "intent_state_conflict", "Upload state changed");
    if (contentLength !== Number(intent.expected_size_bytes)) throw new HttpFailure(413, "size_mismatch", "Upload size differs from declared size");
    return intent;
  });
  if (!row) throw expiredIntent();
  let staged;
  try { staged = await store().stage(bytes, Number(row.expected_size_bytes)); }
  catch (error) {
    if (error instanceof Error && /size|bytes exceed/i.test(error.message)) {
      throw new HttpFailure(413, "size_mismatch", "Upload size differs from declared size");
    }
    throw error;
  }
  let used = false;
  let expired = false;
  try {
    expired = await withTransaction(async (client) => {
      const current = await ownedIntent(client, actor, intentId, true);
      if (await expireIfNeeded(client, current)) return true;
      if (current.state !== "uploading" && current.state !== "staged") throw new HttpFailure(409, "intent_state_conflict", "Upload state changed");
      if (current.staged_sha256_digest && current.staged_sha256_digest !== staged.digest) {
        throw new HttpFailure(409, "upload_conflict", "Upload bytes differ from previous attempt");
      }
      if (current.staged_key) return false;
      await client.query(`UPDATE artifact_upload_intents SET state='staged',staged_key=$2,
        staged_sha256_digest=$3,staged_actual_size_bytes=$4,updated_at=now() WHERE id=$1`,
      [intentId, staged.key, staged.digest, staged.sizeBytes]);
      used = true;
      return false;
    });
  } catch (error) {
    await store().deleteStaged(staged.key);
    throw error;
  }
  if (!used) await store().deleteStaged(staged.key);
  if (expired) throw expiredIntent();
}

export async function completeArtifactUpload(actor: CurrentSession, intentId: string,
  idempotencyKey: string): Promise<ArtifactUploadIntentReceipt> {
  const parserImageDigest = preparedArtifactImages().parserDigest;
  const initial = await withTransaction(async (client) => {
    const row = await ownedIntent(client, actor, intentId);
    if (row.state === "completed") {
      const prior = await client.query<{ completion_receipt: { idempotencyKey?: string } | null }>(
        "SELECT completion_receipt FROM artifact_upload_intents WHERE id=$1", [intentId]);
      if (prior.rows[0]?.completion_receipt?.idempotencyKey !== idempotencyKey) {
        throw new HttpFailure(409, "idempotency_conflict", "Request key already used");
      }
      return row;
    }
    if (await expireIfNeeded(client, row)) return null;
    if (row.state !== "staged" || !row.staged_key || !row.staged_sha256_digest ||
        Number(row.staged_actual_size_bytes) !== Number(row.expected_size_bytes)) {
      throw new HttpFailure(409, "intent_not_staged", "Upload bytes are incomplete");
    }
    return row;
  });
  if (!initial) throw expiredIntent();
  if (initial.state === "completed") return receipt(initial);
  const objectKey = await store().finalize(initial.staged_key!, initial.staged_sha256_digest!);
  const completed = await withTransaction(async (client) => {
    const row = await ownedIntent(client, actor, intentId, true);
    if (row.state === "completed") {
      const prior = await client.query<{ completion_receipt: { idempotencyKey?: string } | null }>(
        "SELECT completion_receipt FROM artifact_upload_intents WHERE id=$1", [intentId]);
      if (prior.rows[0]?.completion_receipt?.idempotencyKey !== idempotencyKey) {
        throw new HttpFailure(409, "idempotency_conflict", "Request key already used");
      }
      return receipt(row);
    }
    if (await expireIfNeeded(client, row)) return null;
    if (row.state !== "staged" || row.staged_key !== initial.staged_key ||
        row.staged_sha256_digest !== initial.staged_sha256_digest) {
      throw new HttpFailure(409, "intent_state_conflict", "Upload state changed");
    }
    let artifactId: string = randomUUID();
    let versionNumber = 1;
    const versionId = randomUUID();
    if (row.replacement_of_version_id) {
      const parent = await client.query<{ artifact_id: string }>(
        "SELECT artifact_id FROM artifact_versions WHERE id=$1",
        [row.replacement_of_version_id]);
      if (!parent.rows[0]) throw hiddenRecord();
      artifactId = parent.rows[0].artifact_id;
      await client.query("SELECT id FROM artifacts WHERE id=$1 FOR UPDATE", [artifactId]);
      const count = await client.query<{ next_number: string }>(`
        SELECT (coalesce(max(version_number),0)+1)::text AS next_number
        FROM artifact_versions WHERE artifact_id=$1`, [artifactId]);
      versionNumber = Number(count.rows[0].next_number);
    } else {
      await client.query(`INSERT INTO artifacts
        (id,environment_id,workspace_id,customer_id,workload_id,owner_principal_id,origin_conversation_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [artifactId,row.environment_id,row.workspace_id,row.customer_id,row.workload_id,
        row.owner_principal_id,row.origin_conversation_id]);
    }
    await client.query(`INSERT INTO artifact_versions
      (id,artifact_id,environment_id,workspace_id,customer_id,owner_principal_id,version_number,
       filename,declared_type,actual_size_bytes,sha256_digest,object_key,
       source_published_on,source_observed_on,rights_note,audience,data_category)
      VALUES($1,$2,$3,$4,$5,$6,$17,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [versionId,artifactId,row.environment_id,row.workspace_id,row.customer_id,row.owner_principal_id,
      row.expected_name,row.declared_type,Number(row.staged_actual_size_bytes),row.staged_sha256_digest,
      objectKey,row.source_published_on,row.source_observed_on,row.rights_note,row.audience,row.data_category,
      versionNumber]);
    await client.query(`INSERT INTO artifact_extraction_runs
      (id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,
       initiating_principal_id,lifecycle_generation,original_digest,scan_policy_version,
       parser_policy_version,parser_image_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,'004-scan-v1','004-parser-v1',$9)`,
    [randomUUID(),versionId,row.environment_id,row.workspace_id,row.customer_id,row.owner_principal_id,
      actor.principalId,row.staged_sha256_digest,
      parserImageDigest]);
    await client.query(`UPDATE artifact_upload_intents SET state='completed',version_id=$2,
      reservation_state='converted',finalized_object_key=$3,completion_receipt=$4,updated_at=now() WHERE id=$1`,
    [row.id,versionId,objectKey,JSON.stringify({ idempotencyKey, versionId })]);
    const converted = await client.query(`UPDATE artifact_workspace_quotas SET
      reserved_bytes=reserved_bytes-$3,committed_bytes=committed_bytes+$3,updated_at=now()
      WHERE environment_id=$1 AND workspace_id=$2 AND reserved_bytes >= $3`,
    [row.environment_id,row.workspace_id,Number(row.expected_size_bytes)]);
    if (converted.rowCount !== 1) throw new Error("Artifact reservation missing");
    return receipt({ ...row, state: "completed", version_id: versionId,
      finalized_object_key: objectKey });
  });
  if (!completed) throw expiredIntent();
  return completed;
}

export async function cancelArtifactUpload(actor: CurrentSession, intentId: string): Promise<ArtifactUploadIntentReceipt> {
  const row = await withTransaction(async (client) => {
    const intent = await ownedIntent(client, actor, intentId, true);
    if (intent.state === "cancelled") return { ...intent, state: "cancelled" as const };
    if (intent.state === "expired" || intent.state === "failed") return intent;
    if (intent.state === "completed") throw new HttpFailure(409, "intent_state_conflict", "Use the version lifecycle action");
    if (await expireIfNeeded(client,intent)) return { ...intent,state: "expired" as const };
    await releaseArtifactIntentReservation(client, { intentId, environmentId: intent.environment_id,
      workspaceId: intent.workspace_id, terminalState: "cancelled" });
    return { ...intent, state: "cancelled" as const };
  });
  if (row.staged_key) await store().deleteStaged(row.staged_key);
  return receipt(row);
}
