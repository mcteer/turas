import { randomUUID } from "node:crypto";
import type { AppIdentity } from "@/lib/auth/session";
import { database, ensureDatabase } from "@/lib/db/client";
import { DEMO_DATA } from "@/lib/demo/fixtures";

export type Decision = { id: string; engagementId: string; status: "approved" | "rejected" | "deferred"; rationale: string; createdAt: string };
const localDecisions = new Map<string, Decision & { ownerUserId: string; environmentId: string; workspaceId: string; idempotencyKey: string }>();

export async function recordDecision(identity: AppIdentity, input: { engagementId: string; expectedVersion: string; idempotencyKey: string; rationale: string; status: Decision["status"] }) {
  if (identity.role !== "owner") return { status: "denied" as const, reason: "Only the synthetic demo owner may approve an intervention." };
  if (input.expectedVersion !== DEMO_DATA.version) return { status: "conflict" as const, reason: "The synthetic scenario version changed; review the current proposal." };
  const query = database();
  if (query) {
    await ensureDatabase();
    const duplicate = await query.query(`SELECT id, engagement_id, status, rationale, created_at FROM turas_decisions WHERE idempotency_key = $1`, [input.idempotencyKey]);
    if (duplicate[0]) return { status: "recorded" as const, decision: row(duplicate[0]) };
    const id = randomUUID(); const now = new Date().toISOString();
    await query.query(`INSERT INTO turas_decisions (id, engagement_id, environment_id, workspace_id, actor_user_id, idempotency_key, expected_version, status, rationale, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, input.engagementId, identity.environmentId, identity.workspaceId, identity.userId, input.idempotencyKey, input.expectedVersion, input.status, input.rationale, now]);
    return { status: "recorded" as const, decision: { id, engagementId: input.engagementId, status: input.status, rationale: input.rationale, createdAt: now } };
  }
  const duplicate = [...localDecisions.values()].find((decision) => decision.idempotencyKey === input.idempotencyKey);
  if (duplicate) return { status: "recorded" as const, decision: strip(duplicate) };
  const decision = { id: randomUUID(), engagementId: input.engagementId, status: input.status, rationale: input.rationale, createdAt: new Date().toISOString(), ownerUserId: identity.userId, environmentId: identity.environmentId, workspaceId: identity.workspaceId, idempotencyKey: input.idempotencyKey };
  localDecisions.set(decision.id, decision);
  return { status: "recorded" as const, decision: strip(decision) };
}
function row(value: Record<string, unknown>): Decision { const status = value.status === "rejected" || value.status === "deferred" ? value.status : "approved"; return { id: String(value.id), engagementId: String(value.engagement_id), status, rationale: String(value.rationale ?? ""), createdAt: new Date(String(value.created_at)).toISOString() }; }
function strip(value: Decision) { const { id, engagementId, status, rationale, createdAt } = value; return { id, engagementId, status, rationale, createdAt }; }
