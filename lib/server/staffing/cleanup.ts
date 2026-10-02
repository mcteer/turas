import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { requireStaffingEnvironment } from "./repository";
import { recordStaffingTelemetry } from "./telemetry";
import { WorkforceStore } from "./store";

type CleanupClaim = { id: string; sourceId: string | null; manualEvidenceId: string | null;
  workspaceId: string; generation: number; leaseToken: string; objectKeys: string[]; stagedKeys: string[] };

/** Service retention authority is scoped to the selected DB marker, independent
 * of the uploader's current login. No workforce/customer content is returned. */
export async function enqueueExpiredWorkforceSources() {
  await enqueueExpiredManualEvidence();
  await withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    const candidates = await db.query(`SELECT s.id FROM workforce_sources s
      LEFT JOIN workforce_import_intents i ON i.source_id=s.id
      WHERE s.environment_id=$1 AND s.state NOT IN ('cancelled','withdrawn','deleting','deleted')
      AND (s.created_at<=now()-interval '30 days' OR i.state IN ('open','uploaded') AND i.expires_at<=now())
      AND NOT EXISTS(SELECT 1 FROM workforce_source_versions v
        JOIN workforce_competency_revisions r ON r.source_version_id=v.id
        JOIN workforce_review_decisions d ON d.revision_id=r.id AND d.action='accept' WHERE v.source_id=s.id)
      ORDER BY s.id LIMIT 20`, [environmentId]);
    for (const candidate of candidates.rows) {
      const source = (await db.query("SELECT id,workspace_id,generation,state,created_at FROM workforce_sources WHERE id=$1 FOR UPDATE", [candidate.id])).rows[0];
      if (!source || ["cancelled", "withdrawn", "deleting", "deleted"].includes(source.state)) continue;
      const accepted = await db.query(`SELECT d.id FROM workforce_source_versions v
        JOIN workforce_competency_revisions r ON r.source_version_id=v.id
        JOIN workforce_review_decisions d ON d.revision_id=r.id AND d.action='accept' WHERE v.source_id=$1 LIMIT 1`, [source.id]);
      if (accepted.rowCount) continue;
      const intent = (await db.query("SELECT state,expires_at FROM workforce_import_intents WHERE source_id=$1 FOR UPDATE", [source.id])).rows[0];
      const aged = source.created_at.getTime() <= Date.now() - 30 * 86_400_000;
      if (!aged && !(intent && ["open", "uploaded"].includes(intent.state) && intent.expires_at.getTime() <= Date.now())) continue;
      await db.query("UPDATE workforce_sources SET generation=generation+1,state='cancelled',retired_at=now() WHERE id=$1", [source.id]);
      await db.query("UPDATE workforce_import_intents SET state='expired' WHERE source_id=$1 AND state IN ('open','uploaded')", [source.id]);
      await db.query(`UPDATE workforce_import_jobs SET state='cancelled',lease_token=NULL,lease_expires_at=NULL,error_code='expired'
        WHERE source_version_id IN (SELECT id FROM workforce_source_versions WHERE source_id=$1) AND state IN ('queued','running')`, [source.id]);
      await db.query(`INSERT INTO workforce_cleanup_jobs(id,environment_id,workspace_id,source_id,generation,not_before)
        VALUES($1,$2,$3,$4,$5,greatest(now(),$6::timestamptz+interval '30 days')) ON CONFLICT DO NOTHING`,
        [randomUUID(), environmentId, source.workspace_id, source.id, source.generation, source.created_at]);
    }
  });
}
async function claimCleanup(): Promise<CleanupClaim[]> {
  return withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    const candidates = await db.query(`SELECT id,source_id,manual_evidence_id FROM workforce_cleanup_jobs
      WHERE environment_id=$1 AND not_before<=now() AND (state IN ('queued','failed') OR state='running' AND lease_expires_at<=now())
      ORDER BY coalesce(manual_evidence_id,source_id),id LIMIT 1`, [environmentId]);
    const claims: CleanupClaim[] = [];
    for (const candidate of candidates.rows) {
      const sourceTable = candidate.source_id ? "workforce_sources" : "workforce_manual_evidence";
      const sourceId = candidate.source_id ?? candidate.manual_evidence_id;
      const source = (await db.query(`SELECT generation FROM ${sourceTable} WHERE id=$1 AND environment_id=$2 FOR UPDATE`, [sourceId, environmentId])).rows[0];
      const job = (await db.query(`SELECT id,workspace_id,generation,state,lease_expires_at FROM workforce_cleanup_jobs
        WHERE id=$1 AND environment_id=$2 FOR UPDATE SKIP LOCKED`, [candidate.id, environmentId])).rows[0];
      if (!source || !job || Number(source.generation) <= Number(job.generation) ||
        job.state === "completed" || job.state === "running" && job.lease_expires_at?.getTime() > Date.now()) continue;
      const objectKeys: string[] = [], stagedKeys: string[] = [];
      if (candidate.source_id) {
        const originals = await db.query(`SELECT object_key FROM workforce_source_versions WHERE source_id=$1 AND generation=$2`, [sourceId, job.generation]);
        objectKeys.push(...originals.rows.map(r => r.object_key));
        const intent = (await db.query(`SELECT i.id,i.staged_object_key,v.generation AS current_generation
          FROM workforce_import_intents i JOIN workforce_sources s ON s.id=i.source_id
          LEFT JOIN workforce_source_versions v ON v.id=s.current_version_id WHERE i.source_id=$1`, [sourceId])).rows[0];
        if (intent && (!intent.current_generation || Number(intent.current_generation) <= Number(job.generation))) {
          if (intent.staged_object_key) stagedKeys.push(intent.staged_object_key);
          // Completion IO may have produced an object before a failed DB publication.
          if (!objectKeys.includes(intent.id)) objectKeys.push(intent.id);
        }
      }
      const leaseToken = randomUUID();
      await db.query("UPDATE workforce_cleanup_jobs SET state='running',lease_token=$2,lease_expires_at=now()+interval '30 seconds' WHERE id=$1", [job.id, leaseToken]);
      claims.push({ id: job.id, sourceId: candidate.source_id, manualEvidenceId: candidate.manual_evidence_id,
        workspaceId: job.workspace_id, generation: Number(job.generation), leaseToken, objectKeys, stagedKeys });
    }
    return claims;
  });
}
async function finishCleanup(claim: CleanupClaim) {
  return withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    const table = claim.sourceId ? "workforce_sources" : "workforce_manual_evidence", sourceId = claim.sourceId ?? claim.manualEvidenceId;
    const source = (await db.query(`SELECT generation,state FROM ${table} WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE`,
      [sourceId, environmentId, claim.workspaceId])).rows[0];
    const job = (await db.query(`SELECT state,lease_token,lease_expires_at FROM workforce_cleanup_jobs
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND generation=$4 FOR UPDATE`,
      [claim.id, environmentId, claim.workspaceId, claim.generation])).rows[0];
    if (!source || Number(source.generation) <= claim.generation || !job || job.state !== "running" ||
      job.lease_token !== claim.leaseToken || job.lease_expires_at.getTime() <= Date.now()) return false;
    await db.query(`SELECT ${claim.sourceId ? "turas_purge_workforce_source" : "turas_purge_workforce_manual"}($1,$2)`, [sourceId, claim.generation]);
    if (Number(source.generation) === claim.generation + 1 && ["withdrawn", "cancelled", "deleting"].includes(source.state)) {
      await db.query(`UPDATE ${table} SET state='deleted' WHERE id=$1`, [sourceId]);
      if (claim.sourceId) {
        const released = await db.query(`UPDATE workforce_import_intents SET quota_released=true,staged_object_key=NULL
          WHERE source_id=$1 AND NOT quota_released RETURNING expected_bytes`, [sourceId]);
        if (released.rowCount) await db.query(`UPDATE workforce_import_quotas SET reserved_bytes=reserved_bytes-$3
          WHERE environment_id=$1 AND workspace_id=$2`, [environmentId, claim.workspaceId, Number(released.rows[0].expected_bytes)]);
      }
    }
    await db.query("UPDATE workforce_cleanup_jobs SET state='completed',lease_token=NULL,lease_expires_at=NULL WHERE id=$1", [claim.id]);
    return true;
  });
}
export async function runWorkforceCleanupTick() {
  const startedAt = Date.now();
  let completed = 0, orphaned = 0, failed = false;
  try {
    await enqueueExpiredWorkforceSources();
    orphaned = await sweepWorkforceOrphans();
    const store = new WorkforceStore();
    for (let processed = 0; processed < 20; processed++) {
      const [claim] = await claimCleanup();
      if (!claim) break;
      try {
        // Exact immutable object identities cannot be reused by newer source versions.
        for (const key of claim.objectKeys) await store.remove(key);
        for (const key of claim.stagedKeys) await store.remove(key, "staged");
        if (await finishCleanup(claim)) completed++;
      } catch {
        failed = true;
        await query(`UPDATE workforce_cleanup_jobs SET state='failed',lease_token=NULL,lease_expires_at=NULL,not_before=now()+interval '30 seconds'
          WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND lease_token=$4`,
          [claim.id, getServerConfig().TURAS_ENVIRONMENT_ID, claim.workspaceId, claim.leaseToken]);
      }
    }
  } catch (error) { failed = true; throw error; }
  finally {
    if (failed || completed || orphaned) recordStaffingTelemetry({ operation: "cleanup", outcome: failed ? "failed" : "committed",
      durationMs: Math.min(86_400_000, Math.max(0, Date.now() - startedAt)), count: completed + orphaned });
  }
}

