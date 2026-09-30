import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { lockProfileActor } from "../profiles/policy";

export type PlanActor = CurrentSession;
export type PlanScope = {id:string;environment_id:string;workspace_id:string;
  customer_id:string;workload_id:string|null;audience:"internal"|"delivery";
  owner_membership_id:string;created_by_membership_id:string;
  aggregate_version:string;working_revision_id:string|null;
  accepted_revision_id:string|null;engagement_id:string|null};
export type PlanCapability = "read"|"create"|"revise"|"submit"|"review"|"draft";

export async function requirePlanEnvironment(client:PoolClient,write:boolean):Promise<void> {
  const marker = await client.query<{environment_id:string;schema_version:number}>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rowCount !== 1 ||
      marker.rows[0].environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 31) {
    throw new HttpFailure(503,"plans_unavailable","Delivery plans unavailable");
  }
  if (write && process.env.TURAS_006_DISABLED === "1") {
    throw new HttpFailure(503,"plans_disabled","Delivery plan changes are temporarily unavailable");
  }
}

export async function requireActivePlanWorkload(client:PoolClient,actor:PlanActor,
  customerId:string,workloadId:string|null):Promise<void> {
  if (!workloadId) return;
  const workload = await client.query(`SELECT 1 FROM customer_workloads workload
    JOIN profile_records record ON record.workload_id=workload.id
      AND record.workspace_id=workload.workspace_id AND record.customer_id=workload.customer_id
      AND record.kind='workload_details' AND record.current_accepted_revision_id IS NOT NULL
    WHERE workload.id=$1 AND workload.customer_id=$2 AND workload.workspace_id=$3
      AND workload.lifecycle='active' FOR UPDATE OF workload`,
  [workloadId,customerId,actor.workspaceId]);
  if (!workload.rowCount) throw hiddenRecord();
}

export async function requireEligiblePlanOwner(client:PoolClient,actor:PlanActor,
  customerId:string,ownerMembershipId:string):Promise<void> {
  const owner = await client.query<{kind:string;active:boolean;principal_active:boolean;
    grant_active:boolean;org_active:boolean}>(`SELECT member.kind,member.active,
    principal.active AS principal_active,
    EXISTS(SELECT 1 FROM customer_grants grant_record WHERE
      grant_record.customer_id=$2 AND grant_record.membership_id=member.id
      AND grant_record.state='active') AS grant_active,
    COALESCE(organization.active,false) AS org_active
    FROM memberships member JOIN principals principal ON principal.id=member.principal_id
    LEFT JOIN partner_organizations organization ON organization.id=member.partner_org_id
    WHERE member.id=$1 AND member.workspace_id=$3 FOR UPDATE OF member,principal`,
  [ownerMembershipId,customerId,actor.workspaceId]);
  const row = owner.rows[0];
  if (!row?.active || !row.principal_active ||
      (row.kind === "partner" && (!row.grant_active || !row.org_active))) {
    throw hiddenRecord();
  }
}

export async function lockPlanActor(client:PoolClient,actor:PlanActor,
  customerId:string,write:boolean,ownerMembershipId?:string,
  shareActorRows=false):Promise<void> {
  await lockProfileActor(client,actor,customerId,ownerMembershipId,
    !write || shareActorRows);
  await requirePlanEnvironment(client,write);
  if (ownerMembershipId) await requireEligiblePlanOwner(client,actor,customerId,ownerMembershipId);
}

export function requirePlanCapability(actor:PlanActor,plan:PlanScope|null,
  capability:PlanCapability):void {
  if (capability === "create") return;
  if (!plan || plan.workspace_id !== actor.workspaceId ||
      plan.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID) throw hiddenRecord();
  if (actor.kind === "partner") {
    if (plan.audience !== "delivery") throw hiddenRecord();
    if (capability === "review") throw new HttpFailure(403,"forbidden","Action not allowed");
    if (capability !== "read" && plan.created_by_membership_id !== actor.membershipId) {
      throw hiddenRecord();
    }
  }
  if (capability === "review" && (actor.kind !== "internal" || actor.role !== "admin")) {
    throw new HttpFailure(403,"forbidden","Action not allowed");
  }
}

export function requireCreateAudience(actor:PlanActor,audience:"internal"|"delivery"):void {
  if (actor.kind === "partner" && audience !== "delivery") throw hiddenRecord();
}
