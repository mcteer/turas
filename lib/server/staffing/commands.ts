import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z, ZodError } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { STAFFING_LIMITS, staffingIdSchema, staffingDigestSchema,
  staffingRequestKeySchema, staffingVersionSchema } from "../../contracts/staffing";
import { canonicalPlanJson } from "../../contracts/plans";
import { recordStaffingTelemetry, staffingCommandOperation, staffingConflictCategory, type StaffingTelemetryInput } from "./telemetry";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockStaffingActor, type StaffingActor, type StaffingCapability } from "./policy";

export function staffingSha256(value: unknown): string {
  return createHash("sha256").update(canonicalPlanJson(value)).digest("hex");
}
export function parseStaffing<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (error instanceof ZodError) throw new HttpFailure(422, "invalid_input", "Invalid staffing request");
    throw error;
  }
}

const safeResultShape = {
  entityId: staffingIdSchema.optional(), resourceId: staffingIdSchema.optional(),
  skillId: staffingIdSchema.optional(), sourceId: staffingIdSchema.optional(),
  sourceVersionId: staffingIdSchema.optional(), importId: staffingIdSchema.optional(),
  competencyId: staffingIdSchema.optional(), revisionId: staffingIdSchema.optional(),
  decisionId: staffingIdSchema.optional(), demandId: staffingIdSchema.optional(),
  allocationId: staffingIdSchema.optional(), previewId: staffingIdSchema.optional(),
  scenarioId: staffingIdSchema.optional(), attemptId: staffingIdSchema.optional(),
  conversationId: staffingIdSchema.optional(), operationId: staffingIdSchema.optional(), nativeRequestId: staffingIdSchema.optional(), aggregateVersion: staffingVersionSchema.optional(),
  generation: staffingVersionSchema.optional(), contentDigest: staffingDigestSchema.optional(),
  state: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  warnings: z.array(z.string().regex(/^[a-z_]{1,64}$/)).max(50).optional(),
};
const resultSchema = z.object({ ...safeResultShape,
  rows: z.array(z.object(safeResultShape).strict()).max(100).optional(),
}).strict();
export type StaffingCommandResult = z.infer<typeof resultSchema>;

export async function reserveStaffingRate(client: PoolClient, actor: StaffingActor,
  kind: "write" | "import" | "advisory"): Promise<void> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const unit = kind === "advisory" ? "hour" : "minute";
  const limit = kind === "advisory" ? 5 : kind === "import" ? 5 : 30;
  const result = await client.query(`INSERT INTO staffing_write_windows
    (environment_id,workspace_id,actor_membership_id,kind,window_start,count)
    VALUES($1,$2,$3,$4,date_trunc('${unit}',clock_timestamp()),1)
    ON CONFLICT(environment_id,workspace_id,actor_membership_id,kind,window_start)
    DO UPDATE SET count=staffing_write_windows.count+1 WHERE staffing_write_windows.count<$5
    RETURNING count`, [environmentId, actor.workspaceId, actor.membershipId, kind, limit]);
  if (!result.rowCount) throw new HttpFailure(429, "rate_limited", "Staffing request limit reached",
    kind === "advisory" ? 3_600 : 60);
}

type ReceiptTable = "staffing_command_receipts" | "workforce_command_receipts";
type CommandOptions = { capability: StaffingCapability; customerId?: string;
  table?: ReceiptTable; rateKind?: "write" | "import" | "advisory";
  allowDisabled?: boolean; authorizeReplay?: (client: PoolClient) => Promise<void> };

/** Standalone services may replay a committed exact command before resolving
 * local files/timezones. Absence reserves nothing; the final command remains
 * authoritative and checks the same digest again under its own transaction. */
