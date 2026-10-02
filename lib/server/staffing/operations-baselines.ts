import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { planEvidenceSummarySchema } from "../../contracts/plan-content";
import { staffingDemandInputSchema } from "../../contracts/staffing-demands";
import { getServerConfig } from "../config";
import { lockPlanActor } from "../plans/policy";
import { assessPlanEvidence, currentPlanSourceDigest, lockPlanRevisionSourceHeaders } from "../plans/sources";
import type { StaffingActor } from "./policy";

/** Only this customer's immutable commitment identities are discovered.
 * Other customers contribute numeric capacity, never baseline narrative. */
export function selectOperationsCommitments(db: PoolClient, actor: StaffingActor, input: {
  customerId: string; fromDate: string; toDate: string;
}, resourceIds: string[]) {
  return db.query(`SELECT day.resource_id,day.service_date::text,day.allocation_id,day.revision_id,
    a.confirmed_revision_id,a.state AS allocation_state,v.demand_id,v.demand_revision_id,
    original.plan_id,original.plan_revision_id,original.baseline_id,original.baseline_digest,original.engagement_id,
    d.current_revision_id AS current_demand_revision,d.state AS demand_state
    FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id
    JOIN staffing_allocation_revisions v ON v.id=day.revision_id
    JOIN staffing_demand_revisions original ON original.id=v.demand_revision_id
    JOIN staffing_demands d ON d.id=v.demand_id
    WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3
      AND day.resource_id=ANY($4::uuid[]) AND day.service_date BETWEEN $5 AND $6
    ORDER BY day.resource_id,day.service_date,day.allocation_id`,
  [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.customerId, resourceIds, input.fromDate, input.toDate]);
}
export type OperationsCommitments = Awaited<ReturnType<typeof selectOperationsCommitments>>["rows"];

/** Actor -> all plans -> union of original sources -> engagements -> demands.
 * Must run before any workforce/resource/calendar/allocation/capacity locks. */
export async function lockOperationsBaselines(db: PoolClient, actor: StaffingActor, customerId: string,
  commitments: OperationsCommitments) {
  await lockPlanActor(db, actor, customerId, false);
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const unique = (key: string) => [...new Set(commitments.map(row => row[key] as string))].sort();
  const plans = (await db.query(`SELECT id,accepted_revision_id,workload_id,audience,engagement_id FROM delivery_plans
    WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND id=ANY($4::uuid[])
    ORDER BY id FOR SHARE`, [env, actor.workspaceId, customerId, unique("plan_id")])).rows;
  await lockPlanRevisionSourceHeaders(db, unique("plan_revision_id"));
  const eligible = new Map<string, boolean>();
  for (const revisionId of unique("plan_revision_id")) {
    const binding = commitments.find(row => row.plan_revision_id === revisionId)!;
    const plan = plans.find(row => row.id === binding.plan_id);
    let current = Boolean(plan && plan.accepted_revision_id === revisionId && plan.engagement_id === binding.engagement_id);
    if (current) {
      try {
        await currentPlanSourceDigest(db, actor, revisionId, customerId, plan!.workload_id, plan!.audience, true, true);
        // Read only the evidence summary after original-source eligibility, not
        // plan sections, source prose, private dependencies or decision notes.
        const payload = (await db.query(`SELECT jsonb_build_object('sourceDependencies',content->'sourceDependencies',
          'assertions',content->'assertions') AS summary FROM plan_revision_payloads WHERE revision_id=$1 FOR SHARE`, [revisionId])).rows[0];
        const summary = planEvidenceSummarySchema.safeParse(payload?.summary);
        if (!summary.success) current = false;
        else {
          const quality = await assessPlanEvidence(db, actor, customerId, summary.data);
          current = !quality.historicalWarning && quality.issues.length === 0;
        }
      } catch (error) {
        if (!(error instanceof HttpFailure) || ![404, 409].includes(error.status)) throw error;
        current = false;
      }
    }
    eligible.set(revisionId, current);
  }
  const engagements = (await db.query(`SELECT id,active_baseline_id FROM engagements WHERE environment_id=$1
    AND workspace_id=$2 AND customer_id=$3 AND id=ANY($4::uuid[]) ORDER BY id FOR SHARE`,
  [env, actor.workspaceId, customerId, unique("engagement_id")])).rows;
  await db.query(`SELECT id FROM staffing_demands WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
    AND id=ANY($4::uuid[]) ORDER BY id FOR SHARE`, [env, actor.workspaceId, customerId, unique("demand_id")]);
  const review = new Set(commitments.filter(row => !eligible.get(row.plan_revision_id) ||
    engagements.find(engagement => engagement.id === row.engagement_id)?.active_baseline_id !== row.baseline_id ||
    row.current_demand_revision !== row.demand_revision_id || row.demand_state !== "qualified" ||
    row.confirmed_revision_id !== row.revision_id || row.allocation_state !== "confirmed")
    .map(row => `${row.resource_id}/${row.service_date}`));
  const readable = commitments.filter(row => !review.has(`${row.resource_id}/${row.service_date}`));
  const payloads = (await db.query(`SELECT revision_id,content->'requiredSkills' AS requirements FROM staffing_demand_payloads
    WHERE revision_id=ANY($1::uuid[]) ORDER BY revision_id FOR SHARE`,
  [[...new Set(readable.map(row => row.demand_revision_id))].sort()])).rows;
  const requirements = new Map<string, { skillId: string; minimumLevel: number }[]>();
  for (const row of readable) {
    const key = `${row.resource_id}/${row.service_date}`;
    const parsed = staffingDemandInputSchema.shape.requiredSkills.safeParse(payloads.find(payload => payload.revision_id === row.demand_revision_id)?.requirements);
    if (!parsed.success) review.add(key);
    else requirements.set(key, [...(requirements.get(key) ?? []), ...parsed.data]);
  }
  return { review, requirements };
}
