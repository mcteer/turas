import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { DEMO_IDS } from "../bootstrap-ids";
import { requireStaffingEnvironment } from "./repository";

export type StaffingActor = CurrentSession;
export type StaffingCapability = "operational" | "manager" | "finance";

export function requireStaffingCapability(actor: StaffingActor, capability: StaffingCapability): void {
  if (actor.kind !== "internal" || (capability !== "operational" &&
      (actor.principalId !== DEMO_IDS.mcteer || actor.role !== "admin"))) {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
}

/** Live actor SHARE locks follow 003/006 membership→principal→session→workspace order.
 * Caller DTOs are never authority; current database rows must match them. */
export async function lockStaffingActor(client: PoolClient, actor: StaffingActor,
  capability: StaffingCapability,
  options: { customerId?: string; write?: boolean; allowDisabled?: boolean } = {}): Promise<void> {
  await client.query("SET LOCAL lock_timeout='3000ms'");
  await client.query("SET LOCAL statement_timeout='5000ms'");
  const member = (await client.query<{ principal_id: string; workspace_id: string;
    kind: string; role: string; active: boolean }>(`SELECT principal_id,workspace_id,kind,role,active
      FROM memberships WHERE id=$1 FOR SHARE`, [actor.membershipId])).rows[0];
  if (!member?.active || member.principal_id !== actor.principalId ||
      member.workspace_id !== actor.workspaceId || member.kind !== actor.kind || member.role !== actor.role) {
    throw new HttpFailure(401, "authentication_required", "Sign in again");
  }
  const principal = (await client.query<{ active: boolean }>(
    "SELECT active FROM principals WHERE id=$1 FOR SHARE", [actor.principalId])).rows[0];
  const session = (await client.query<{ revoked_at: Date | null; expires_at: Date }>(
    "SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1 AND principal_id=$2 FOR SHARE",
    [actor.sessionId, actor.principalId])).rows[0];
  const workspace = (await client.query<{ active: boolean }>(
    "SELECT active FROM workspaces WHERE id=$1 FOR SHARE", [actor.workspaceId])).rows[0];
  if (!principal?.active || !session || session.revoked_at || session.expires_at.getTime() <= Date.now() ||
      !workspace?.active) throw new HttpFailure(401, "authentication_required", "Sign in again");
  requireStaffingCapability(actor, capability);
  await requireStaffingEnvironment(client, Boolean(options.write && !options.allowDisabled));
  if (options.customerId) {
    const customer = await client.query(`SELECT customer_id FROM customer_profile_state
      WHERE customer_id=$1 AND workspace_id=$2 FOR SHARE`, [options.customerId, actor.workspaceId]);
    if (customer.rowCount !== 1) throw hiddenRecord();
  }
}
