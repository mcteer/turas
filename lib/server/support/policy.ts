import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { lockProfileActor } from "../profiles/policy";
import { DEMO_IDS } from "../bootstrap-ids";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { requireSupportEnvironment } from "./repository";
import { getServerConfig } from "../config";

export type SupportActor = CurrentSession;
export type SupportCapability = "read" | "propose" | "review" | "advice";
export function isSupportReviewer(actor: SupportActor): boolean {
  return actor.kind === "internal" && actor.role === "admin" && actor.principalId === DEMO_IDS.mcteer;
}
export function requireSupportCapability(actor: SupportActor, capability: SupportCapability): void {
  if ((capability === "review" && !isSupportReviewer(actor)) ||
    (capability !== "read" && actor.kind !== "internal"))
    throw new HttpFailure(403, "forbidden", "Action not allowed");
}
export function requireSupportAudience(actor: SupportActor, audience: "internal" | "delivery"): void {
  if (actor.kind === "partner" && audience !== "delivery") throw hiddenRecord();
}
/** Must run in the command/read transaction before resolving any support content. */
export async function lockSupportActor(db: PoolClient, actor: SupportActor, customerId: string,
  capability: SupportCapability, audience: "internal" | "delivery", affectedMembershipId?: string): Promise<void> {
  await lockProfileActor(db, actor, customerId, affectedMembershipId, true);
  requireSupportCapability(actor, capability);
  requireSupportAudience(actor, audience);
  await requireSupportEnvironment(db, capability !== "read", capability === "advice");
}

/** Quota-only preflight: reads no customer content and grants no retained fence.
 * The subsequent content transaction MUST reacquire lockSupportActor. A concurrent
 * revocation may consume a quota slot, but cannot authorize content or a decision. */
export async function checkSupportReviewAdmission(db: Pick<PoolClient, "query">, actor: SupportActor, customerId: string,
  options: { newWork?: boolean } = {}): Promise<void> {
  requireSupportCapability(actor, "review");
  if (options.newWork !== false && process.env.TURAS_010_DISABLED === "1") throw new HttpFailure(503, "feature_disabled", "New support work is temporarily unavailable");
  const row = (await db.query(`SELECT e.environment_id,e.schema_version,
      EXISTS(SELECT 1 FROM customer_profile_state c WHERE c.customer_id=$7 AND c.workspace_id=m.workspace_id) AS customer_allowed
    FROM memberships m JOIN principals p ON p.id=m.principal_id
    JOIN login_sessions s ON s.principal_id=p.id AND s.id=$3
    JOIN workspaces w ON w.id=m.workspace_id CROSS JOIN turas_environment e
    WHERE m.id=$1 AND m.principal_id=$2 AND m.workspace_id=$4 AND m.kind=$5 AND m.role=$6
      AND m.active AND p.active AND w.active AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()`,
  [actor.membershipId, actor.principalId, actor.sessionId, actor.workspaceId, actor.kind, actor.role, customerId])).rows[0];
  if (!row) throw new HttpFailure(401, "unauthorized", "Sign in again");
  if (row.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID || row.schema_version < 42)
    throw new HttpFailure(503, "schema_unavailable", "Support guidance unavailable");
  if (!row.customer_allowed) throw hiddenRecord();
}
