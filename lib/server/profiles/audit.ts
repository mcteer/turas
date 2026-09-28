import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";

export async function appendProfileAudit(client: PoolClient, actor: ProfileActor,
  customerId: string, command: ProfileCommand, result: unknown, receiptId: string,
  durationMs: number): Promise<void> {
  const values = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const target = ["revisionId", "sourceRevisionId", "requestId", "conflictId",
    "workloadId", "membershipId", "recordId"]
    .map((key) => values[key]).find((value) => typeof value === "string") as string | undefined;
  const transition = typeof values.reviewState === "string" ? values.reviewState :
    typeof values.state === "string" ? values.state : command.action;
  const recordVersion = typeof values.recordVersion === "number" ? values.recordVersion :
    typeof values.version === "number" ? values.version : null;
  await client.query(`INSERT INTO profile_audit_events
    (id,workspace_id,customer_id,actor_membership_id,action,target_id,receipt_id,
     transition,record_version,duration_ms)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [randomUUID(), actor.workspaceId, customerId, actor.membershipId,
    command.action, target ?? null, receiptId, transition,
    recordVersion, Math.max(0, Math.round(durationMs))]);
}
