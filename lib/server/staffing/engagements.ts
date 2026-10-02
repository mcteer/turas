import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { parseStaffing } from "./commands";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { readPlan } from "../plans/read";
import { planDraftContentSchema } from "../../contracts/plan-content";

/** Minimal accepted-baseline choices for the demand editor. Original source
 * eligibility is checked by the governed plan domain before names are released. */
export async function readStaffingEngagement(actor: StaffingActor, rawCustomer: unknown, rawEngagement: unknown, client?: PoolClient) {
  const customerId = parseStaffing(staffingIdSchema, rawCustomer), engagementId = parseStaffing(staffingIdSchema, rawEngagement);
  const run = async (db: PoolClient) => {
    await lockStaffingActor(db, actor, "operational", { customerId });
    const prior = (await db.query(`SELECT e.plan_id,e.workload_id,e.active_baseline_id,b.revision_id,b.content_digest
      FROM engagements e JOIN milestone_baselines b ON b.id=e.active_baseline_id AND b.engagement_id=e.id
      WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 AND e.customer_id=$4`,
      [engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId])).rows[0];
    if (!prior) throw hiddenRecord();
    await db.query(`SELECT id FROM delivery_plans WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE`,
      [prior.plan_id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
    const plan = await readPlan(actor, prior.plan_id, prior.revision_id, db);
    const locked = (await db.query(`SELECT active_baseline_id FROM engagements WHERE id=$1 AND environment_id=$2
      AND workspace_id=$3 AND customer_id=$4 FOR SHARE`, [engagementId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId])).rows[0];
    if (!locked || locked.active_baseline_id !== prior.active_baseline_id || plan.acceptedRevisionId !== prior.revision_id ||
      plan.contentDigest !== prior.content_digest) throw new HttpFailure(409, "baseline_changed", "Accepted baseline changed; reload");
    const available = plan.content && ["readable", "historical_warning"].includes(plan.contentAvailability);
    // Accepted revisions may retain evidence and decision sections that the
    // plan reader intentionally removes before checking editable plan content.
    const stored = available ? plan.content as Record<string, unknown> : null;
    const editable = stored ? { ...stored, sections: Array.isArray(stored.sections)
      ? stored.sections.filter(item => typeof item === "object" && item !== null &&
        !["evidence", "decision"].includes((item as { key?: string }).key ?? "")) : [] } : null;
    const content = editable ? parseStaffing(planDraftContentSchema, editable) : null;
    return { customerId, engagementId, workloadId: prior.workload_id as string | null, planId: prior.plan_id as string,
      baselineId: prior.active_baseline_id as string, planRevisionId: prior.revision_id as string,
      baselineDigest: prior.content_digest as string, contentAvailability: plan.contentAvailability,
      reviewRequired: plan.reviewRequired || !available, title: content?.title ?? null,
      workPackages: content ? content.workPackages.map(work => ({ key: work.key, title: work.title, ownerRole: work.ownerRole })) : [] };
  };
  return client ? run(client) : withTransaction(run);
}
export type StaffingEngagement = Awaited<ReturnType<typeof readStaffingEngagement>>;
