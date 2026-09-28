import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { validateArtifactExtraction } from "./extraction";
import { lockArtifactWorkerAuthority, type ArtifactScope } from "./policy";
import type { ArtifactExtractionManifest, ArtifactScanReceipt } from "../../contracts/artifacts";
import { recordArtifactMetric } from "./telemetry";

type Candidate = {
  id: string;
  version_id: string;
  environment_id: string;
  workspace_id: string;
  customer_id: string;
  owner_principal_id: string;
  initiating_principal_id: string;
  lifecycle_generation: string;
  original_digest: string;
  scan_policy_version: string;
  parser_policy_version: string;
  parser_image_digest: string;
  attempt_number: number;
  state: "queued" | "leased" | "published" | "failed" | "cancelled";
  lease_expires_at: Date | null;
  attempt_token: string | null;
  submitted_at: Date | null;
  created_at: Date;
};

export type ArtifactJobClaim = {
  runId: string;
  versionId: string;
  attemptToken: string;
  lifecycleGeneration: number;
  originalDigest: string;
  parserImageDigest: string;
  scanPolicyVersion: string;
  parserPolicyVersion: string;
  deadlineAt: string;
  queueAgeMs?: number;
};

function scope(row: Candidate): ArtifactScope & { submittedAt: Date | null } {
  return { environmentId: row.environment_id, workspaceId: row.workspace_id,
    customerId: row.customer_id, ownerPrincipalId: row.owner_principal_id,
    submittedAt: row.submitted_at };
}

