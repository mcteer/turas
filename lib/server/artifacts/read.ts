import { createHmac, timingSafeEqual } from "node:crypto";
import { open } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { artifactUnitsQuerySchema } from "../../contracts/artifacts";
import { LocalArtifactStore } from "./local-store";
import { requireArtifactSourceReader } from "./policy";
import { lockProfileActor } from "../profiles/policy";

type Version = {
  id: string; artifact_id: string; version_number: number; lifecycle_generation: string;
  environment_id: string; workspace_id: string; customer_id: string; owner_principal_id: string;
  submitted_at: Date | null; state: string; detected_format: string | null;
  actual_size_bytes: string; filename: string; safe_error_code: string | null; object_key: string;
  coverage: unknown | null; run_id: string | null;
};

async function readableVersion(client: PoolClient, actor: CurrentSession, id: string): Promise<Version> {
  const result = await client.query<Version>(`
    SELECT v.*,r.coverage,r.id AS run_id FROM artifact_versions v
    LEFT JOIN artifact_extraction_runs r ON r.version_id=v.id AND r.state='published'
    WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3
  `, [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  await requireArtifactSourceReader(client, actor, {
    environmentId: row.environment_id, workspaceId: row.workspace_id,
    customerId: row.customer_id, ownerPrincipalId: row.owner_principal_id,
    submittedAt: row.submitted_at,
  });
  return row;
}

function readableContent(row: Version): void {
  if (!["ready","partial"].includes(row.state) || !row.run_id) {
    throw new HttpFailure(409, "artifact_not_ready", "Source text is unavailable");
  }
}

export async function readArtifactVersion(actor: CurrentSession, id: string) {
  return withTransaction(async (client) => {
    const row = await readableVersion(client, actor, id);
    const steward = row.submitted_at && actor.kind === "internal" && actor.role !== "admin"
      ? await client.query("SELECT 1 FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 AND active",
        [row.customer_id,actor.membershipId]) : null;
    const canManageLifecycle = row.submitted_at
      ? actor.kind === "internal" && (actor.role === "admin" || Boolean(steward?.rowCount))
      : actor.principalId === row.owner_principal_id;
    return { id: row.id, artifactId: row.artifact_id, publishedRunId: row.run_id,
      versionNumber: row.version_number,
      lifecycleGeneration: Number(row.lifecycle_generation), state: row.state,
      format: row.detected_format, sizeBytes: Number(row.actual_size_bytes),
      displayName: row.filename, coverage: row.coverage,
      safeErrorCode: row.safe_error_code, canReadOriginal: ["ready","partial"].includes(row.state),
      canPropose: actor.principalId === row.owner_principal_id && ["ready","partial"].includes(row.state),
      submitted: Boolean(row.submitted_at), canManageLifecycle };
  });
}

export async function readArtifactImpact(actor: CurrentSession,id: string) {
  return withTransaction(async (client) => {
    await readableVersion(client,actor,id);
    const result = await client.query<{ affected_claims: string; dependent_conversations: string }>(`
      SELECT (SELECT count(DISTINCT l.profile_revision_id)::text
        FROM artifact_evidence_selections s JOIN profile_evidence_links l
          ON l.artifact_selection_id=s.id WHERE s.version_id=$1) AS affected_claims,
        (SELECT count(DISTINCT conversation_id)::text
          FROM conversation_artifact_dependencies WHERE version_id=$1) AS dependent_conversations
    `, [id]);
    return { affectedClaims: Number(result.rows[0]?.affected_claims ?? 0),
      dependentConversations: Number(result.rows[0]?.dependent_conversations ?? 0) };
  });
}

export async function listOwnedArtifactSources(actor: CurrentSession,customerId: string) {
  return withTransaction(async (client) => {
    await lockProfileActor(client,actor,customerId);
    const result = await client.query<{ id: string; filename: string; state: string;
      version_number: number; created_at: Date }>(`
      SELECT id,filename,state,version_number,created_at FROM artifact_versions
      WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
        AND owner_principal_id=$4 AND state IN ('ready','partial')
      ORDER BY created_at DESC,id DESC LIMIT 50`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.principalId]);
    return { items: result.rows.map((row) => ({ versionId: row.id,displayName: row.filename,
      state: row.state,versionNumber: row.version_number,createdAt: row.created_at.toISOString() })) };
  });
}

function cursorSignature(actor: CurrentSession, versionId: string, ordinal: number): string {
  return createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET)
    .update(`${actor.principalId}:${actor.workspaceId}:${versionId}:${ordinal}`).digest("hex");
}

