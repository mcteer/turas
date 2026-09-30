import type { PoolClient } from "pg";
import { hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { PlanActor,PlanScope } from "./policy";

export async function loadPlan(client:PoolClient,actor:PlanActor,planId:string,
  lock=false):Promise<PlanScope> {
  const found = await client.query<PlanScope>(`SELECT id,environment_id,workspace_id,
    customer_id,workload_id,audience,owner_membership_id,created_by_membership_id,
    aggregate_version,working_revision_id,accepted_revision_id,engagement_id
    FROM delivery_plans WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    ${lock ? "FOR UPDATE" : ""}`,
  [planId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
  if (!found.rows[0]) throw hiddenRecord();
  return found.rows[0];
}

export async function latestPlanRevision(client:PoolClient,planId:string,revisionId:string) {
  const result = await client.query<{id:string;plan_id:string;revision_number:string;
    author_membership_id:string;content_digest:string;origin:string;as_of:Date;created_at:Date}>(
    `SELECT id,plan_id,revision_number,author_membership_id,content_digest,origin,
      as_of,created_at
      FROM plan_revisions WHERE id=$1 AND plan_id=$2`,[revisionId,planId]);
  if (!result.rows[0]) throw hiddenRecord();
  return result.rows[0];
}
