import {requireOperationalOpen} from '../operations/admission';
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { isMcpReadActor, type CurrentReadActor } from "../auth/read-actor";
import { assertMcpReady } from "../mcp/schema";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { requiredSchemaVersion } from "../db/readiness";

export type ProfileActor = CurrentSession;

export async function lockWorkspaceActor(client: PoolClient, actor: CurrentReadActor, affectedMembershipId?: string | readonly string[], readOnly = false, lockTimeoutMs = 3000): Promise<void> {
  if(isMcpReadActor(actor)) {
    if(!readOnly || affectedMembershipId!==undefined)throw new HttpFailure(403,"forbidden","Action not allowed");
    lockTimeoutMs=2000;
    await assertMcpReady(client,true);
  }
  await client.query("SELECT set_config('lock_timeout',CASE WHEN current_setting('turas.partner_operation',true)='013' OR current_setting('turas.learning_operation',true)='014' THEN '2000ms' ELSE $1 END,true)",[`${lockTimeoutMs}ms`]);
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  await requireOperationalOpen(client,actor,readOnly);
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
  const session = isMcpReadActor(actor)
    ? await client.query<{revoked_at:Date|null;expires_at:Date}>(
      `SELECT revoked_at,expires_at FROM mcp_connections WHERE id=$1 AND principal_id=$2 AND membership_id=$3
       AND workspace_id=$4 AND environment_id=$5 AND scope_digest=$6 AND credential_hash IS NOT NULL FOR SHARE`,
      [actor.connectionId,actor.principalId,actor.membershipId,actor.workspaceId,actor.environmentId,actor.scopeDigest])
    : await client.query<{ revoked_at: Date | null; expires_at: Date }>(
      `SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1 AND principal_id=$2 AND membership_id=$3 AND workspace_id=$4 ${lock}`,
      [actor.sessionId, actor.principalId,actor.membershipId,actor.workspaceId]);
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

/** Authorize and lock a bounded customer set in the same transaction. */
export async function lockProfileActors(client: PoolClient, actor: CurrentReadActor, customerIds: readonly string[], affectedMembershipId?: string | readonly string[], readOnly = false): Promise<void> {
  await lockWorkspaceActor(client, actor, affectedMembershipId, readOnly);
  const ids=[...new Set(customerIds)].sort();
  if(!ids.length)return;
  if(isMcpReadActor(actor)) {
    const selected=await client.query("SELECT customer_id FROM mcp_connection_customers WHERE connection_id=$1 AND workspace_id=$2 AND customer_id=ANY($3::uuid[]) ORDER BY customer_id FOR SHARE",[actor.connectionId,actor.workspaceId,ids]);
    if(selected.rowCount!==ids.length)throw hiddenRecord();
  }
  const lock=readOnly?"FOR SHARE":"FOR UPDATE";
  const states=await client.query(`SELECT customer_id FROM customer_profile_state WHERE customer_id=ANY($1::uuid[]) AND workspace_id=$2 ORDER BY customer_id ${lock}`,[ids,actor.workspaceId]);
  if(states.rowCount!==ids.length)throw hiddenRecord();
  if(actor.kind==='partner') {
    const grants=await client.query<{state:string}>(`SELECT state FROM customer_grants WHERE customer_id=ANY($1::uuid[]) AND membership_id=$2 ORDER BY customer_id ${lock}`,[ids,actor.membershipId]);
    if(grants.rowCount!==ids.length||grants.rows.some(row=>row.state!=='active'))throw hiddenRecord();
  }
}

export async function lockProfileActor(client: PoolClient, actor: CurrentReadActor, customerId: string, affectedMembershipId?: string | readonly string[], readOnly = false): Promise<void> {
  return lockProfileActors(client,actor,[customerId],affectedMembershipId,readOnly);
}

export async function requireSteward(client: PoolClient, actor: ProfileActor, customerId: string): Promise<void> {
  if(isMcpReadActor(actor))throw new HttpFailure(403,"forbidden","Action not allowed");
  if (actor.kind !== "internal") throw new HttpFailure(403, "forbidden", "Action not allowed");
  if (actor.role === "admin") return;
  const steward = await client.query<{ active: boolean }>(
    "SELECT active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE",
    [customerId, actor.membershipId]);
  if (!steward.rows[0]?.active) throw new HttpFailure(403, "forbidden", "Action not allowed");
}
