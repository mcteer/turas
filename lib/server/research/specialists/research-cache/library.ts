import { z } from "zod";
import type { AppIdentity } from "../identity";
import { loadResearchContext } from "../solution-research/context";
import { sourceSchema } from "../solution-research/schema";
import { verifiedPublicationDate } from "../solution-research/source-integrity";
import { evidenceDatabase } from "./database";

export async function sourceLibrary(identity: AppIdentity, accountId: string, signal: AbortSignal, offset = 0) {
  await loadResearchContext(identity, accountId, signal);
  const sql = await evidenceDatabase();
  const rows = await sql.query(`SELECT s.id,s.source,s.truncated,s.checked_at,s.refresh_after,s.index_state,
      array_agg(DISTINCT CASE WHEN a.owner_user_id=$3 THEN a.workload ELSE 'Public source' END
        ORDER BY CASE WHEN a.owner_user_id=$3 THEN a.workload ELSE 'Public source' END) AS workloads
    FROM turas_evidence_snapshots s JOIN turas_evidence_accounts a
      ON a.environment_id=s.environment_id AND a.workspace_id=s.workspace_id AND a.snapshot_id=s.id
    WHERE a.environment_id=$1 AND a.workspace_id=$2 AND (a.owner_user_id=$3 OR a.visibility='public') AND a.account_id=$4
      AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots n WHERE n.environment_id=s.environment_id AND n.workspace_id=s.workspace_id
        AND n.fetch_key=s.fetch_key AND n.checked_at>s.checked_at)
    GROUP BY s.environment_id,s.workspace_id,s.id ORDER BY s.checked_at DESC,s.id LIMIT 21 OFFSET $5`,
    [identity.environmentId, identity.workspaceId, identity.userId, accountId, offset]);
  signal.throwIfAborted();
  const sources = z.array(z.object({ id: z.string(), source: sourceSchema, truncated: z.boolean(), checked_at: z.coerce.date(),
    refresh_after: z.coerce.date(), index_state: z.string(), workloads: z.array(z.string()) })).parse(rows);
  return { more: sources.length > 20, sources: sources.slice(0, 20).map(row => ({ id: row.id, url: row.source.url, title: row.source.title,
    publishedAt: verifiedPublicationDate(row.source), checkedAt: row.checked_at.toISOString(), refreshAfter: row.refresh_after.toISOString(),
    refreshDue: row.refresh_after.getTime() <= Date.now(), truncated: row.truncated, indexState: row.index_state, workloads: row.workloads })) };
}