/** Claim one oldest eligible run. The DB unique index enforces one active local job. */
export async function claimArtifactRun(existingClient?: PoolClient): Promise<ArtifactJobClaim | null> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const execute = async (client: PoolClient): Promise<ArtifactJobClaim | null> => {
    const candidates = await client.query<Candidate>(`
      SELECT r.id,r.version_id,r.environment_id,r.workspace_id,r.customer_id,r.owner_principal_id,
        r.initiating_principal_id,r.lifecycle_generation,r.original_digest,r.scan_policy_version,
        r.parser_policy_version,r.parser_image_digest,r.attempt_number,r.state,r.lease_expires_at,
        v.submitted_at,r.created_at
      FROM artifact_extraction_runs r JOIN artifact_versions v ON v.id=r.version_id
      WHERE r.environment_id=$1 AND (r.state='queued' AND r.next_attempt_at <= now()
        OR r.state='leased' AND r.lease_expires_at <= now())
      ORDER BY CASE WHEN r.state='leased' THEN 0 ELSE 1 END,r.created_at,r.id LIMIT 20
    `, [environmentId]);
    for (const candidate of candidates.rows) {
      const authorized = await lockArtifactWorkerAuthority(client, scope(candidate), candidate.initiating_principal_id);
      const version = await client.query<{ lifecycle_generation: string; sha256_digest: string; state: string }>(`
        SELECT lifecycle_generation,sha256_digest,state FROM artifact_versions
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR UPDATE
      `, [candidate.version_id, candidate.environment_id, candidate.workspace_id, candidate.customer_id]);
      const locked = await client.query<Candidate>(`
        SELECT * FROM artifact_extraction_runs WHERE id=$1 FOR UPDATE SKIP LOCKED
      `, [candidate.id]);
      const row = locked.rows[0];
      if (!row || !version.rows[0]) continue;
      const expiredLease = row.state === "leased" && !!row.lease_expires_at && row.lease_expires_at.getTime() <= Date.now();
      if (row.state !== "queued" && !expiredLease) continue;
      if (!authorized || !["quarantined", "processing", "failed"].includes(version.rows[0].state) ||
          version.rows[0].lifecycle_generation !== row.lifecycle_generation ||
          version.rows[0].sha256_digest !== row.original_digest ||
          (expiredLease && row.attempt_number >= 3)) {
        await client.query(`UPDATE artifact_extraction_runs SET state='cancelled',attempt_token=NULL,
          lease_expires_at=NULL,heartbeat_at=NULL,started_at=NULL,deadline_at=NULL,
          safe_error_code='cancelled',updated_at=now() WHERE id=$1`, [row.id]);
        continue;
      }
      const token = randomUUID();
      if (expiredLease) recordArtifactMetric("lease_reclaim_count",1);
      if (row.attempt_number > 1) recordArtifactMetric("retry_count",row.attempt_number-1);
      const claimed = await client.query<{ deadline_at: Date }>(`
        UPDATE artifact_extraction_runs SET state='leased',attempt_token=$2,
          attempt_number=attempt_number+$3,heartbeat_at=now(),started_at=now(),
          lease_expires_at=now()+interval '30 seconds',deadline_at=now()+interval '120 seconds',
          updated_at=now() WHERE id=$1 RETURNING deadline_at
      `, [row.id, token, expiredLease ? 1 : 0]);
      await client.query(`UPDATE artifact_versions SET state='processing',updated_at=now()
        WHERE id=$1 AND state IN ('quarantined','failed','processing')`, [row.version_id]);
      return {
        runId: row.id, versionId: row.version_id, attemptToken: token,
        lifecycleGeneration: Number(row.lifecycle_generation), originalDigest: row.original_digest,
        parserImageDigest: row.parser_image_digest, scanPolicyVersion: row.scan_policy_version,
        parserPolicyVersion: row.parser_policy_version, deadlineAt: claimed.rows[0].deadline_at.toISOString(),
        queueAgeMs: Math.max(0,Date.now()-row.created_at.getTime()),
      };
    }
    return null;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

export async function heartbeatArtifactRun(claim: ArtifactJobClaim, existingClient?: PoolClient): Promise<boolean> {
  const execute = async (client: PoolClient): Promise<boolean> => {
    const candidate = await client.query<Candidate>(`SELECT r.*,v.submitted_at FROM artifact_extraction_runs r
      JOIN artifact_versions v ON v.id=r.version_id WHERE r.id=$1`, [claim.runId]);
    if (!candidate.rows[0]) return false;
    const row = candidate.rows[0];
    const authorized = await lockArtifactWorkerAuthority(client, scope(row), row.initiating_principal_id);
    const version = await client.query<{ lifecycle_generation: string; state: string }>(
      "SELECT lifecycle_generation,state FROM artifact_versions WHERE id=$1 FOR UPDATE", [row.version_id]);
    if (!authorized || version.rows[0]?.state !== "processing" ||
        Number(version.rows[0]?.lifecycle_generation) !== claim.lifecycleGeneration) return false;
    const updated = await client.query(`
      UPDATE artifact_extraction_runs SET heartbeat_at=now(),lease_expires_at=now()+interval '30 seconds',updated_at=now()
      WHERE id=$1 AND state='leased' AND attempt_token=$2 AND lease_expires_at > now()
        AND deadline_at > now() AND heartbeat_at >= now()-interval '10 seconds'
    `, [claim.runId, claim.attemptToken]);
    return updated.rowCount === 1;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

export async function publishArtifactRun(
  claim: ArtifactJobClaim,
  rawManifest: unknown,
  scanReceipt: ArtifactScanReceipt,
  existingClient?: PoolClient,
): Promise<ArtifactExtractionManifest> {
  const manifest = validateArtifactExtraction(rawManifest, {
    originalDigest: claim.originalDigest, imageDigest: claim.parserImageDigest, scanReceipt,
  });
  if (manifest.parserVersion !== claim.parserPolicyVersion || scanReceipt.scanPolicyVersion !== claim.scanPolicyVersion) {
    throw new Error("artifact_policy_changed");
  }
  if (Date.now() - Date.parse(scanReceipt.scannedAt) > 7 * 86_400_000 || Date.parse(scanReceipt.scannedAt) > Date.now()) {
    throw new Error("scan_stale");
  }
  const execute = async (client: PoolClient): Promise<void> => {
    const candidate = await client.query<Candidate>(`SELECT r.*,v.submitted_at FROM artifact_extraction_runs r
      JOIN artifact_versions v ON v.id=r.version_id WHERE r.id=$1`, [claim.runId]);
    const row = candidate.rows[0];
    if (!row) throw new Error("run_missing");
    const authorized = await lockArtifactWorkerAuthority(client, scope(row), row.initiating_principal_id);
    const version = await client.query<{ lifecycle_generation: string; sha256_digest: string; state: string }>(`
      SELECT lifecycle_generation,sha256_digest,state FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR UPDATE
    `, [row.version_id, row.environment_id, row.workspace_id, row.customer_id]);
    const current = await client.query<Candidate>("SELECT * FROM artifact_extraction_runs WHERE id=$1 FOR UPDATE", [claim.runId]);
    const live = current.rows[0];
    if (!authorized || !version.rows[0] || !live || live.state !== "leased" ||
        live.attempt_token !== claim.attemptToken || !live.lease_expires_at ||
        live.lease_expires_at.getTime() <= Date.now() ||
        version.rows[0].state !== "processing" ||
        Number(version.rows[0].lifecycle_generation) !== claim.lifecycleGeneration ||
        version.rows[0].sha256_digest !== claim.originalDigest ||
        live.original_digest !== claim.originalDigest ||
        live.parser_image_digest !== claim.parserImageDigest ||
        live.scan_policy_version !== claim.scanPolicyVersion ||
        live.parser_policy_version !== claim.parserPolicyVersion ||
        Date.parse(claim.deadlineAt) <= Date.now()) {
      throw new Error("artifact_publication_fenced");
    }
    for (const unit of manifest.units) {
      await client.query(`
        INSERT INTO artifact_extraction_units
          (id,run_id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,
           ordinal,locator,text,origin,ocr_confidence,formula,cached_value,hidden,source_start,source_end)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [randomUUID(), row.id, row.version_id, row.environment_id, row.workspace_id,
        row.customer_id, row.owner_principal_id, unit.ordinal, JSON.stringify(unit.locator),
        unit.text, unit.origin, unit.ocrConfidence, unit.formula ?? null,
        unit.cachedValue === undefined ? null : JSON.stringify(unit.cachedValue),
        unit.hidden ?? false, unit.sourceStart ?? null, unit.sourceEnd ?? null]);
    }
    const manifestDigest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    await client.query(`
      UPDATE artifact_extraction_runs SET state='published',scan_receipt=$2,coverage=$3,
        manifest_digest=$4,published_at=now(),signature_version=$5,updated_at=now()
      WHERE id=$1
    `, [row.id, JSON.stringify(scanReceipt), JSON.stringify(manifest.coverage), manifestDigest,
      scanReceipt.signatureVersion]);
    await client.query(`
      UPDATE artifact_versions SET state=$2,detected_format=$3,safe_error_code=NULL,updated_at=now()
      WHERE id=$1
    `, [row.version_id, manifest.status, manifest.format]);
  };
  if (existingClient) await execute(existingClient);
  else await withTransaction(execute);
  return manifest;
}

/** A failed worker can only alter its still-current leased attempt. */
export async function failArtifactRun(claim: ArtifactJobClaim, safeErrorCode: string,
  transient: boolean, existingClient?: PoolClient): Promise<boolean> {
  const execute = async (client: PoolClient): Promise<boolean> => {
    const version = await client.query<{ lifecycle_generation: string; state: string }>(
      "SELECT lifecycle_generation,state FROM artifact_versions WHERE id=$1 FOR UPDATE", [claim.versionId]);
    const run = await client.query<{ attempt_token: string | null; state: string; attempt_number: number }>(
      "SELECT attempt_token,state,attempt_number FROM artifact_extraction_runs WHERE id=$1 FOR UPDATE", [claim.runId]);
    if (!version.rows[0] || !run.rows[0] || version.rows[0].state !== "processing" ||
        Number(version.rows[0].lifecycle_generation) !== claim.lifecycleGeneration ||
        run.rows[0].state !== "leased" || run.rows[0].attempt_token !== claim.attemptToken) return false;
    const retry = transient && run.rows[0].attempt_number < 3 && Date.parse(claim.deadlineAt) > Date.now();
    await client.query(`UPDATE artifact_extraction_runs SET state=$2,attempt_token=NULL,
      lease_expires_at=NULL,heartbeat_at=NULL,started_at=NULL,deadline_at=NULL,
      safe_error_code=$3,next_attempt_at=now()+($4::integer * interval '1 second'),updated_at=now()
      WHERE id=$1`, [claim.runId, retry ? "queued" : "failed", safeErrorCode,
      [10,30,90][Math.min(2,run.rows[0].attempt_number - 1)]]);
    await client.query(`UPDATE artifact_versions SET state=$2,safe_error_code=$3,updated_at=now()
      WHERE id=$1`, [claim.versionId, retry ? "quarantined" : "failed", safeErrorCode]);
    return true;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
