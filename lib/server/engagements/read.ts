import type { PoolClient } from "pg";
import { z } from "zod";
import { hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import type { PlanActor } from "../plans/policy";
import { lockPlanActor } from "../plans/policy";
import { readPlan } from "../plans/read";

type Row={id:string;plan_id:string;customer_id:string;workload_id:string|null;
  audience:"internal"|"delivery";active_baseline_id:string|null;
  accepted_revision_id:string|null;created_at:Date};
export type EngagementDetail={contractVersion:"delivery-plan-v1";engagementId:string;
  planId:string;customerId:string;workloadId:string|null;
  audience:"internal"|"delivery";acceptedRevisionId:string;
  activeBaselineId:string;baselineNumber:number;contentAvailability:string;
  reviewRequired:boolean;title:string;milestones:unknown[]|null;
  workPackages:unknown[]|null;acceptedAt:string};

async function detail(client:PoolClient,actor:PlanActor,row:Row):Promise<EngagementDetail> {
  if (!row.active_baseline_id || !row.accepted_revision_id) throw hiddenRecord();
  const plan=await readPlan(actor,row.plan_id,row.accepted_revision_id,client);
  const baseline=await client.query<{baseline_number:string;accepted_at:Date;
    content:Record<string,unknown>|null}>(`SELECT baseline.baseline_number,baseline.accepted_at,
      payload.content FROM milestone_baselines baseline
      LEFT JOIN milestone_baseline_payloads payload ON payload.baseline_id=baseline.id
      WHERE baseline.id=$1 AND baseline.engagement_id=$2
        AND baseline.revision_id=$3`,
    [row.active_baseline_id,row.id,row.accepted_revision_id]);
  if (!baseline.rows[0]) throw hiddenRecord();
  const availability=["readable","historical_warning"].includes(plan.contentAvailability)
    && !baseline.rows[0].content
    ? "purged":plan.contentAvailability;
  const body=["readable","historical_warning"].includes(availability)
    ? baseline.rows[0].content:null;
  return {contractVersion:"delivery-plan-v1",engagementId:row.id,
    planId:row.plan_id,customerId:row.customer_id,workloadId:row.workload_id,
    audience:row.audience,acceptedRevisionId:row.accepted_revision_id,
    activeBaselineId:row.active_baseline_id,
    baselineNumber:Number(baseline.rows[0].baseline_number),
    contentAvailability:availability,reviewRequired:plan.reviewRequired || availability!=="readable",
    title:["readable","historical_warning"].includes(availability) ? plan.title:"Review required",
    milestones:body && Array.isArray(body.milestones)
      ? body.milestones:null,
    workPackages:body && Array.isArray(body.workPackages)
      ? body.workPackages:null,
    acceptedAt:baseline.rows[0].accepted_at.toISOString()};
}

export async function readEngagement(actor:PlanActor,id:string,
  existingClient?:PoolClient):Promise<EngagementDetail> {
  if (!z.uuid().safeParse(id).success) throw hiddenRecord();
  const run=async(client:PoolClient)=>{
    const found=await client.query<Row>(`SELECT engagement.id,engagement.plan_id,
      engagement.customer_id,engagement.workload_id,engagement.audience,
      engagement.active_baseline_id,plan.accepted_revision_id,engagement.created_at
      FROM engagements engagement JOIN delivery_plans plan ON plan.id=engagement.plan_id
      WHERE engagement.id=$1 AND engagement.environment_id=$2
        AND engagement.workspace_id=$3 AND plan.accepted_revision_id IS NOT NULL`,
    [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
    const row=found.rows[0];
    if (!row) throw hiddenRecord();
    await lockPlanActor(client,actor,row.customer_id,false);
    if (actor.kind==="partner" && row.audience!=="delivery") throw hiddenRecord();
    return detail(client,actor,row);
  };
  return existingClient ? run(existingClient):withTransaction(run);
}

export async function listEngagements(actor:PlanActor,customerId:string,
  workloadId:string|null=null,existingClient?:PoolClient):Promise<{
    items:EngagementDetail[]}> {
  const run=async(client:PoolClient)=>{
    await lockPlanActor(client,actor,customerId,false);
    const rows=await client.query<Row>(`SELECT engagement.id,engagement.plan_id,
      engagement.customer_id,engagement.workload_id,engagement.audience,
      engagement.active_baseline_id,plan.accepted_revision_id,engagement.created_at
      FROM engagements engagement JOIN delivery_plans plan ON plan.id=engagement.plan_id
      WHERE engagement.environment_id=$1 AND engagement.workspace_id=$2
        AND engagement.customer_id=$3 AND ($4::uuid IS NULL OR engagement.workload_id=$4)
        AND plan.accepted_revision_id IS NOT NULL
        AND ($5::boolean OR engagement.audience='delivery')
      ORDER BY engagement.created_at DESC,engagement.id DESC LIMIT 50`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,
      workloadId,actor.kind==="internal"]);
    const items:EngagementDetail[]=[];
    for (const row of rows.rows) items.push(await detail(client,actor,row));
    return {items};
  };
  return existingClient ? run(existingClient):withTransaction(run);
}
