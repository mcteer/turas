import type { PoolClient } from "pg";
import type { ProfileActor } from "./policy";
import { getServerConfig } from "../config";
import { HttpFailure } from "../../contracts/http";
import { readExecutionOverviewSnapshot } from "../execution/service";

/** Called only after profile scope admission. Counts only audience-visible
 * execution with its original plan/source eligibility rechecked by the domain. */
export async function profileDeliverySummary(db: PoolClient, actor: ProfileActor, customerId: string,
  workloadId: string | undefined, allowInternal: boolean, customerWideOnly = false) {
  const marker = (await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1', [getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!marker || marker.schema_version < 38 || process.env.TURAS_008_DISABLED === '1') return { state: 'unavailable' as const, activeCount: null };
  const engagements = (await db.query<{ id: string }>(`SELECT id FROM engagements WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
    AND ($4::uuid IS NULL OR workload_id IS NULL OR workload_id=$4) AND ($5::boolean OR audience='delivery')
    AND (NOT $6::boolean OR workload_id IS NULL) AND active_baseline_id IS NOT NULL ORDER BY id LIMIT 101`, [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, workloadId ?? null, allowInternal, customerWideOnly])).rows;
  if (engagements.length > 100) return { state: 'unavailable' as const, activeCount: null };
  let activeCount = 0, reviewRequired = false;
  for (const engagement of engagements) {
    try {
      const overview = await readExecutionOverviewSnapshot(db, actor, engagement.id, customerId,true);
      if (overview.state === 'active') activeCount++;
      else if (overview.state === 'review_required') reviewRequired = true;
    } catch (error) {
      if (!(error instanceof HttpFailure) || ![404, 409].includes(error.status)) throw error;
      reviewRequired = true;
    }
  }
  return { state: reviewRequired ? 'review_required' as const : 'ready' as const, activeCount };
}
