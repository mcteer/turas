import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { workforceExtractionSchema, artifactScanReceiptSchema, type ArtifactScanReceipt } from "../../contracts/artifacts";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction, query } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { requireStaffingEnvironment } from "./repository";
import { staffingSha256 } from "./commands";
import { preparedWorkforceImages } from "./prepared";

export type WorkforceClaim = { jobId: string; sourceId: string; sourceVersionId: string; workspaceId: string;
  generation: number; leaseToken: string; deadlineAt: string; originalDigest: string; byteSize: number;
  format: "csv" | "xlsx"; filename: string; objectKey: string; parserImageDigest: string; scannerImageDigest: string };
async function workerActor(db: PoolClient, sourceId: string): Promise<StaffingActor | null> {
  const row = (await db.query<{ principal_id: string; membership_id: string; workspace_id: string;
    kind: "internal" | "partner"; role: "admin" | "member"; session_id: string; expires_at: Date }>(`
    SELECT m.principal_id,m.id AS membership_id,m.workspace_id,m.kind,m.role,s.owner_session_id AS session_id,l.expires_at
    FROM workforce_sources s JOIN memberships m ON m.id=s.owner_membership_id AND m.workspace_id=s.workspace_id
    JOIN login_sessions l ON l.id=s.owner_session_id AND l.principal_id=m.principal_id
    WHERE s.id=$1 AND s.environment_id=$2`, [sourceId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  return row ? { principalId: row.principal_id, membershipId: row.membership_id, workspaceId: row.workspace_id,
    kind: row.kind, role: row.role, sessionId: row.session_id, expiresAt: row.expires_at,
    token: "worker", loginName: "mcteer", displayName: "Workforce worker" } : null;
}
async function cancelUnauthorized(jobId: string, sourceId: string) {
  await withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const source = (await db.query("SELECT generation FROM workforce_sources WHERE id=$1 AND environment_id=$2 FOR UPDATE",
      [sourceId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!source) return;
    await db.query(`UPDATE workforce_import_jobs SET state='cancelled',lease_token=NULL,lease_expires_at=NULL,
      error_code='authority_changed',updated_at=now() WHERE id=$1 AND environment_id=$2 AND state IN ('queued','running')`,
      [jobId, getServerConfig().TURAS_ENVIRONMENT_ID]);
    await db.query("UPDATE workforce_sources SET state='failed' WHERE id=$1 AND state IN ('quarantined','processing')", [sourceId]);
  });
}
export async function claimWorkforceImport(): Promise<WorkforceClaim | null> {
  if (process.env.TURAS_007_DISABLED === "1") return null;
  const images = preparedWorkforceImages(); // Local attestation IO precedes database locks.
  const candidates = await withTransaction(async db => {
    await requireStaffingEnvironment(db, true);
    return (await db.query(`SELECT j.id,v.source_id FROM workforce_import_jobs j
      JOIN workforce_source_versions v ON v.id=j.source_version_id
      WHERE j.environment_id=$1 AND (j.state='queued' OR j.state='running' AND j.lease_expires_at<=now())
      ORDER BY j.created_at,j.id LIMIT 20`, [getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
  });
  for (const candidate of candidates) {
    try {
      const claim = await withTransaction(async db => {
        const actor = await workerActor(db, candidate.source_id);
        if (!actor) throw new HttpFailure(401, "authentication_required", "Import authority changed");
        await lockStaffingActor(db, actor, "manager", { write: true });
        const source = (await db.query(`SELECT generation,current_version_id,state FROM workforce_sources
          WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
          [candidate.source_id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId])).rows[0];
        const job = (await db.query(`SELECT id,source_version_id,source_generation,state,lease_expires_at,
          attempt_number,parser_image_digest,scanner_image_digest FROM workforce_import_jobs WHERE id=$1 FOR UPDATE SKIP LOCKED`, [candidate.id])).rows[0];
        if (!source || !job || (job.state !== "queued" && !(job.state === "running" && job.lease_expires_at?.getTime() <= Date.now()))) return null;
        if (job.attempt_number >= 4 || !["quarantined", "processing", "failed"].includes(source.state) ||
          source.generation !== job.source_generation || source.current_version_id !== job.source_version_id ||
          job.parser_image_digest && job.parser_image_digest !== images.parserDigest ||
          job.scanner_image_digest && job.scanner_image_digest !== images.scannerDigest) {
          await db.query("UPDATE workforce_import_jobs SET state='cancelled',lease_token=NULL,error_code='source_changed',updated_at=now() WHERE id=$1", [job.id]);
          return null;
        }
        const original = (await db.query(`SELECT v.content_digest,v.byte_size,v.format,p.filename,p.object_key
          FROM workforce_source_versions v JOIN workforce_source_payloads p ON p.revision_id=v.id WHERE v.id=$1`, [job.source_version_id])).rows[0];
        if (!original) return null;
        const leaseToken = randomUUID();
        const claimed = (await db.query(`UPDATE workforce_import_jobs SET state='running',attempt_number=attempt_number+1,
          lease_token=$2,lease_expires_at=now()+interval '30 seconds',heartbeat_at=now(),deadline_at=now()+interval '120 seconds',
          parser_image_digest=$3,scanner_image_digest=$4,updated_at=now() WHERE id=$1 RETURNING deadline_at`,
          [job.id, leaseToken, images.parserDigest, images.scannerDigest])).rows[0];
        await db.query("UPDATE workforce_sources SET state='processing' WHERE id=$1", [candidate.source_id]);
        return { jobId: job.id, sourceId: candidate.source_id, sourceVersionId: job.source_version_id,
          workspaceId: actor.workspaceId, generation: Number(job.source_generation), leaseToken,
          deadlineAt: claimed.deadline_at.toISOString(), originalDigest: original.content_digest,
          byteSize: Number(original.byte_size), format: original.format, filename: original.filename,
          objectKey: original.object_key, parserImageDigest: images.parserDigest, scannerImageDigest: images.scannerDigest } satisfies WorkforceClaim;
      });
      if (claim) return claim;
    } catch (error) {
      if (error instanceof HttpFailure && [401, 403].includes(error.status)) {
        await cancelUnauthorized(candidate.id, candidate.source_id); continue;
      }
      throw error;
    }
  }
  return null;
}
export async function heartbeatWorkforceImport(claim: WorkforceClaim): Promise<boolean> {
  const result = await query(`UPDATE workforce_import_jobs j SET heartbeat_at=now(),
    lease_expires_at=least(now()+interval '30 seconds',j.deadline_at),updated_at=now()
    FROM workforce_source_versions v,workforce_sources s WHERE j.id=$1 AND j.environment_id=$2 AND j.workspace_id=$3
    AND j.lease_token=$4 AND j.state='running' AND j.deadline_at>now() AND j.lease_expires_at>now()
    AND v.id=j.source_version_id AND s.id=v.source_id AND s.generation=j.source_generation
    AND s.current_version_id=v.id AND s.state='processing' RETURNING j.id`,
    [claim.jobId, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId, claim.leaseToken]);
  return result.rowCount === 1;
}
async function lockClaim(db: PoolClient, claim: WorkforceClaim) {
  const actor = await workerActor(db, claim.sourceId);
  if (!actor) throw new HttpFailure(401, "authentication_required", "Import authority changed");
  await lockStaffingActor(db, actor, "manager", { write: true });
  const source = (await db.query(`SELECT generation,current_version_id,state FROM workforce_sources
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
    [claim.sourceId, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId])).rows[0];
  const job = (await db.query(`SELECT state,lease_token,lease_expires_at,deadline_at,source_generation,
    source_version_id,parser_image_digest,scanner_image_digest FROM workforce_import_jobs WHERE id=$1
    AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
    [claim.jobId, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId])).rows[0];
  if (!source || !job || job.state !== "running" || job.lease_token !== claim.leaseToken ||
    job.lease_expires_at?.getTime() <= Date.now() || job.deadline_at?.getTime() <= Date.now() ||
    source.state !== "processing" || Number(source.generation) !== claim.generation ||
    Number(job.source_generation) !== claim.generation || source.current_version_id !== claim.sourceVersionId ||
    job.source_version_id !== claim.sourceVersionId || job.parser_image_digest !== claim.parserImageDigest ||
    job.scanner_image_digest !== claim.scannerImageDigest) throw new HttpFailure(409, "source_changed", "Import lease changed");
}
export async function publishWorkforceImport(claim: WorkforceClaim, raw: unknown, rawReceipt: unknown) {
  const manifest = workforceExtractionSchema.parse(raw), receipt = artifactScanReceiptSchema.parse(rawReceipt);
  const scanDigest = staffingSha256(receipt);
  if (manifest.originalDigest !== claim.originalDigest || receipt.originalDigest !== claim.originalDigest ||
      receipt.result !== "clean" || manifest.imageDigest !== claim.parserImageDigest || manifest.scanReceiptDigest !== scanDigest) {
    throw new HttpFailure(409, "source_changed", "Import result binding changed");
  }
  const digest = staffingSha256(manifest), extractionId = randomUUID();
  const cells = manifest.cells.map(cell => ({ id: randomUUID(), sheet_index: cell.sheetIndex,
    row_number: cell.rowNumber, column_number: cell.columnNumber, content_digest: staffingSha256(cell), cell }));
  await withTransaction(async db => {
    await lockClaim(db, claim);
    await db.query(`INSERT INTO workforce_extractions(id,environment_id,workspace_id,source_version_id,job_id,attempt_token,
      extraction_version,content_digest,complete,scan_clean,sheet_count,cell_count,code_point_count)
      VALUES($1,$2,$3,$4,$5,$6,'workforce-table-v1',$7,$8,true,$9,$10,$11)`, [extractionId,
      getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId, claim.sourceVersionId, claim.jobId, claim.leaseToken,
      digest, manifest.status === "ready", manifest.sheets.length, manifest.cells.length, manifest.codePointCount]);
    const { cells: _cells, ...metadata } = manifest;
    await db.query("INSERT INTO workforce_extraction_payloads(revision_id,manifest) VALUES($1,$2)",
      [extractionId, JSON.stringify({ ...metadata, scanReceipt: receipt })]);
    for (let offset = 0; offset < cells.length; offset += 1_000) {
      const batch = JSON.stringify(cells.slice(offset, offset + 1_000));
      await db.query(`INSERT INTO workforce_extracted_cells(id,environment_id,workspace_id,extraction_id,
        sheet_index,row_number,column_number,content_digest)
        SELECT x.id,$1,$2,$3,x.sheet_index,x.row_number,x.column_number,x.content_digest FROM jsonb_to_recordset($4::jsonb)
        AS x(id uuid,sheet_index integer,row_number integer,column_number integer,content_digest text)`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId, extractionId, batch]);
      await db.query(`INSERT INTO workforce_extracted_cell_payloads(revision_id,cell)
        SELECT x.id,x.cell FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,cell jsonb)`, [batch]);
    }
    if (Date.now() >= Date.parse(claim.deadlineAt)) throw new HttpFailure(409, "source_changed", "Import deadline expired");
    await db.query("UPDATE workforce_import_jobs SET state=$2,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1",
      [claim.jobId, manifest.status]);
    await db.query("UPDATE workforce_sources SET state=$2 WHERE id=$1", [claim.sourceId, manifest.status]);
  });
  return { extractionId, contentDigest: digest, state: manifest.status };
}
const safeFailures = new Set(["unsafe_content", "scan_unavailable", "scan_stale", "parser_timeout", "parser_failed", "limit_exceeded", "source_changed"]);
export async function failWorkforceImport(claim: WorkforceClaim, rawCode: string, transient: boolean) {
  const code = safeFailures.has(rawCode) ? rawCode : "parser_failed";
  await withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const source = (await db.query(`SELECT generation,current_version_id,state FROM workforce_sources
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
      [claim.sourceId, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId])).rows[0];
    const job = (await db.query(`SELECT state,lease_token,attempt_number FROM workforce_import_jobs WHERE id=$1
      AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`, [claim.jobId, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId])).rows[0];
    if (!source || !job || job.state !== "running" || job.lease_token !== claim.leaseToken) return;
    const eligible = Number(source.generation) === claim.generation && source.current_version_id === claim.sourceVersionId && source.state === "processing";
    const retry = eligible && transient && ["scan_unavailable", "scan_stale", "parser_timeout"].includes(code) && job.attempt_number < 4 && process.env.TURAS_007_DISABLED !== "1";
    await db.query(`UPDATE workforce_import_jobs SET state=$2,error_code=$3,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`,
      [claim.jobId, retry ? "queued" : eligible ? "failed" : "cancelled", code]);
    if (eligible) await db.query("UPDATE workforce_sources SET state=$2 WHERE id=$1", [claim.sourceId, retry ? "quarantined" : "failed"]);
  });
}
export type WorkforceScanReceipt = ArtifactScanReceipt;
