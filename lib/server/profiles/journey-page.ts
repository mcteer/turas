import { withTransaction } from "../db/client";
import type { ProfileActor } from "./policy";
import { listProfileRecords } from "./read";
import { contextSchema } from "../../contracts/customer-journey";
import type { PoolClient } from "pg";

export async function readJourneyPage(actor: ProfileActor, customerId: string,
  input: { query?: string; cursor?: string }, existingClient?: PoolClient) {
  const run = async (client: PoolClient) => {
    const page = await listProfileRecords(actor, customerId,
      { ...input, kind: "claim", limit: 20 }, client, true);
    const records = page.items.flatMap(item => {
      const payload = item.payload as Record<string, unknown>;
      const parsed = contextSchema.safeParse(payload.legacyJourney);
      return parsed.success ? [{ ...item, id: String(item.id), recordId: String(item.recordId), context: parsed.data }] : [];
    });
    const ids = records.map(item => String(item.recordId));
    const versions = ids.length ? await client.query<{
      id: string; version: string; current_accepted_revision_id: string | null;
    }>(`SELECT id,version,current_accepted_revision_id FROM profile_records
      WHERE workspace_id=$1 AND customer_id=$2 AND id=ANY($3::uuid[])`,
    [actor.workspaceId, customerId, ids]) : null;
    const heads = new Map(versions?.rows.map(row => [row.id, row]) ?? []);
    return { items: records.map(item => ({ ...item,
      recordVersion: Number(heads.get(String(item.recordId))?.version),
      currentAcceptedRevisionId: heads.get(String(item.recordId))?.current_accepted_revision_id ?? null,
    })), nextCursor: page.nextCursor };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
