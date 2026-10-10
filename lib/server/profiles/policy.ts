import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { requiredSchemaVersion } from "../db/readiness";

export type ProfileActor = CurrentSession;

export async function lockWorkspaceActor(client: PoolClient, actor: ProfileActor, affectedMembershipId?: string | readonly string[], readOnly = false, lockTimeoutMs = 3000): Promise<void> {
  await client.query("SELECT set_config('lock_timeout',CASE WHEN current_setting('turas.partner_operation',true)='013' OR current_setting('turas.learning_operation',true)='014' THEN '2000ms' ELSE $1 END,true)",[`${lockTimeoutMs}ms`]);
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const lock = readOnly ? "FOR SHARE" : "FOR UPDATE";
  const memberIds = [...new Set([actor.membershipId, ...(typeof affectedMembershipId === "string" ? [affectedMembershipId] : affectedMembershipId ?? [])].filter((id): id is string => Boolean(id)))].sort();
  const locked = new Map<string, { principal_id: string; workspace_id: string; kind: string; role: string; active: boolean; partner_org_id: string | null }>();
  for (const id of memberIds) {
    const found = await client.query<{ principal_id: string; workspace_id: string; kind: string; role: string; active: boolean; partner_org_id: string | null }>(
      `SELECT principal_id,workspace_id,kind,role,active,partner_org_id FROM memberships WHERE id=$1 AND workspace_id=$2 ${lock}`, [id,actor.workspaceId]);
    if (found.rows[0]) locked.set(id, found.rows[0]);
  }
  const m = locked.get(actor.membershipId);
  if (!m || !m.active || m.principal_id !== actor.principalId || m.workspace_id !== actor.workspaceId ||
      m.kind !== actor.kind || m.role !== actor.role) throw new HttpFailure(401, "unauthorized", "Sign in again");
  const principals=new Map<string,boolean>();
  for(const principalId of [...new Set([...locked.values()].map(member=>member.principal_id))].sort()){
    const principal=await client.query<{active:boolean}>(`SELECT active FROM principals WHERE id=$1 ${lock}`,[principalId]);
    if(principal.rows[0])principals.set(principalId,principal.rows[0].active);
  }
  const session = await client.query<{ revoked_at: Date | null; expires_at: Date }>(
    `SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1 AND principal_id=$2 ${lock}`,
    [actor.sessionId, actor.principalId]);
  const workspace = await client.query<{ active: boolean }>(`SELECT active FROM workspaces WHERE id=$1 ${lock}`, [actor.workspaceId]);
  if (!principals.get(actor.principalId) || !session.rows[0] || session.rows[0].revoked_at ||
      session.rows[0].expires_at.getTime() <= Date.now() || !workspace.rows[0]?.active) {
    throw new HttpFailure(401, "unauthorized", "Sign in again");
  }
  if (m.kind === "partner") {
    const org = await client.query<{ active: boolean }>(
      `SELECT active FROM partner_organizations WHERE id=$1 AND workspace_id=$2 ${lock}`,
      [m.partner_org_id, actor.workspaceId]);
    if (!org.rows[0]?.active) throw hiddenRecord();
  }
  const marker = await client.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < requiredSchemaVersion) throw new HttpFailure(503, "unavailable", "Service unavailable");
}

export async function lockProfileActor(client: PoolClient, actor: ProfileActor, customerId: string, affectedMembershipId?: string | readonly string[], readOnly = false): Promise<void> {
  await lockWorkspaceActor(client, actor, affectedMembershipId, readOnly);
  const lock = readOnly ? "FOR SHARE" : "FOR UPDATE";
  const state = await client.query(`SELECT customer_id FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 ${lock}`,
    [customerId, actor.workspaceId]);
  if (!state.rowCount) throw hiddenRecord();
  if (actor.kind === "partner") {
    const grant = await client.query<{ state: string }>(
      `SELECT state FROM customer_grants WHERE customer_id=$1 AND membership_id=$2 ${lock}`,
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
