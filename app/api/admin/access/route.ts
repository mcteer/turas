import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { z } from "zod";
import { requireAdminSession } from "../../../../lib/server/access/admin-guard";
import { query } from "../../../../lib/server/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAdminSession(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "25");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new HttpFailure(422, "invalid_input", "Invalid request");
    }
    let cursor: { name: string; id: string } | null = null;
    if (url.searchParams.has("cursor")) {
      try {
        const value = JSON.parse(Buffer.from(url.searchParams.get("cursor") ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
        const id = z.uuid().safeParse(value.id);
        if (typeof value.name !== "string" || !id.success) throw new Error();
        cursor = { name: value.name, id: id.data };
      } catch { throw new HttpFailure(422, "invalid_cursor", "Invalid cursor"); }
    }
    const principals = await query<{
      id: string; login_name: string; display_name: string; active: boolean;
      membership_id: string; kind: string; role: string; membership_active: boolean;
      revision: string; partner_org_id: string | null;
    }>(`
      SELECT p.id, p.login_name, p.display_name, p.active,
             m.id AS membership_id, m.kind, m.role, m.active AS membership_active,
             m.revision, m.partner_org_id
      FROM memberships m JOIN principals p ON p.id = m.principal_id
      WHERE m.workspace_id = $1
        AND ($2::text IS NULL OR (p.login_name, p.id) > ($2::text, $3::uuid))
      ORDER BY p.login_name, p.id LIMIT $4
    `, [session.workspaceId, cursor?.name ?? null, cursor?.id ?? null, limit + 1]);
    const accountRows = principals.rows.slice(0, limit);
    const last = accountRows.at(-1);
    const grants = await query<{
      membership_id: string; customer_id: string; state: string; revision: string;
    }>(`
      SELECT membership_id, customer_id, state, revision FROM customer_grants
      WHERE workspace_id = $1 AND membership_id = ANY($2::uuid[])
      ORDER BY membership_id, customer_id
    `, [session.workspaceId, accountRows.map((row) => row.membership_id)]);
    return success({
      accounts: accountRows.map((row) => ({
        id: row.id, loginName: row.login_name, displayName: row.display_name,
        active: row.active, membership: { id: row.membership_id, kind: row.kind,
          role: row.role, active: row.membership_active, revision: Number(row.revision),
          partnerOrganizationId: row.partner_org_id },
      })),
      grants: grants.rows.map((row) => ({ membershipId: row.membership_id,
        customerId: row.customer_id, state: row.state, revision: Number(row.revision) })),
      nextCursor: principals.rows.length > limit && last
        ? Buffer.from(JSON.stringify({ name: last.login_name, id: last.id })).toString("base64url")
        : null,
    });
  } catch (error) {
    return failure(error);
  }
}