/** Reclaims interrupted staging and late completion objects after a 24h grace
 * period. It never infers deletion from a filename or filesystem age alone. */
export async function sweepWorkforceOrphans() {
  const store = new WorkforceStore();
  let removed = 0;
  for (const kind of ["staged", "objects"] as const) {
    for (const key of await store.sweepCandidates(kind)) {
      if (removed >= 20) return removed;
      const removable = await withTransaction(async db => {
        await requireStaffingEnvironment(db, false);
        const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
        const identity = (await db.query(`SELECT i.id,i.source_id FROM workforce_import_intents i
          WHERE i.environment_id=$1 AND ${kind === "staged" ? "i.staged_object_key=$2::uuid" : "i.id=$2::uuid"}`,
          [environmentId, key])).rows[0];
        if (!identity) {
          // Immutable object headers survive payload purge forever.
          if (kind === "objects") return !(await db.query(`SELECT id FROM workforce_source_versions
            WHERE environment_id=$1 AND object_key=$2`, [environmentId, key])).rowCount;
          return true;
        }
        const source = (await db.query(`SELECT generation,state FROM workforce_sources
          WHERE id=$1 AND environment_id=$2 FOR SHARE`, [identity.source_id, environmentId])).rows[0];
        const intent = (await db.query(`SELECT state,staged_object_key FROM workforce_import_intents
          WHERE id=$1 AND environment_id=$2 FOR SHARE`, [identity.id, environmentId])).rows[0];
        if (!source || !intent || kind === "staged" && intent.staged_object_key !== key) return false;
        if (kind === "staged" && intent.state === "completed") {
          return Boolean((await db.query(`SELECT id FROM workforce_source_versions
            WHERE source_id=$1 AND object_key=$2`, [identity.source_id, identity.id])).rowCount);
        }
        if (!["withdrawn", "cancelled", "deleting", "deleted"].includes(source.state)) return false;
        return Boolean((await db.query(`SELECT id FROM workforce_cleanup_jobs WHERE source_id=$1
          AND environment_id=$2 AND state='completed' AND not_before<=now() AND generation=$3-1`,
          [identity.source_id, environmentId, source.generation])).rowCount);
      });
      if (removable) { await store.remove(key, kind); removed++; }
    }
  }
  return removed;
}

