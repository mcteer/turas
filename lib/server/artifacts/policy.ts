import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { lockProfileActor, requireSteward } from "../profiles/policy";

export type ArtifactScope = {
  environmentId: string;
  workspaceId: string;
  customerId: string;
  ownerPrincipalId: string;
};

/** Human commands always recheck the live login and current customer grant. */
export async function lockArtifactHumanScope(client: PoolClient, actor: CurrentSession, scope: ArtifactScope): Promise<void> {
  if (scope.environmentId !== getServerConfig().TURAS_ENVIRONMENT_ID || scope.workspaceId !== actor.workspaceId) throw hiddenRecord();
  await lockProfileActor(client, actor, scope.customerId);
  const marker = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1", [scope.environmentId]);
  if ((marker.rows[0]?.schema_version ?? 0) < 18) throw new HttpFailure(503, "artifact_schema_unavailable", "Artifact intake unavailable");
}

/** Background publication uses persisted intake consent but never a stale browser login. */
export async function lockArtifactWorkerAuthority(client: PoolClient, scope: ArtifactScope & { submittedAt?: Date | null }, initiatingPrincipalId: string): Promise<boolean> {
  if (scope.environmentId !== getServerConfig().TURAS_ENVIRONMENT_ID) return false;
  const marker = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1", [scope.environmentId]);
  if ((marker.rows[0]?.schema_version ?? 0) < 18) return false;
  await client.query("SET LOCAL lock_timeout = '3000ms'");
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const member = await client.query<{ id: string; kind: string; role: string; partner_org_id: string | null; active: boolean }>(`
    SELECT id,kind,role,partner_org_id,active FROM memberships
    WHERE principal_id=$1 AND workspace_id=$2 FOR UPDATE
  `, [initiatingPrincipalId, scope.workspaceId]);
  const m = member.rows[0];
  if (!m?.active) return false;
  const principal = await client.query<{ active: boolean }>("SELECT active FROM principals WHERE id=$1 FOR UPDATE", [initiatingPrincipalId]);
  const workspace = await client.query<{ active: boolean }>("SELECT active FROM workspaces WHERE id=$1 FOR UPDATE", [scope.workspaceId]);
  if (!principal.rows[0]?.active || !workspace.rows[0]?.active) return false;
  if (m.kind === "partner") {
    const organization = await client.query<{ active: boolean }>(`
      SELECT active FROM partner_organizations WHERE id=$1 AND workspace_id=$2 FOR UPDATE
    `, [m.partner_org_id, scope.workspaceId]);
    if (!organization.rows[0]?.active) return false;
  }
  const customer = await client.query("SELECT customer_id FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR UPDATE", [scope.customerId, scope.workspaceId]);
  if (!customer.rowCount) return false;
  if (m.kind === "partner") {
    const grant = await client.query<{ state: string }>(`
      SELECT state FROM customer_grants WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE
    `, [scope.customerId, m.id]);
    if (grant.rows[0]?.state !== "active") return false;
  }
  if (initiatingPrincipalId === scope.ownerPrincipalId) return true;
  if (!scope.submittedAt || m.kind !== "internal") return false;
  if (m.role === "admin") return true;
  const steward = await client.query<{ active: boolean }>(`
    SELECT active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE
  `, [scope.customerId, m.id]);
  return !!steward.rows[0]?.active;
}

export async function requireArtifactSourceReader(
  client: PoolClient,
  actor: CurrentSession,
  scope: ArtifactScope & { submittedAt: Date | null },
): Promise<void> {
  await lockArtifactHumanScope(client, actor, scope);
  if (actor.principalId === scope.ownerPrincipalId) return;
  if (!scope.submittedAt) throw hiddenRecord();
  try {
    await requireSteward(client, actor, scope.customerId);
  } catch (error) {
    if (error instanceof HttpFailure) throw hiddenRecord();
    throw error;
  }
}

export async function requireArtifactDestructiveAuthority(
  client: PoolClient,
  actor: CurrentSession,
  scope: ArtifactScope & { submittedAt: Date | null },
): Promise<void> {
  await lockArtifactHumanScope(client, actor, scope);
  if (!scope.submittedAt) {
    if (actor.principalId !== scope.ownerPrincipalId) throw hiddenRecord();
    return;
  }
  await requireSteward(client, actor, scope.customerId);
}
