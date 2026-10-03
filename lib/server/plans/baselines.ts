import { enqueueExecutionSourceInvalidation } from "../execution/invalidation";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { hiddenRecord } from "../../contracts/http";
import type { PlanScope } from "./policy";

export type BaselineTarget={engagementId:string;baselineId:string;
  baselineNumber:number};

/** Allocate the canonical engagement and its next immutable baseline under the plan lock. */
export async function prepareBaseline(client:PoolClient,plan:PlanScope,
  requestedEngagementId:string|undefined):Promise<BaselineTarget> {
  const existing=await client.query<{id:string}>(
    "SELECT id FROM engagements WHERE plan_id=$1 FOR UPDATE",[plan.id]);
  let engagementId:string;
  let baselineNumber=1;
  if (existing.rows[0]) {
    engagementId=existing.rows[0].id;
    if (requestedEngagementId && requestedEngagementId!==engagementId) throw hiddenRecord();
    const next=await client.query<{number:string}>(
      "SELECT COALESCE(MAX(baseline_number),0)+1 AS number FROM milestone_baselines WHERE engagement_id=$1",
      [engagementId]);
    baselineNumber=Number(next.rows[0].number);
  } else {
    if (requestedEngagementId) throw hiddenRecord();
    engagementId=randomUUID();
    await client.query(`INSERT INTO engagements
      (id,environment_id,workspace_id,customer_id,workload_id,audience,plan_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [engagementId,plan.environment_id,plan.workspace_id,plan.customer_id,
      plan.workload_id,plan.audience,plan.id]);
  }
  return {engagementId,baselineId:randomUUID(),baselineNumber};
}

export async function persistBaseline(client:PoolClient,plan:PlanScope,
  target:BaselineTarget,revisionId:string,contentDigest:string,decisionId:string,
  content:Record<string,unknown>):Promise<void> {
  const milestoneContent={milestones:content.milestones ?? [],
    workPackages:content.workPackages ?? [],asOf:content.asOf ?? null};
  await client.query(`INSERT INTO milestone_baselines
    (id,environment_id,workspace_id,customer_id,engagement_id,plan_id,
     revision_id,baseline_number,content_digest,decision_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [target.baselineId,plan.environment_id,plan.workspace_id,plan.customer_id,
    target.engagementId,plan.id,revisionId,target.baselineNumber,
    contentDigest,decisionId]);
  await client.query(`INSERT INTO milestone_baseline_payloads(baseline_id,content)
    VALUES($1,$2)`,[target.baselineId,JSON.stringify(milestoneContent)]);
  const old=(await client.query("SELECT active_baseline_id FROM engagements WHERE id=$1",[target.engagementId])).rows[0]?.active_baseline_id;
  await client.query(`UPDATE engagements SET active_baseline_id=$2,updated_at=now()
    WHERE id=$1`,[target.engagementId,target.baselineId]);
  if(old)await enqueueExecutionSourceInvalidation(client,"milestone_baseline",old);
}