export async function tryStaffingCommandReplay(actor: StaffingActor,
  request: { requestKey: string; action: string } & Record<string, unknown>, options: CommandOptions) {
  parseStaffing(staffingRequestKeySchema, request.requestKey);
  let serialized: string;
  try { serialized = canonicalPlanJson(request); }
  catch { throw new HttpFailure(422, "invalid_input", "Invalid staffing request"); }
  if (Buffer.byteLength(serialized, "utf8") > STAFFING_LIMITS.revisionBytes) throw new HttpFailure(413, "too_large", "Staffing request too large");
  return withTransaction(async db => {
    await lockStaffingActor(db, actor, options.capability, { customerId: options.customerId, write: true, allowDisabled: options.allowDisabled });
    const prior = (await db.query(`SELECT request_digest,result_ids,receipt_table FROM (
      SELECT request_digest,result_ids,'staffing_command_receipts' AS receipt_table,environment_id,workspace_id,actor_membership_id,request_key FROM staffing_command_receipts
      UNION ALL SELECT request_digest,result_ids,'workforce_command_receipts' AS receipt_table,environment_id,workspace_id,actor_membership_id,request_key FROM workforce_command_receipts
    ) receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, request.requestKey])).rows[0];
    if (!prior) return null;
    if (prior.receipt_table !== (options.table ?? "staffing_command_receipts") || prior.request_digest !== staffingSha256(request)) {
      throw new HttpFailure(409, "request_key_conflict", "Request key already used");
    }
    await options.authorizeReplay?.(db);
    return parseStaffing(resultSchema, prior.result_ids);
  });
}

/** Preparation may race a committed identical request. Reconcile after a
 * rolled-back conflict; never repeat preparation or a mutation automatically. */
export async function withStaffingCommandReplay(actor: StaffingActor,
  request: { requestKey: string; action: string } & Record<string, unknown>, options: CommandOptions,
  execute: () => Promise<StaffingCommandResult>): Promise<StaffingCommandResult> {
  const existing = await tryStaffingCommandReplay(actor, request, options);
  if (existing) return existing;
  try { return await execute(); }
  catch (error) {
    if (error instanceof HttpFailure && error.status === 409) {
      const receipt = await tryStaffingCommandReplay(actor, request, options);
      if (receipt) return receipt;
    }
    throw error;
  }
}

/** Transactions must contain domain/DB work only. Receipts contain safe IDs/state. */
export async function runStaffingCommand(actor: StaffingActor,
  request: { requestKey: string; action: string } & Record<string, unknown>,
  options: CommandOptions, execute: (client: PoolClient) => Promise<StaffingCommandResult>,
  existingClient?: PoolClient): Promise<StaffingCommandResult> {
  parseStaffing(staffingRequestKeySchema, request.requestKey);
  let serialized: string;
  try { serialized = canonicalPlanJson(request); }
  catch { throw new HttpFailure(422, "invalid_input", "Invalid staffing request"); }
  if (Buffer.byteLength(serialized, "utf8") > STAFFING_LIMITS.revisionBytes) {
    throw new HttpFailure(413, "too_large", "Staffing request too large");
  }
  const startedAt = Date.now();
  let reusedReceipt = false;
  const digest = staffingSha256(request);
  const table = options.table ?? "staffing_command_receipts";
  const run = async (client: PoolClient): Promise<StaffingCommandResult> => {
    await client.query("SAVEPOINT staffing_command");
    try {
      await lockStaffingActor(client, actor, options.capability, {
        customerId: options.customerId, write: true, allowDisabled: options.allowDisabled });
      const prior = await client.query<{ request_digest: string; result_ids: unknown; receipt_table: string }>(
        `SELECT request_digest,result_ids,receipt_table FROM (
          SELECT request_digest,result_ids,'staffing_command_receipts' AS receipt_table,environment_id,workspace_id,actor_membership_id,request_key FROM staffing_command_receipts
          UNION ALL SELECT request_digest,result_ids,'workforce_command_receipts' AS receipt_table,environment_id,workspace_id,actor_membership_id,request_key FROM workforce_command_receipts
        ) receipts WHERE environment_id=$1
          AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, request.requestKey]);
      let result: StaffingCommandResult;
      if (prior.rows[0]) {
        reusedReceipt = true;
        if (prior.rows[0].receipt_table !== table || prior.rows[0].request_digest !== digest) throw new HttpFailure(409, "request_key_conflict", "Request key already used");
        await options.authorizeReplay?.(client);
        result = parseStaffing(resultSchema, prior.rows[0].result_ids);
      } else {
        result = resultSchema.parse(await execute(client));
        // Rate and receipt locks follow all domain locks. Rollback removes the domain
        // effects if either terminal reservation fails.
        await reserveStaffingRate(client, actor, options.rateKind ?? "write");
        const receiptScope = staffingSha256({ environment: getServerConfig().TURAS_ENVIRONMENT_ID,
          workspace: actor.workspaceId, actor: actor.membershipId, key: request.requestKey });
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)",
          [BigInt.asIntN(64, BigInt(`0x${receiptScope.slice(0, 16)}`)).toString()]);
        const collision = await client.query(`SELECT request_key FROM staffing_command_receipts
          WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4
          UNION ALL SELECT request_key FROM workforce_command_receipts
          WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
          [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, request.requestKey]);
        if (collision.rowCount) throw Object.assign(new Error("Receipt changed; retry rolled-back command"), { code: "23505" });
        const fields = table === "staffing_command_receipts" ? ",customer_id" : "";
        const values = table === "staffing_command_receipts" ? ",$9" : "";
        await client.query(`INSERT INTO ${table}
          (id,environment_id,workspace_id,actor_membership_id,request_key,action,request_digest,result_ids${fields})
          VALUES($1,$2,$3,$4,$5,$6,$7,$8${values})`,
          [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId,
            request.requestKey, request.action, digest, JSON.stringify(result),
            ...(table === "staffing_command_receipts" ? [options.customerId ?? null] : [])]);
      }
      await client.query("RELEASE SAVEPOINT staffing_command");
      return result;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT staffing_command");
      await client.query("RELEASE SAVEPOINT staffing_command");
      throw error;
    }
  };
  const complete = async () => {
    if (existingClient) {
      for (let attempt = 0; ; attempt += 1) {
        try { return await run(existingClient); }
        catch (error) {
          // The savepoint has rolled back every effect. A competing committed
          // receipt is now visible at READ COMMITTED; never retry external IO.
          if ((error as { code?: string }).code !== "23505") throw error;
          if (attempt >= 2) throw new HttpFailure(409, "conflict", "Staffing identity or request key already used");
        }
      }
    }
    for (let attempt = 0; ; attempt += 1) {
      try { return await withTransaction(run); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt >= 2 && code === "23505") throw new HttpFailure(409, "conflict", "Staffing identity or request key already used");
        if (attempt >= 2 || !["40001", "40P01", "55P03", "23505"].includes(code ?? "")) throw error;
        // Only explicit transaction failure is retried, never a lost COMMIT response.
      }
    }
  };
  let outcome: StaffingTelemetryInput["outcome"] = "failed", conflict: StaffingTelemetryInput["conflict"];
  try {
    const result = await complete();
    outcome = reusedReceipt ? "reused_receipt" : existingClient ? "validated" : "committed";
    return result;
  } catch (error) {
    if (error instanceof HttpFailure) {
      conflict = staffingConflictCategory(error.code) ?? undefined;
      outcome = error.status === 409 ? "conflict" : [401, 403, 404].includes(error.status) ? "denied" : "failed";
    }
    throw error;
  } finally {
    recordStaffingTelemetry({ operation: staffingCommandOperation(request.action), outcome,
      durationMs: Math.min(86_400_000, Math.max(0, Date.now() - startedAt)), ...(conflict ? { conflict } : {}) });
  }
}

export async function readStaffingCommandReceipt(actor: StaffingActor, rawKey: unknown,
  existingClient?: PoolClient): Promise<StaffingCommandResult> {
  const requestKey = parseStaffing(staffingRequestKeySchema, rawKey);
  const run = async (client: PoolClient) => {
    await lockStaffingActor(client, actor, "operational");
    for (const table of ["staffing_command_receipts", "workforce_command_receipts"] as const) {
      const metadata = await client.query<{ action: string; customer_id?: string | null }>(
        `SELECT action${table === "staffing_command_receipts" ? ",customer_id" : ""} FROM ${table}
          WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey]);
      const head = metadata.rows[0];
      if (!head) continue;
      const capability = table === "workforce_command_receipts" ? "manager" :
        head.action.startsWith("finance_") ? "finance" :
          head.action.startsWith("calendar_") || ["confirm", "amend", "release", "cancel", "calendar", "allocation_review_preview"].includes(head.action) ? "manager" : "operational";
      await lockStaffingActor(client, actor, capability, { customerId: head.customer_id ?? undefined });
      if (table === "staffing_command_receipts" && head.action === "advisory_prepare") {
        const bound = (await client.query(`SELECT b.mode,c.context_login_session_id,c.owner_principal_id FROM staffing_advisory_attempts a
          JOIN staffing_conversation_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
          WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.owner_membership_id=$3 AND a.request_key=$4`,
          [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey])).rows[0];
        if (!bound || bound.owner_principal_id !== actor.principalId || bound.context_login_session_id !== actor.sessionId) throw hiddenRecord();
        await lockStaffingActor(client, actor, bound.mode === "finance" ? "finance" : "operational");
      }
      if (table === "staffing_command_receipts" && ["allocation_revise", "allocation_cancel_proposal"].includes(head.action)) {
        const allocation = (await client.query(`SELECT a.created_by_membership_id,a.confirmed_revision_id FROM staffing_allocations a
          JOIN staffing_command_receipts receipt ON a.id=(receipt.result_ids->>'allocationId')::uuid
            AND a.environment_id=receipt.environment_id AND a.workspace_id=receipt.workspace_id
          WHERE receipt.environment_id=$1 AND receipt.workspace_id=$2 AND receipt.actor_membership_id=$3 AND receipt.request_key=$4`,
          [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey])).rows[0];
        if (!allocation) throw hiddenRecord();
        if ((head.action === "allocation_revise" && allocation.confirmed_revision_id !== null) ||
          allocation.created_by_membership_id !== actor.membershipId) await lockStaffingActor(client, actor, "manager");
      }
      const result = await client.query<{ result_ids: unknown }>(`SELECT result_ids FROM ${table}
        WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
        [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, requestKey]);
      return parseStaffing(resultSchema, result.rows[0]?.result_ids);
    }
    throw hiddenRecord();
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