function decodeCursor(actor: CurrentSession, versionId: string, cursor?: string): number {
  if (!cursor) return 0;
  const [number, signature] = cursor.split(".");
  const ordinal = Number(number);
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || !/^[a-f0-9]{64}$/.test(signature ?? "")) {
    throw new HttpFailure(422, "invalid_cursor", "Invalid page cursor");
  }
  const expected = Buffer.from(cursorSignature(actor, versionId, ordinal), "hex");
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
    throw new HttpFailure(422, "invalid_cursor", "Invalid page cursor");
  }
  return ordinal;
}

export async function readArtifactUnits(actor: CurrentSession, id: string, rawQuery: unknown) {
  const input = artifactUnitsQuerySchema.parse(rawQuery);
  const after = decodeCursor(actor, id, input.cursor);
  return withTransaction(async (client) => {
    const row = await readableVersion(client, actor, id);
    readableContent(row);
    const result = await client.query<{ id: string; ordinal: number; text: string | null;
      locator: unknown; origin: string; ocr_confidence: string | null; formula: string | null;
      cached_value: unknown; hidden: boolean }>(`
      SELECT id,ordinal,text,locator,origin,ocr_confidence,formula,cached_value,hidden
      FROM artifact_extraction_units WHERE version_id=$1 AND run_id=$2 AND ordinal>$3
        AND text IS NOT NULL ORDER BY ordinal LIMIT $4
    `, [id,row.run_id,after,input.limit + 1]);
    const items = result.rows.slice(0,input.limit).map((unit) => ({
      id: unit.id, ordinal: unit.ordinal, text: unit.text, locator: unit.locator,
      origin: unit.origin, ocrConfidence: unit.ocr_confidence === null ? null : Number(unit.ocr_confidence),
      formula: unit.formula, cachedValue: unit.cached_value, hidden: unit.hidden,
    }));
    const last = items.at(-1)?.ordinal;
    return { items, nextCursor: result.rows.length > input.limit && last !== undefined
      ? `${last}.${cursorSignature(actor,id,last)}` : null };
  });
}

export async function streamArtifactOriginal(actor: CurrentSession, id: string, request: Request): Promise<Response> {
  if (request.headers.has("range")) throw new HttpFailure(400, "range_unsupported", "Range requests are unsupported");
  const row = await withTransaction(async (client) => {
    const found = await readableVersion(client, actor, id);
    readableContent(found);
    return found;
  });
  const path = await new LocalArtifactStore(parseArtifactStoreConfig(process.env)).readPath(row.object_key);
  const file = await open(path, "r");
  let position = 0;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await file.close(); } };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        await withTransaction(async (client) => {
          const current = await readableVersion(client, actor, id);
          readableContent(current);
          if (current.object_key !== row.object_key || current.lifecycle_generation !== row.lifecycle_generation) {
            throw hiddenRecord();
          }
        });
        const buffer = Buffer.allocUnsafe(Math.min(65_536, Number(row.actual_size_bytes) - position));
        if (!buffer.length) { await close(); controller.close(); return; }
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        if (!bytesRead) { await close(); controller.close(); return; }
        position += bytesRead;
        controller.enqueue(buffer.subarray(0,bytesRead));
      } catch (error) { await close(); controller.error(error); }
    },
    async cancel() { await close(); },
  });
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    "Content-Length": row.actual_size_bytes });
  return new Response(stream, { status: 200, headers });
}
