import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { appendAccessAudit } from "./audit";

type GrantState = "active" | "revoked";
type CommandIdentity = { actorPrincipalId: string; requestKey: string };

export type GrantDecision = CommandIdentity & {
  membershipId: string;
  customerId: string;
  expectedRevision: number;
  state: GrantState;
  actorSessionId?: string;
};

export type MembershipDecision = CommandIdentity & {
  membershipId: string;
  expectedRevision: number;
  active: boolean;
  actorSessionId?: string;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function checkEnvironment(client: PoolClient): Promise<void> {
  const marker = await client.query<{ environment_id: string }>(
    "SELECT environment_id FROM turas_environment LIMIT 1",
  );
  if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID) {
    throw new HttpFailure(503, "unavailable", "Service unavailable");
  }
}

async function requireAdmin(client: PoolClient, actorId: string, workspaceId: string): Promise<void> {
  const admin = await client.query(`
    SELECT 1 FROM principals p
    JOIN memberships m ON m.principal_id = p.id
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE p.id = $1 AND m.workspace_id = $2 AND p.active AND m.active
      AND w.active AND m.kind = 'internal' AND m.role = 'admin'
    LIMIT 1
  `, [actorId, workspaceId]);
  if (!admin.rowCount) throw new HttpFailure(403, "forbidden", "Action not allowed");
}

async function reserveCommand<T>(
  client: PoolClient, identity: CommandIdentity, action: string, bodyDigest: string,
): Promise<T | null> {
  const inserted = await client.query(`
    INSERT INTO admin_commands (id, actor_principal_id, request_key, body_digest, action, result)
    VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
    ON CONFLICT (actor_principal_id, request_key) DO NOTHING RETURNING id
  `, [randomUUID(), identity.actorPrincipalId, identity.requestKey, bodyDigest, action]);
  if (inserted.rowCount) return null;
  const existing = await client.query<{ body_digest: string; action: string; result: T }>(
    "SELECT body_digest, action, result FROM admin_commands WHERE actor_principal_id = $1 AND request_key = $2",
    [identity.actorPrincipalId, identity.requestKey],
  );
  if (existing.rows[0]?.body_digest !== bodyDigest || existing.rows[0]?.action !== action) {
    throw new HttpFailure(409, "request_key_conflict", "Request key already used");
  }
  return existing.rows[0].result;
}

async function finishCommand(client: PoolClient, identity: CommandIdentity, result: unknown): Promise<void> {
  await client.query(
    "UPDATE admin_commands SET result = $1 WHERE actor_principal_id = $2 AND request_key = $3",
    [JSON.stringify(result), identity.actorPrincipalId, identity.requestKey],
  );
}

export async function setPartnerGrant(input: GrantDecision): Promise<{ revision: number; state: GrantState }> {
  return withTransaction(async (client) => {
    await checkEnvironment(client);
    const membership = await client.query<{ workspace_id: string; kind: string; active: boolean }>(
      "SELECT workspace_id, kind, active FROM memberships WHERE id = $1 FOR UPDATE",
      [input.membershipId],
    );
    const target = membership.rows[0];
    if (!target || target.kind !== "partner") throw hiddenRecord();
    await requireAdmin(client, input.actorPrincipalId, target.workspace_id);
    const customer = await client.query(
      "SELECT 1 FROM customer_references WHERE id = $1 AND workspace_id = $2",
      [input.customerId, target.workspace_id],
    );
    if (!customer.rowCount) throw hiddenRecord();
    const bodyDigest = digest({ membershipId: input.membershipId, customerId: input.customerId,
      expectedRevision: input.expectedRevision, state: input.state });
    const prior = await reserveCommand<{ revision: number; state: GrantState }>(client, input, "grant_change", bodyDigest);
    if (prior) return prior;
    const current = await client.query<{ revision: string; state: GrantState }>(
      "SELECT revision, state FROM customer_grants WHERE membership_id = $1 AND customer_id = $2 FOR UPDATE",
      [input.membershipId, input.customerId],
    );
    const revision = current.rows[0] ? Number(current.rows[0].revision) : 0;
    if (revision !== input.expectedRevision) throw new HttpFailure(409, "stale_revision", "Access changed; reload and retry");
    if (!current.rows[0] && input.state === "revoked") throw hiddenRecord();
    const nextRevision = revision + 1;
    if (current.rows[0]) {
      await client.query(`UPDATE customer_grants SET state = $1, revision = $2,
        granted_by = $3, changed_at = now() WHERE membership_id = $4 AND customer_id = $5`,
      [input.state, nextRevision, input.actorPrincipalId, input.membershipId, input.customerId]);
    } else {
      await client.query(`INSERT INTO customer_grants
        (id, membership_id, workspace_id, customer_id, state, revision, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), input.membershipId, target.workspace_id, input.customerId,
        input.state, nextRevision, input.actorPrincipalId]);
    }
    const result = { revision: nextRevision, state: input.state };
    await appendAccessAudit(client, { actorPrincipalId: input.actorPrincipalId,
      actorSessionId: input.actorSessionId, workspaceId: target.workspace_id,
      customerId: input.customerId, subjectId: input.membershipId,
      action: "grant_change", outcome: input.state });
    await finishCommand(client, input, result);
    return result;
  });
}

export async function setMembershipActive(input: MembershipDecision): Promise<{ revision: number; active: boolean }> {
  return withTransaction(async (client) => {
    await checkEnvironment(client);
    const targetResult = await client.query<{ workspace_id: string; role: string; active: boolean; revision: string }>(
      "SELECT workspace_id, role, active, revision FROM memberships WHERE id = $1 FOR UPDATE",
      [input.membershipId],
    );
    const target = targetResult.rows[0];
    if (!target) throw hiddenRecord();
    await requireAdmin(client, input.actorPrincipalId, target.workspace_id);
    const bodyDigest = digest({ membershipId: input.membershipId,
      expectedRevision: input.expectedRevision, active: input.active });
    const prior = await reserveCommand<{ revision: number; active: boolean }>(client, input, "membership_change", bodyDigest);
    if (prior) return prior;
    if (Number(target.revision) !== input.expectedRevision) {
      throw new HttpFailure(409, "stale_revision", "Access changed; reload and retry");
    }
    if (target.role === "admin" && target.active && !input.active) {
      const admins = await client.query(
        "SELECT id FROM memberships WHERE workspace_id = $1 AND role = 'admin' AND active FOR UPDATE",
        [target.workspace_id],
      );
      if ((admins.rowCount ?? 0) <= 1) {
        throw new HttpFailure(409, "last_admin", "The final active administrator cannot be disabled");
      }
    }
    const result = { revision: Number(target.revision) + 1, active: input.active };
    await client.query(
      "UPDATE memberships SET active = $1, revision = $2 WHERE id = $3",
      [input.active, result.revision, input.membershipId],
    );
    await appendAccessAudit(client, { actorPrincipalId: input.actorPrincipalId,
      actorSessionId: input.actorSessionId, workspaceId: target.workspace_id,
      subjectId: input.membershipId, action: "membership_change",
      outcome: input.active ? "active" : "disabled" });
    await finishCommand(client, input, result);
    return result;
  });
}
