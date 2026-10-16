import { z } from "zod";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { withTransaction } from "../db/client";
import { lockWorkspaceActor, type ProfileActor } from "./policy";

export const workspaceReviewQuery = z.object({
  countOnly: z.enum(["true", "false"]).optional(),
  includeDenied: z.enum(["true", "false"]).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();

/** Workspace discovery only; exact decisions still use the canonical customer command. */
export async function listWorkspaceReview(actor: ProfileActor, input: unknown, existingClient?: PoolClient) {
  const parsed = workspaceReviewQuery.safeParse(input);
  if (!parsed.success) throw new HttpFailure(422, "invalid_query", "Invalid review query");
  if (actor.kind !== "internal") throw new HttpFailure(403, "forbidden", "Internal review access required");
  const options = parsed.data;
  const run = async (client: PoolClient) => {
    await lockWorkspaceActor(client, actor, undefined, true);
    // Review authority is evaluated for every customer, including the count.
    const filter = `v.workspace_id=$1
      AND NOT EXISTS (SELECT 1 FROM profile_revisions newer
        WHERE newer.record_id=v.record_id AND newer.revision_number>v.revision_number)
      AND ($2::boolean OR EXISTS (SELECT 1 FROM customer_stewards s
        WHERE s.customer_id=v.customer_id AND s.membership_id=$3 AND s.active))
      AND (d.revision_id IS NULL OR ($4::boolean AND d.decision='reject'))`;
    const values = [actor.workspaceId, actor.role === "admin", actor.membershipId,
      options.includeDenied === "true"];
    const total = await client.query<{ total: string }>(`SELECT count(*) AS total
      FROM profile_revisions v LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE ${filter}`, values);
    const count = Number(total.rows[0]?.total ?? 0);
    if (options.countOnly === "true") return { total: count };
    const rows = await client.query<{
      id: string; customer_id: string; display_name: string; record_id: string;
      kind: string; title: string | null; created_at: Date; decision: string | null;
    }>(`SELECT v.id,v.customer_id,c.display_name,v.record_id,r.kind,
      coalesce(v.payload->>'title',v.payload->>'text',v.payload->>'name') AS title,
      v.created_at,d.decision
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
      JOIN customer_references c ON c.id=v.customer_id AND c.workspace_id=v.workspace_id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE ${filter} ORDER BY v.created_at DESC,v.id DESC LIMIT 21 OFFSET $5`,
    [...values, options.offset]);
    return { total: count, items: rows.rows.slice(0,20).map(row => ({
      id: row.id, customerId: row.customer_id, customerName: row.display_name,
      recordId: row.record_id, kind: row.kind, title: row.title,
      state: row.decision === "reject" ? "denied" : "pending",
      createdAt: row.created_at.toISOString(),
    })), nextOffset: rows.rows.length > 20 ? options.offset + 20 : null };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
