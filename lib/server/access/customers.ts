import { HttpFailure } from "../../contracts/http";
import { z } from "zod";
import type { CurrentSession } from "../auth/sessions";
import { query } from "../db/client";

type CustomerRow = { id: string; display_name: string; synthetic: boolean };

export function projectCustomerReference(row: CustomerRow): { id: string; displayName: string; synthetic: boolean } {
  return { id: row.id, displayName: row.display_name, synthetic: row.synthetic };
}

function decodeCursor(raw: string | null): { name: string; id: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!value || typeof value !== "object") throw new Error("invalid");
    const cursor = value as Record<string, unknown>;
    const id = z.uuid().safeParse(cursor.id);
    if (typeof cursor.name !== "string" || !id.success) throw new Error("invalid");
    return { name: cursor.name, id: id.data };
  } catch {
    throw new HttpFailure(422, "invalid_cursor", "Invalid cursor");
  }
}

export async function listCustomers(
  session: CurrentSession,
  limit: number,
  cursorRaw: string | null,
): Promise<{ items: ReturnType<typeof projectCustomerReference>[]; nextCursor: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HttpFailure(422, "invalid_limit", "Invalid page size");
  }
  const cursor = decodeCursor(cursorRaw);
  const result = await query<CustomerRow>(`
    SELECT c.id, c.display_name, c.synthetic
    FROM customer_references c
    WHERE c.workspace_id = $1
      AND ($2::text = 'internal' OR EXISTS (
        SELECT 1 FROM customer_grants g WHERE g.customer_id = c.id
          AND g.membership_id = $3 AND g.state = 'active'
      ))
      AND ($4::text IS NULL OR (c.display_name, c.id) > ($4::text, $5::uuid))
    ORDER BY c.display_name, c.id LIMIT $6
  `, [session.workspaceId, session.kind, session.membershipId,
    cursor?.name ?? null, cursor?.id ?? null, limit + 1]);
  const page = result.rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(projectCustomerReference),
    nextCursor: result.rows.length > limit && last
      ? Buffer.from(JSON.stringify({ name: last.display_name, id: last.id })).toString("base64url")
      : null,
  };
}
