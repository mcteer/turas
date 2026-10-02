import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema, staffingListSchema } from "../../contracts/staffing";
import type { WorkforceExtraction } from "../../contracts/artifacts";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { parseStaffing } from "./commands";
import { lockImportIntent } from "./imports";
import { readStaffingPageCursor, staffingPageCursor } from "./read";

const safeErrors = new Set(["authority_changed", "source_changed", "unsafe_content", "scan_unavailable", "scan_stale",
  "parser_timeout", "parser_failed", "limit_exceeded", "cancelled", "expired"]);
export async function projectImport(db: PoolClient, actor: StaffingActor, importId: string) {
  const intent = await lockImportIntent(db, actor, importId);
  const visible = !["withdrawn", "cancelled", "deleting", "deleted"].includes(intent.source_state);
  const job = intent.current_version_id ? (await db.query(`SELECT state,error_code,heartbeat_at,deadline_at
    FROM workforce_import_jobs WHERE source_version_id=$1`, [intent.current_version_id])).rows[0] : null;
  const base = { importId: intent.id, sourceId: intent.source_id, generation: Number(intent.generation),
    sourceVersionId: intent.current_version_id, state: intent.source_state, uploadState: intent.state,
    byteSize: Number(intent.expected_bytes), receivedBytes: Number(intent.received_bytes), format: intent.format,
    expiresAt: intent.expires_at.toISOString(), withheld: !visible };
  if (!visible) return base;
  const extraction = intent.current_version_id ? (await db.query(`SELECT x.id,x.content_digest,x.complete,
    x.cell_count,x.code_point_count,p.manifest FROM workforce_extractions x
    JOIN workforce_extraction_payloads p ON p.revision_id=x.id WHERE x.source_version_id=$1
    ORDER BY x.created_at DESC,x.id DESC LIMIT 1 FOR SHARE OF p`, [intent.current_version_id])).rows[0] : null;
  const mapping = intent.current_version_id ? (await db.query(`SELECT id,content_digest FROM workforce_mapping_revisions
    WHERE source_version_id=$1 ORDER BY revision_number DESC LIMIT 1`, [intent.current_version_id])).rows[0] : null;
  const metadata = extraction?.manifest as WorkforceExtraction | undefined;
  return { ...base, filename: intent.filename, job: job ? { state: job.state,
    errorCode: safeErrors.has(job.error_code) ? job.error_code : null,
    heartbeatAt: job.heartbeat_at?.toISOString() ?? null, deadlineAt: job.deadline_at?.toISOString() ?? null } : null,
    extraction: extraction && metadata ? { extractionRunId: extraction.id, contentDigest: extraction.content_digest,
      complete: extraction.complete, cellCount: extraction.cell_count, codePointCount: extraction.code_point_count,
      dateSystem: metadata.dateSystem, sheets: metadata.sheets.map(s => ({ index: s.index, name: s.name, state: s.state,
        rowCount: s.rowCount, columnCount: s.columnCount })), coverage: { total: metadata.coverage.total,
        visited: metadata.coverage.visited, omitted: metadata.coverage.omitted.map(o => ({ kind: o.kind, count: o.count, reason: o.reason })) } } : null,
    mapping: mapping ? { revisionId: mapping.id, contentDigest: mapping.content_digest } : null };
}
export async function readImport(actor: StaffingActor, rawId: unknown, client?: PoolClient) {
  const id = parseStaffing(staffingIdSchema, rawId);
  const run = async (db: PoolClient) => { await lockStaffingActor(db, actor, "manager"); return projectImport(db, actor, id); };
  return client ? run(client) : withTransaction(run);
}
export async function listImports(actor: StaffingActor, raw: unknown = {}, client?: PoolClient) {
  const input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "manager");
    const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "imports" }, after = readStaffingPageCursor(input.cursor, scope);
    const identities = (await db.query(`SELECT id,source_id FROM workforce_import_intents
      WHERE environment_id=$1 AND workspace_id=$2 AND owner_membership_id=$3 AND ($4::uuid IS NULL OR id>$4)
      ORDER BY id LIMIT $5`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, after, input.pageSize + 1])).rows;
    const page = identities.slice(0, input.pageSize);
    await db.query(`SELECT id FROM workforce_sources WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [page.map(i => i.source_id)]);
    const items = [];
    for (const identity of page) items.push(await projectImport(db, actor, identity.id));
    return { items, nextCursor: identities.length > input.pageSize ? staffingPageCursor(page.at(-1)!.id, scope) : null };
  };
  return client ? run(client) : withTransaction(run);
}

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { workforceMappingSchema } from "../../contracts/staffing-imports";
import { workforceCellSchema } from "../../contracts/artifacts";
import { resolveWorkforceRows } from "../../staffing/import-mapping";
import { staffingSha256 } from "./commands";
import { staffingCursorMac } from "./read";
export async function readImportRows(actor: StaffingActor, rawId: unknown, raw: unknown = {}, client?: PoolClient) {
  const importId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingListSchema, raw);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "manager");
    const intent = await lockImportIntent(db, actor, importId);
    if (["withdrawn", "cancelled", "deleting", "deleted"].includes(intent.source_state)) throw hiddenRecord();
    const extraction = intent.current_version_id ? (await db.query(`SELECT x.id,x.content_digest,p.manifest FROM workforce_extractions x
      JOIN workforce_extraction_payloads p ON p.revision_id=x.id WHERE x.source_version_id=$1
      ORDER BY x.created_at DESC,x.id DESC LIMIT 1 FOR SHARE OF p`, [intent.current_version_id])).rows[0] : null;
    if (!extraction) return { items: [], nextCursor: null, state: intent.source_state, mapped: false };
    const mapping = (await db.query(`SELECT r.id,p.mapping FROM workforce_mapping_revisions r
      JOIN workforce_mapping_payloads p ON p.revision_id=r.id WHERE r.source_version_id=$1
      ORDER BY r.revision_number DESC LIMIT 1 FOR SHARE OF p`, [intent.current_version_id])).rows[0];
    const scope = staffingSha256({ environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
      actor: actor.membershipId, projection: "import_rows", importId, generation: intent.generation,
      extraction: extraction.id, mapping: mapping?.id ?? null });
    let after: { sheetIndex: number; rowNumber: number } | null = null;
    if (input.cursor) {
      let parsed;
      try {
        const [body, signature, extra] = input.cursor.split("."), expected = Buffer.from(staffingCursorMac(body ?? "")), actual = Buffer.from(signature ?? "");
        if (!body || extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
        parsed = z.object({ sheetIndex: z.number().int().min(0).max(19), rowNumber: z.number().int().positive(),
          scope: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      } catch { throw new HttpFailure(422, "invalid_input", "Invalid import cursor"); }
      if (parsed.scope !== scope) throw new HttpFailure(409, "source_changed", "Import rows changed; reload");
      after = parsed;
    }
    const located = (await db.query(`SELECT c.id,p.cell FROM workforce_extracted_cells c
      JOIN workforce_extracted_cell_payloads p ON p.revision_id=c.id WHERE c.extraction_id=$1
      ORDER BY c.sheet_index,c.row_number,c.column_number FOR SHARE OF p`, [extraction.id])).rows.map(r =>
        ({ id: r.id as string, cell: workforceCellSchema.parse(r.cell) }));
    const metadata = extraction.manifest as WorkforceExtraction;
    const explicit = mapping ? workforceMappingSchema.parse({ ...mapping.mapping, requestKey: "stored_mapping" }) : null;
    const resolved = explicit ? resolveWorkforceRows(explicit, metadata, located) : null;
    const groups = new Map<string, typeof located>();
    for (const cell of located) {
      const key = `${cell.cell.sheetIndex}:${cell.cell.rowNumber}`;
      const group = groups.get(key) ?? []; group.push(cell); groups.set(key, group);
    }
    const rowIdentities = [...groups.keys()].map(key => { const [sheetIndex, rowNumber] = key.split(":").map(Number);
      return { key, sheetIndex, rowNumber }; }).filter(row => !after || row.sheetIndex > after.sheetIndex ||
        row.sheetIndex === after.sheetIndex && row.rowNumber > after.rowNumber)
      .sort((a, b) => a.sheetIndex - b.sheetIndex || a.rowNumber - b.rowNumber);
    const page = rowIdentities.slice(0, input.pageSize);
    const currentCandidates = (await db.query(`SELECT r.id,r.competency_id,r.row_key,r.mapping_revision_id,r.content_digest,
      r.source_generation,c.aggregate_version FROM workforce_competency_revisions r
      JOIN workforce_competencies c ON c.current_pending_revision_id=r.id WHERE r.source_version_id=$1`, [intent.current_version_id])).rows;
    const items = page.map(row => {
      const original = groups.get(row.key)!, interpreted = resolved?.find(r => r.rowKey === row.key);
      const pending = currentCandidates.find(c => c.row_key === row.key && c.mapping_revision_id === mapping?.id);
      return { rowKey: row.key, sheetIndex: row.sheetIndex, rowNumber: row.rowNumber,
        cells: original.slice(0, 50).map(({ id, cell }) => ({ cellId: id, columnNumber: cell.columnNumber,
          a1: cell.a1, kind: cell.kind, raw: typeof cell.raw === "string" ? cell.raw.slice(0, 4_000) : cell.raw,
          text: cell.text.slice(0, 4_000), formula: cell.formula?.slice(0, 4_000) ?? null, sharedFormula: cell.sharedFormula,
          cachedValue: typeof cell.cachedValue === "string" ? cell.cachedValue.slice(0, 4_000) : cell.cachedValue,
          hiddenSheet: cell.hiddenSheet, hiddenRow: cell.hiddenRow, hiddenColumn: cell.hiddenColumn,
          merged: cell.merged, mergedMaster: cell.mergedMaster, lineStart: cell.lineStart, lineEnd: cell.lineEnd,
          truncated: cell.text.length > 4_000 || typeof cell.raw === "string" && cell.raw.length > 4_000 })),
        columnsComplete: original.length <= 50, errors: interpreted?.errors ?? [],
        correctedFields: interpreted?.candidate?.correctedFields ?? [],
        candidate: pending && interpreted?.candidate ? { competencyId: pending.competency_id, revisionId: pending.id,
          contentDigest: pending.content_digest, sourceGeneration: Number(pending.source_generation),
          aggregateVersion: Number(pending.aggregate_version), resourceId: interpreted.candidate.resourceId,
          skillId: interpreted.candidate.skillId, level: interpreted.candidate.level,
          assessmentDate: interpreted.candidate.assessmentDate, nextReviewDate: interpreted.candidate.nextReviewDate,
          evidence: interpreted.candidate.evidence, locators: interpreted.candidate.locators } : null };
    });
    const last = page.at(-1), body = last ? Buffer.from(JSON.stringify({ sheetIndex: last.sheetIndex, rowNumber: last.rowNumber, scope })).toString("base64url") : null;
    return { items, nextCursor: body && rowIdentities.length > input.pageSize ? `${body}.${staffingCursorMac(body)}` : null,
      state: intent.source_state, mapped: Boolean(mapping), complete: metadata.status === "ready" };
  };
  return client ? run(client) : withTransaction(run);
}