/** Manual personnel notes share the same thirty-day pending retention boundary.
 * Source locks serialize expiry against exact human acceptance, without depending
 * on the author's current session or moving an assessment date forward. */
export async function enqueueExpiredManualEvidence() {
  await withTransaction(async db => {
    await requireStaffingEnvironment(db, false);
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    const candidates = await db.query(`SELECT m.id FROM workforce_manual_evidence m
      WHERE m.environment_id=$1 AND m.state='active' AND m.created_at<=now()-interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM workforce_competency_revisions r
        JOIN workforce_review_decisions d ON d.revision_id=r.id AND d.action='accept' WHERE r.manual_evidence_id=m.id)
      ORDER BY m.id LIMIT 20`, [environmentId]);
    for (const candidate of candidates.rows) {
      const source = (await db.query(`SELECT id,workspace_id,generation,state,created_at FROM workforce_manual_evidence
        WHERE id=$1 AND environment_id=$2 FOR UPDATE`, [candidate.id, environmentId])).rows[0];
      if (!source || source.state !== "active" || source.created_at.getTime() > Date.now() - 30 * 86_400_000) continue;
      const accepted = await db.query(`SELECT d.id FROM workforce_competency_revisions r
        JOIN workforce_review_decisions d ON d.revision_id=r.id AND d.action='accept'
        WHERE r.manual_evidence_id=$1 LIMIT 1`, [source.id]);
      if (accepted.rowCount) continue;
      await db.query("UPDATE workforce_manual_evidence SET generation=generation+1,state='withdrawn',retired_at=now() WHERE id=$1", [source.id]);
      await db.query(`INSERT INTO workforce_cleanup_jobs(id,environment_id,workspace_id,manual_evidence_id,generation,not_before)
        VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`,
        [randomUUID(), environmentId, source.workspace_id, source.id, source.generation]);
    }
  });
}
