import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { readEligibleContext } from "./context";
import { assertArtifactDependenciesCurrent } from "../artifacts/context-fence";

type Snapshot = { contractVersion: "customer-context-v1"; contextVersion: string;
  asOf: string; validUntil: string; entries: { citationId: string }[];
  complete: boolean; truncated: boolean };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function captureAttemptContext(client: PoolClient, actor: CurrentSession,
  conversationId: string, attemptId: string, customerId: string): Promise<Snapshot> {
  const conversation = await client.query<{ context_audience: string | null; context_generation: string | null;
    context_valid_until: Date | null; context_snapshot_schema: string | null;
    context_login_session_id: string | null; context_membership_id: string | null }>(`
    SELECT context_audience,context_generation,context_valid_until,context_snapshot_schema,
      context_login_session_id,context_membership_id
    FROM conversations WHERE id=$1 AND customer_id=$2 FOR UPDATE`, [conversationId, customerId]);
  const bound = conversation.rows[0];
  if (!bound || bound.context_snapshot_schema !== "customer-context-v1" ||
      bound.context_login_session_id !== actor.sessionId ||
      bound.context_membership_id !== actor.membershipId ||
      bound.context_audience !== (actor.kind === "internal" ? "internal" : "delivery")) {
    throw new HttpFailure(409, "historical_conversation", "Start a new conversation for current customer context");
  }
  if (bound.context_valid_until && bound.context_valid_until.getTime() <= Date.now()) {
    throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
  }
  const snapshot = await readEligibleContext(actor, customerId, {}, client) as Snapshot;
  if (snapshot.contractVersion !== "customer-context-v1" ||
      snapshot.contextVersion !== bound.context_generation ||
      Date.parse(snapshot.validUntil) <= Date.now()) {
    throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
  }
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized) > 32_768) throw new HttpFailure(503, "context_unavailable", "Service unavailable");
  const digest = createHash("sha256").update(stableJson(snapshot)).digest("hex");
  const deadline = bound.context_valid_until && bound.context_valid_until.getTime() < Date.parse(snapshot.validUntil)
    ? bound.context_valid_until : new Date(snapshot.validUntil);
  await client.query(`INSERT INTO context_snapshot_receipts
    (id,attempt_id,conversation_id,workspace_id,customer_id,owner_principal_id,
     login_session_id,membership_id,environment_id,audience,generation,as_of,
     valid_until,schema_version,snapshot_digest,citation_ids,complete,truncated,snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
  [randomUUID(), attemptId, conversationId, actor.workspaceId, customerId,
    actor.principalId, actor.sessionId, actor.membershipId, getServerConfig().TURAS_ENVIRONMENT_ID,
    bound.context_audience, bound.context_generation, snapshot.asOf, deadline,
    snapshot.contractVersion, digest, JSON.stringify(snapshot.entries.map((entry) => entry.citationId)),
    snapshot.complete, snapshot.truncated, serialized]);
  await client.query(`UPDATE conversations SET context_valid_until=$2 WHERE id=$1`,
    [conversationId, deadline]);
  await client.query(`UPDATE response_attempts SET context_generation=$2,
    context_valid_until=$3,context_login_session_id=$4,context_membership_id=$5
    WHERE id=$1 AND conversation_id=$6`,
  [attemptId, bound.context_generation, deadline, actor.sessionId,
    actor.membershipId, conversationId]);
  return snapshot;
}

export async function readCurrentAttemptContext(client: PoolClient, attemptId: string,
  principalId: string): Promise<Snapshot> {
  const receipt = await client.query<{ snapshot: Snapshot; snapshot_digest: string;
    customer_id: string; owner_principal_id: string; login_session_id: string;
    membership_id: string; workspace_id: string; environment_id: string;
    audience: string; generation: string; valid_until: Date;
    context_generation: string; context_valid_until: Date | null;
    context_snapshot_schema: string | null; revoked_at: Date | null;
    expires_at: Date; principal_active: boolean; member_active: boolean;
    member_kind: string; member_role: string; workspace_active: boolean;
    organization_active: boolean | null; grant_state: string | null }>(`
    SELECT r.snapshot,r.snapshot_digest,r.customer_id,r.owner_principal_id,
      r.login_session_id,r.membership_id,r.workspace_id,r.environment_id,
      r.audience,r.generation,r.valid_until,c.context_generation,c.context_valid_until,
      c.context_snapshot_schema,s.revoked_at,s.expires_at,p.active AS principal_active,
      m.active AS member_active,m.kind AS member_kind,m.role AS member_role,
      w.active AS workspace_active,o.active AS organization_active,g.state AS grant_state
    FROM context_snapshot_receipts r JOIN conversations c ON c.id=r.conversation_id
    JOIN login_sessions s ON s.id=r.login_session_id
    JOIN principals p ON p.id=r.owner_principal_id
    JOIN memberships m ON m.id=r.membership_id
    JOIN workspaces w ON w.id=r.workspace_id
    LEFT JOIN partner_organizations o ON o.id=m.partner_org_id
    LEFT JOIN customer_grants g ON g.customer_id=r.customer_id AND g.membership_id=m.id
    WHERE r.attempt_id=$1 AND r.owner_principal_id=$2`, [attemptId, principalId]);
  const row = receipt.rows[0];
  if (!row || row.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      row.context_snapshot_schema !== "customer-context-v1" ||
      row.context_generation !== row.generation ||
      row.valid_until.getTime() <= Date.now() ||
      (row.context_valid_until && row.context_valid_until.getTime() <= Date.now()) ||
      row.revoked_at || row.expires_at.getTime() <= Date.now() ||
      !row.principal_active || !row.member_active || !row.workspace_active ||
      (row.member_kind === "partner" && (row.organization_active !== true || row.grant_state !== "active"))) {
    throw hiddenRecord();
  }
  const state = await client.query<{ internal_generation: string; delivery_generation: string }>(
    "SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2",
    [row.customer_id, row.workspace_id]);
  const current = row.audience === "internal" ? state.rows[0]?.internal_generation : state.rows[0]?.delivery_generation;
  if (current !== row.generation) throw hiddenRecord();
  const attempt = await client.query<{ conversation_id: string }>(
    "SELECT conversation_id FROM response_attempts WHERE id=$1", [attemptId]);
  if (!attempt.rows[0]) throw hiddenRecord();
  await assertArtifactDependenciesCurrent(client, attempt.rows[0].conversation_id);
  const digest = createHash("sha256").update(stableJson(row.snapshot)).digest("hex");
  if (digest !== row.snapshot_digest) throw hiddenRecord();
  return row.snapshot;
}
