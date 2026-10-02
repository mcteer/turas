import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { STAFFING_LIMITS, staffingIdSchema } from "../../contracts/staffing";
import { workforceImportIntentSchema, workforceImportCompletionSchema } from "../../contracts/staffing-imports";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { parseStaffing, runStaffingCommand, reserveStaffingRate } from "./commands";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { WorkforceStore } from "./store";
import { preflightArtifact } from "../../../packages/artifact-extractor/src/preflight";

export type ImportIntent = { id: string; source_id: string; source_state: string; generation: string;
  current_version_id: string | null; owner_membership_id: string; expected_digest: string; expected_bytes: string;
  received_bytes: string; staged_object_key: string | null; uploaded_digest: string | null;
  state: string; filename: string | null; format: "csv" | "xlsx"; expires_at: Date };
export const workforceMime = (format: "csv" | "xlsx") => format === "csv" ? "text/csv" :
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Actor is locked before source discovery. Source header precedes mutable intent. */
export async function lockImportIntent(db: PoolClient, actor: StaffingActor, id: string,
  mode: "SHARE" | "UPDATE" = "SHARE"): Promise<ImportIntent> {
  const scope = [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId];
  const identity = (await db.query(`SELECT source_id FROM workforce_import_intents
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND owner_membership_id=$4`, scope)).rows[0];
  if (!identity) throw hiddenRecord();
  const source = (await db.query(`SELECT state,generation,current_version_id FROM workforce_sources
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR ${mode}`,
    [identity.source_id, scope[1], scope[2]])).rows[0];
  if (!source) throw hiddenRecord();
  const intent = (await db.query(`SELECT id,source_id,owner_membership_id,expected_digest,expected_bytes,
    received_bytes,staged_object_key,uploaded_digest,state,CASE WHEN $5 THEN filename ELSE NULL END AS filename,format,expires_at
    FROM workforce_import_intents WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    AND owner_membership_id=$4 FOR ${mode}`, [...scope, !["withdrawn", "cancelled", "deleting", "deleted"].includes(source.state)])).rows[0];
  if (!source || !intent || intent.source_id !== identity.source_id) throw hiddenRecord();
  return { ...intent, source_state: source.state, generation: source.generation, current_version_id: source.current_version_id };
}
export async function createImportIntent(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(workforceImportIntentSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "import_start" },
    { capability: "manager", table: "workforce_command_receipts", rateKind: "import" }, async db => {
      // One quota row also serializes first-import admission for the workspace.
      await db.query(`INSERT INTO workforce_import_quotas(environment_id,workspace_id) VALUES($1,$2)
        ON CONFLICT DO NOTHING`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      await db.query(`SELECT workspace_id FROM workforce_import_quotas WHERE environment_id=$1 AND workspace_id=$2 FOR UPDATE`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      const open = await db.query(`SELECT id FROM workforce_import_intents WHERE environment_id=$1 AND workspace_id=$2
        AND owner_membership_id=$3 AND state IN ('open','uploaded') AND expires_at>now()`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId]);
      const queued = await db.query(`SELECT id FROM workforce_import_jobs WHERE environment_id=$1 AND workspace_id=$2
        AND state IN ('queued','running')`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
      if ((open.rowCount ?? 0) >= STAFFING_LIMITS.openImportsPerManager || (queued.rowCount ?? 0) >= STAFFING_LIMITS.queuedImportsPerWorkspace) {
        throw new HttpFailure(429, "rate_limited", "Workforce import queue is full");
      }
      const quota = await db.query(`UPDATE workforce_import_quotas SET reserved_bytes=reserved_bytes+$3
        WHERE environment_id=$1 AND workspace_id=$2 AND reserved_bytes+$3<=$4 RETURNING workspace_id`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.byteSize, STAFFING_LIMITS.originalQuotaBytes]);
      if (!quota.rowCount) throw new HttpFailure(429, "rate_limited", "Workforce storage quota reached");
      const sourceId = randomUUID(), importId = randomUUID(), expiresAt = new Date(Date.now() + 3_600_000).toISOString();
      await db.query(`INSERT INTO workforce_sources(id,environment_id,workspace_id,state,owner_membership_id,owner_session_id)
        VALUES($1,$2,$3,'uploading',$4,$5)`, [sourceId, getServerConfig().TURAS_ENVIRONMENT_ID,
        actor.workspaceId, actor.membershipId, actor.sessionId]);
      await db.query(`INSERT INTO workforce_import_intents(id,environment_id,workspace_id,source_id,owner_membership_id,
        expected_digest,expected_bytes,state,filename,format,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10)`,
        [importId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, sourceId, actor.membershipId,
          input.contentDigest, input.byteSize, input.filename, input.format, expiresAt]);
      return { sourceId, importId, generation: 1, state: "open", expiresAt };
    }, client);
}
function requireUploadable(intent: ImportIntent) {
  if (!["open", "uploaded"].includes(intent.state) || intent.source_state !== "uploading" ||
      intent.expires_at.getTime() <= Date.now()) throw new HttpFailure(409, "source_changed", "Import changed or expired");
}
export async function uploadImportOriginal(actor: StaffingActor, rawId: unknown, bytes: AsyncIterable<Uint8Array>, declaredMime?: string) {
  const importId = parseStaffing(staffingIdSchema, rawId);
  const snapshot = await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager", { write: true });
    const intent = await lockImportIntent(db, actor, importId); requireUploadable(intent);
    if (declaredMime !== undefined && declaredMime !== workforceMime(intent.format)) throw new HttpFailure(415, "invalid_input", "Original media type differs from declaration");
    await reserveStaffingRate(db, actor, "write");
    return intent;
  });
  const store = new WorkforceStore(), staged = await store.stage(bytes, Number(snapshot.expected_bytes));
  let retained = false;
  try {
    if (staged.contentDigest !== snapshot.expected_digest) throw new HttpFailure(422, "invalid_input", "Original digest differs from declaration");
    return await withTransaction(async db => {
      await lockStaffingActor(db, actor, "manager", { write: true });
      const intent = await lockImportIntent(db, actor, importId, "UPDATE"); requireUploadable(intent);
      if (intent.generation !== snapshot.generation) throw new HttpFailure(409, "source_changed", "Import changed");
      if (!intent.staged_object_key) {
        await db.query(`UPDATE workforce_import_intents SET staged_object_key=$2,uploaded_digest=$3,
          received_bytes=$4,state='uploaded' WHERE id=$1`, [importId, staged.key, staged.contentDigest, staged.byteSize]);
        retained = true;
      } else if (intent.uploaded_digest !== staged.contentDigest) throw new HttpFailure(409, "source_changed", "Uploaded original changed");
      return { importId, sourceId: intent.source_id, generation: Number(intent.generation), state: "uploaded" };
    });
  } finally { if (!retained) await store.remove(staged.key, "staged"); }
}
export async function completeImport(actor: StaffingActor, rawId: unknown, raw: unknown) {
  const importId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(workforceImportCompletionSchema, raw);
  const snapshot = await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager", { write: true });
    return lockImportIntent(db, actor, importId);
  });
  const store = new WorkforceStore();
  if (snapshot.state !== "completed") {
    requireUploadable(snapshot);
    if (!snapshot.staged_object_key || !snapshot.filename || Number(snapshot.generation) !== input.sourceGeneration ||
      snapshot.expected_digest !== input.contentDigest) throw new HttpFailure(409, "source_changed", "Import changed");
    const bytes = await store.read(snapshot.staged_object_key, "staged");
    if (bytes.length !== Number(snapshot.expected_bytes) || createHash("sha256").update(bytes).digest("hex") !== input.contentDigest) {
      throw new HttpFailure(409, "source_changed", "Original changed");
    }
    try { await preflightArtifact(bytes, snapshot.filename, workforceMime(snapshot.format)); }
    catch { throw new HttpFailure(422, "invalid_input", "Unsupported or malformed workforce original"); }
    await store.finalize(snapshot.staged_object_key, importId, input.contentDigest);
  }
  // All filesystem/preflight work completed before opening the mutation transaction.
  return runStaffingCommand(actor, { ...input, importId, action: "import_complete" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      const intent = await lockImportIntent(db, actor, importId, "UPDATE");
      if (Number(intent.generation) !== input.sourceGeneration || intent.expected_digest !== input.contentDigest ||
        ["withdrawn", "cancelled", "deleting", "deleted"].includes(intent.source_state)) {
        throw new HttpFailure(409, "source_changed", "Import changed");
      }
      if (intent.state === "completed" && intent.current_version_id) return { importId, sourceId: intent.source_id,
        sourceVersionId: intent.current_version_id, generation: input.sourceGeneration, state: intent.source_state };
      requireUploadable(intent);
      if (!intent.filename || !intent.staged_object_key || intent.received_bytes !== intent.expected_bytes ||
        intent.uploaded_digest !== input.contentDigest) throw new HttpFailure(409, "source_changed", "Original is not uploaded");
      const versionId = randomUUID();
      await db.query(`INSERT INTO workforce_source_versions(id,environment_id,workspace_id,source_id,generation,
        content_digest,byte_size,format,object_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [versionId,
        getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, intent.source_id, input.sourceGeneration,
        input.contentDigest, Number(intent.expected_bytes), intent.format, importId]);
      await db.query("INSERT INTO workforce_source_payloads(revision_id,filename,object_key) VALUES($1,$2,$3)",
        [versionId, intent.filename, importId]);
      await db.query(`UPDATE workforce_sources SET current_version_id=$2,state='quarantined' WHERE id=$1`, [intent.source_id, versionId]);
      await db.query("UPDATE workforce_import_intents SET state='completed' WHERE id=$1", [importId]);
      await db.query(`INSERT INTO workforce_import_jobs(id,environment_id,workspace_id,source_version_id,source_generation,state)
        VALUES($1,$2,$3,$4,$5,'queued')`, [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID,
        actor.workspaceId, versionId, input.sourceGeneration]);
      return { importId, sourceId: intent.source_id, sourceVersionId: versionId, generation: input.sourceGeneration, state: "quarantined" };
    });
}
export async function readImportOriginal(actor: StaffingActor, rawId: unknown) {
  const importId = parseStaffing(staffingIdSchema, rawId);
  const identity = await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager");
    const intent = await lockImportIntent(db, actor, importId);
    if (!intent.current_version_id || !["ready", "partial", "reviewed"].includes(intent.source_state)) throw hiddenRecord();
    const clean = await db.query(`SELECT id FROM workforce_extractions WHERE source_version_id=$1 AND scan_clean`,
      [intent.current_version_id]);
    if (!clean.rowCount || !intent.filename) throw hiddenRecord();
    return { generation: intent.generation, filename: intent.filename, format: intent.format };
  });
  const bytes = await new WorkforceStore().read(importId);
  // Reauthorize after IO; withdrawal and revoked sessions cannot release old bytes.
  await withTransaction(async db => {
    await lockStaffingActor(db, actor, "manager");
    const current = await lockImportIntent(db, actor, importId);
    if (current.generation !== identity.generation || !["ready", "partial", "reviewed"].includes(current.source_state)) throw hiddenRecord();
  });
  return { bytes, filename: identity.filename, mime: workforceMime(identity.format) };
}
