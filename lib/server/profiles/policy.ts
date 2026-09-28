import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { requiredSchemaVersion } from "../db/readiness";

export type ProfileActor = CurrentSession;

export async function lockProfileActor(client: PoolClient, actor: ProfileActor, customerId: string, affectedMembershipId?: string): Promise<void> {
  await client.query("SET LOCAL lock_timeout = '3000ms'");
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const memberIds = [...new Set([actor.membershipId, affectedMembershipId].filter((id): id is string => Boolean(id)))].sort();
  const locked = new Map<string, { principal_id: string; workspace_id: string; kind: string; role: string; active: boolean; partner_org_id: string | null }>();
  for (const id of memberIds) {
    const found = await client.query<{ principal_id: string; workspace_id: string; kind: string; role: string; active: boolean; partner_org_id: string | null }>(
      "SELECT principal_id,workspace_id,kind,role,active,partner_org_id FROM memberships WHERE id=$1 FOR UPDATE", [id]);
    if (found.rows[0]) locked.set(id, found.rows[0]);
  }
  const m = locked.get(actor.membershipId);
  if (!m || !m.active || m.principal_id !== actor.principalId || m.workspace_id !== actor.workspaceId ||
      m.kind !== actor.kind || m.role !== actor.role) throw new HttpFailure(401, "unauthorized", "Sign in again");
  const principal = await client.query<{ active: boolean }>("SELECT active FROM principals WHERE id=$1 FOR UPDATE", [actor.principalId]);
  const session = await client.query<{ revoked_at: Date | null; expires_at: Date }>(
    "SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1 AND principal_id=$2 FOR UPDATE",
    [actor.sessionId, actor.principalId]);
  const workspace = await client.query<{ active: boolean }>("SELECT active FROM workspaces WHERE id=$1 FOR UPDATE", [actor.workspaceId]);
  if (!principal.rows[0]?.active || !session.rows[0] || session.rows[0].revoked_at ||
      session.rows[0].expires_at.getTime() <= Date.now() || !workspace.rows[0]?.active) {
    throw new HttpFailure(401, "unauthorized", "Sign in again");
  }
  if (m.kind === "partner") {
    const org = await client.query<{ active: boolean }>(
      "SELECT active FROM partner_organizations WHERE id=$1 AND workspace_id=$2 FOR UPDATE",
      [m.partner_org_id, actor.workspaceId]);
    if (!org.rows[0]?.active) throw hiddenRecord();
  }
  const marker = await client.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < requiredSchemaVersion) throw new HttpFailure(503, "unavailable", "Service unavailable");
  const state = await client.query("SELECT customer_id FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR UPDATE",
    [customerId, actor.workspaceId]);
  if (!state.rowCount) throw hiddenRecord();
  if (m.kind === "partner") {
    const grant = await client.query<{ state: string }>(
      "SELECT state FROM customer_grants WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE",
      [customerId, actor.membershipId]);
    if (grant.rows[0]?.state !== "active") throw hiddenRecord();
  }
}

export async function requireSteward(client: PoolClient, actor: ProfileActor, customerId: string): Promise<void> {
  if (actor.kind !== "internal") throw new HttpFailure(403, "forbidden", "Action not allowed");
  if (actor.role === "admin") return;
  const steward = await client.query<{ active: boolean }>(
    "SELECT active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE",
    [customerId, actor.membershipId]);
  if (!steward.rows[0]?.active) throw new HttpFailure(403, "forbidden", "Action not allowed");
}
