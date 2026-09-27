import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { z } from "zod";
import { requireAdminSession } from "../../../../lib/server/access/admin-guard";
import { query } from "../../../../lib/server/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAdminSession(request);
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "25");
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
      throw new HttpFailure(422, "invalid_input", "Invalid request");
    }
    let cursor: { at: string; id: string } | null = null;
    if (url.searchParams.has("cursor")) {
      try {
        const value = JSON.parse(Buffer.from(url.searchParams.get("cursor") ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
        const id = z.uuid().safeParse(value.id);
        if (typeof value.at !== "string" || Number.isNaN(Date.parse(value.at)) || !id.success) throw new Error();
        cursor = { at: value.at, id: id.data };
      } catch { throw new HttpFailure(422, "invalid_cursor", "Invalid cursor"); }
    }
    const result = await query<{
      id: string; actor_principal_id: string | null; actor_session_id: string | null;
      customer_id: string | null; subject_id: string | null; action: string;
      outcome: string; correlation_id: string; created_at: Date;
    }>(`
      SELECT id, actor_principal_id, actor_session_id, customer_id, subject_id,
             action, outcome, correlation_id, created_at
      FROM access_audit WHERE workspace_id = $1
        AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
      ORDER BY created_at DESC, id DESC LIMIT $4
    `, [session.workspaceId, cursor?.at ?? null, cursor?.id ?? null, rawLimit + 1]);
    const page = result.rows.slice(0, rawLimit);
    const last = page.at(-1);
    return success({ items: page.map((row) => ({
      id: row.id, actorPrincipalId: row.actor_principal_id,
      actorSessionId: row.actor_session_id, customerId: row.customer_id,
      subjectId: row.subject_id, action: row.action, outcome: row.outcome,
      correlationId: row.correlation_id, createdAt: row.created_at.toISOString(),
    })), nextCursor: result.rows.length > rawLimit && last
      ? Buffer.from(JSON.stringify({ at: last.created_at.toISOString(), id: last.id })).toString("base64url")
      : null });
  } catch (error) {
    return failure(error);
  }
}
