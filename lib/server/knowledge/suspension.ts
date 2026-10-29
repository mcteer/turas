import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { knowledgeLineageIsCurrent } from "../profiles/eligibility";
import { enqueueRetrievalJob } from "../retrieval/jobs";
import { enqueuePlanCleanupForSource } from "../plans/cleanup";

// A sweep must advance past healthy publications. Otherwise the oldest 100
// permanently hide every later publication from maintenance.
let lastSweptPublicationId: string | null = null;

/** Persist suspension after the synchronous lineage read fence has taken effect. */
export async function suspendStaleKnowledge(existingClient?: PoolClient): Promise<number> {
  const run = async (client: PoolClient) => {
    const ready = await client.query<{ schema_version: number }>(
      `SELECT schema_version FROM turas_environment WHERE environment_id=$1`,
      [getServerConfig().TURAS_ENVIRONMENT_ID]);
    if ((ready.rows[0]?.schema_version ?? 0) < 26) return 0;
    const durableSweep = Number(ready.rows[0]?.schema_version) >= 57;
    const rows = await client.query<{ id: string; revision_id: string;
      author_membership_id: string; customer_id: string; workspace_id: string }>(`
      SELECT p.id,p.revision_id,c.author_membership_id,c.customer_id,c.workspace_id
      FROM knowledge_publications p JOIN knowledge_contributions c ON c.id=p.contribution_id
      WHERE p.environment_id=$1 AND p.state='published'
        ${durableSweep ? "AND (p.last_maintenance_checked_at IS NULL OR p.last_maintenance_checked_at<=clock_timestamp()-interval '1 minute')" : 'AND ($2::uuid IS NULL OR p.id>$2::uuid)'}
      ORDER BY ${durableSweep ? 'p.last_maintenance_checked_at NULLS FIRST,p.published_at,p.id' : 'p.id'} LIMIT 100 FOR UPDATE OF p SKIP LOCKED`,
    durableSweep ? [getServerConfig().TURAS_ENVIRONMENT_ID] : [getServerConfig().TURAS_ENVIRONMENT_ID,lastSweptPublicationId]);
    if (!rows.rowCount) {
      lastSweptPublicationId = null;
      return 0;
    }
    let suspended = 0;
    for (const row of rows.rows) {
      const current = await knowledgeLineageIsCurrent(client,row.revision_id);
      if (durableSweep) await client.query('UPDATE knowledge_publications SET last_maintenance_checked_at=clock_timestamp() WHERE id=$1',[row.id]);
      if (current) continue;
      await client.query(`UPDATE knowledge_publications SET state='suspended',
        head_generation=head_generation+1,updated_at=now() WHERE id=$1 AND state='published'`,
      [row.id]);
      const projections = await client.query<{ id: string }>(`
        UPDATE retrieval_sources SET lifecycle_state='retired',updated_at=now()
        WHERE environment_id=$1 AND source_kind='published_shared'
          AND source_revision_id=$2 AND lifecycle_state='current' RETURNING id`,
      [getServerConfig().TURAS_ENVIRONMENT_ID,row.revision_id]);
      for (const projection of projections.rows) {
        await enqueueRetrievalJob(client,projection.id,"cleanup");
      }
      await enqueuePlanCleanupForSource(client,"shared_knowledge",row.revision_id);
      suspended += 1;
    }
    lastSweptPublicationId = rows.rows[rows.rows.length-1].id;
    return suspended;
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
