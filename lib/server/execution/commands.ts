import { z } from "zod";
import { authorizeTimeReceipt } from "./time";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { executionCommandSchema, type ExecutionCommand } from "./schema";
import { lockExecutionActor, type ExecutionActor, type ExecutionCapability } from "./policy";
import { chargeExecutionRate, executionCustomer } from "./locks";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v)]));
  return value;
}
export function executionDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
export const executionResultSchema = z.object({ state: z.literal("committed"), executionGeneration: z.number().int().positive().safe(),
  changed: z.array(z.object({ id: z.uuid(), version: z.number().int().positive().safe() }).strict()).max(50) }).strict();
export type ExecutionResult = z.infer<typeof executionResultSchema>;
export async function executionTransaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await withTransaction(run); } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (attempt >= 2 || !["40001", "40P01"].includes(String(code))) throw error;
    }
  }
}
export async function executeExecutionCommand(actor: ExecutionActor, engagementId: string, raw: unknown,
  handler: (db: PoolClient, command: ExecutionCommand, customerId: string) => Promise<ExecutionResult>): Promise<ExecutionResult & { requestKey: string; commandId:string }> {
  const parsed = executionCommandSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400, "invalid_input", "Invalid execution command");
  const command = parsed.data, digest = executionDigest({ engagementId, command });
  return executionTransaction(async db => {
    const customerId = await executionCustomer(db, actor, engagementId);
    const capability: ExecutionCapability = command.action === "setup" ? "setup" :
      ["record.accept","record.reject","record.retract","milestone.decide","time.approve","time.reject","time.reverse","baseline.reconcile"].includes(command.action) ? "review" : "contribute";
    let owner: string | undefined;
    if ("record" in command.payload) owner = command.payload.record.ownerMembershipId ?? undefined;
    else if ("revisionId" in command.payload) owner = (await db.query<{owner_membership_id:string|null}>(`SELECT owner_membership_id FROM execution_record_revisions
      WHERE id=$1 AND engagement_id=$2 AND workspace_id=$3 AND environment_id=$4`,[command.payload.revisionId,engagementId,actor.workspaceId,process.env.TURAS_ENVIRONMENT_ID])).rows[0]?.owner_membership_id ?? undefined;
    await lockExecutionActor(db, actor, customerId, capability, false, owner);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [`execution:${process.env.TURAS_ENVIRONMENT_ID}:${actor.workspaceId}:${actor.membershipId}:${command.requestKey}`]);
    const previous = (await db.query<{ id:string; request_digest: string; result: ExecutionResult }>(`SELECT id,request_digest,result
      FROM execution_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
      [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, command.requestKey])).rows[0];
    if (previous) {
      if (previous.request_digest !== digest) throw new HttpFailure(409, "key_conflict", "Request key has different input");
      if (command.action.startsWith("time.")) await authorizeTimeReceipt(db,actor,customerId,engagementId,command.action,previous.result.changed[0].id);
      return { ...previous.result, requestKey: command.requestKey,commandId:previous.id };
    }
    await lockExecutionActor(db, actor, customerId, capability, true, owner);
    await chargeExecutionRate(db, actor, capability === "contribute" ? "write" : "review");
    const result = executionResultSchema.parse(await handler(db, command, customerId)),commandId=randomUUID();
    await db.query(`INSERT INTO execution_command_receipts
      (id,environment_id,workspace_id,customer_id,engagement_id,actor_membership_id,request_key,action,request_digest,execution_generation,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [commandId, process.env.TURAS_ENVIRONMENT_ID,
      actor.workspaceId, customerId, engagementId, actor.membershipId, command.requestKey, command.action, digest,
      result.executionGeneration, JSON.stringify(result)]);
    return { ...result, requestKey: command.requestKey,commandId };
  });
}
export async function readExecutionReceipt(actor: ExecutionActor, requestKey: string) {
  return executionTransaction(async db => {
    const row = (await db.query<{ id:string; customer_id: string; engagement_id: string; action: string; result: ExecutionResult }>(`SELECT id,customer_id,engagement_id,action,result
      FROM execution_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
      [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey])).rows[0];
    if (!row) throw hiddenRecord();
    await lockExecutionActor(db, actor, row.customer_id, "read", false);
    if (row.action.startsWith("time.")) await authorizeTimeReceipt(db,actor,row.customer_id,row.engagement_id,row.action,row.result.changed[0].id);
    return { ...row.result, requestKey,commandId:row.id };
  });
}
