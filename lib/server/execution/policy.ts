import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { lockProfileActor } from "../profiles/policy";
import { DEMO_IDS } from "../bootstrap-ids";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { requireExecutionEnvironment } from "./repository";

export type ExecutionActor = CurrentSession;
export type ExecutionCapability = "read" | "contribute" | "setup" | "review" | "advice" | "utilization";
export function isExecutionReviewer(actor: ExecutionActor): boolean {
  return actor.kind === "internal" && actor.role === "admin" && actor.principalId === DEMO_IDS.mcteer;
}
export function requireExecutionCapability(actor: ExecutionActor, capability: ExecutionCapability): void {
  if ((["review", "utilization"].includes(capability) && !isExecutionReviewer(actor)) ||
    (["setup", "advice"].includes(capability) && actor.kind !== "internal"))
    throw new HttpFailure(403, "forbidden", "Action not allowed");
}
/** Reuses the live membership→principal→session→workspace→customer/grant prefix.
 * Contributor access deliberately includes currently granted partners. */
export async function lockExecutionActor(db: PoolClient, actor: ExecutionActor, customerId: string,
  capability: ExecutionCapability, write = false, affectedMembershipId?: string): Promise<void> {
  await lockProfileActor(db, actor, customerId, affectedMembershipId, true);
  requireExecutionCapability(actor, capability);
  await requireExecutionEnvironment(db, write);
}
export async function requireExecutionSubject(db: PoolClient, actor: ExecutionActor, resourceId: string,
  options: { onBehalf?: boolean; customerId: string; serviceDate?: string }): Promise<{ membershipId: string | null; active: boolean; kind: string }> {
  const resource = (await db.query<{ membership_id: string | null; active: boolean; kind: string;
    partner_organization_id: string | null }>(`SELECT membership_id,active,kind,partner_organization_id FROM workforce_resources
    WHERE id=$1 AND workspace_id=$2 AND environment_id=$3 FOR SHARE`,
    [resourceId, actor.workspaceId, process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if (!resource) throw hiddenRecord();
  if (options.onBehalf && isExecutionReviewer(actor)) return { membershipId: resource.membership_id, active: resource.active, kind: resource.kind };
  if (!resource.active || resource.membership_id !== actor.membershipId) throw new HttpFailure(403, "forbidden", "Subject access unavailable");
  if (actor.kind === "partner") {
    const membership = (await db.query<{ partner_org_id: string | null }>("SELECT partner_org_id FROM memberships WHERE id=$1 AND workspace_id=$2", [actor.membershipId, actor.workspaceId])).rows[0];
    if (resource.kind !== "partner" || !membership?.partner_org_id || membership.partner_org_id !== resource.partner_organization_id) throw hiddenRecord();
    const eligible = await db.query(`SELECT 1 FROM workforce_partner_eligibility e WHERE e.id=(SELECT id FROM workforce_partner_eligibility
      WHERE resource_id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4
        AND from_date<=$5::date AND to_date>=$5::date ORDER BY revision_number DESC LIMIT 1) AND e.state='active' `,
      [resourceId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, options.customerId, options.serviceDate ?? new Date().toISOString().slice(0,10)]);
    if (!eligible.rowCount) throw hiddenRecord();
  }
  return { membershipId: resource.membership_id, active: resource.active, kind: resource.kind };
}
