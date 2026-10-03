import type { PoolClient } from "pg";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { executionId as executionIdSchema } from "./fields";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockExecutionActor, type ExecutionActor } from "./policy";

import { prepareExecutionNativeRelease, assertExecutionNativeRelease } from "./native-release";

async function ownedStatus(db: PoolClient, actor: ExecutionActor, attemptId: string) {
  const row = (await db.query(`SELECT a.*,b.customer_id,b.engagement_id,b.baseline_id,b.generation,
    c.creation_operation_id,c.eve_session_id,c.context_login_session_id,c.context_membership_id,
    r.dispatch_state,r.response_state,r.native_turn_id,j.state AS watchdog_state
    FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id
    JOIN conversations c ON c.id=a.conversation_id LEFT JOIN response_attempts r ON r.id=a.response_attempt_id
    LEFT JOIN watchdog_jobs j ON j.attempt_id=r.id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3
      AND a.owner_membership_id=$4 AND c.owner_principal_id=$5`,
    [attemptId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, actor.principalId])).rows[0];
  if (!row || row.context_login_session_id !== actor.sessionId || row.context_membership_id !== actor.membershipId) throw hiddenRecord();
  await lockExecutionActor(db, actor, row.customer_id, "read");
  const usage = (await db.query(`SELECT count(*)::int AS admitted,
    count(u.input_tokens)::int AS reported_input,count(u.output_tokens)::int AS reported_output,
    sum(u.input_tokens)::text AS input_tokens,sum(u.output_tokens)::text AS output_tokens
    FROM execution_advice_steps s LEFT JOIN execution_advice_usage u ON u.step_id=s.id
    WHERE s.attempt_id=$1`,
    [attemptId])).rows[0];
  const total = (key: "input" | "output") => usage.admitted > 0 && usage[`reported_${key}`] === usage.admitted
    && Number.isSafeInteger(Number(usage[`${key}_tokens`])) ? Number(usage[`${key}_tokens`]) : null;
  return { attemptId: row.id as string, conversationId: row.conversation_id as string,
    operationId: row.creation_operation_id as string, nativeRequestId: row.native_request_id as string | null,
    nativeSessionId: row.eve_session_id as string | null, responseAttemptId: row.response_attempt_id as string | null,
    nativeTurnId: row.native_turn_id as string | null, customerId: row.customer_id as string,
    engagementId: row.engagement_id as string, baselineId: row.baseline_id as string, generation: Number(row.generation), state: row.state as string,
    dispatchState: row.dispatch_state as string | null, responseState: row.response_state as string | null,
    deadlineAt: row.deadline_at?.toISOString() as string | undefined ?? null, failureCode: row.failure_code as string | null,
    watchdogState: row.watchdog_state as string | null, stepsAdmitted: Number(row.model_steps), readCalls: Number(row.read_calls),
    contextBytes: Number(row.context_bytes), dependencyCount: Number(row.dependency_count),
    inputTokens: total("input"), outputTokens: total("output") };
}

/** Status is an owner-only metadata projection. Model text and instructions
 * never pass through it, including when sources are withdrawn or disabled. */
export async function readExecutionAdviceStatus(actor: ExecutionActor, rawId: unknown) {
  const attemptId = executionIdSchema.parse(rawId);
  const status = await withTransaction(db => ownedStatus(db, actor, attemptId));
  let outputReadable = false, fenced = false;
  if (status.responseAttemptId && status.nativeTurnId && ["running", "completed"].includes(status.state)) {
    try {
      const prepared = await prepareExecutionNativeRelease(status.conversationId, { actor, responseAttemptId: status.responseAttemptId });
      if (!prepared) throw hiddenRecord();
      await withTransaction(db => assertExecutionNativeRelease(db, prepared, actor));
      outputReadable = true;
    } catch (error) {
      if (!(error instanceof HttpFailure) || ![401, 403, 404, 409, 503].includes(error.status)) throw error;
      fenced = true;
    }
  }
  return { ...status, outputReadable, fenced };
}

/** A stop is durable before any native cancellation RPC. Source validity is
 * deliberately unnecessary to suppress output; current owner authority is not. */
export async function cancelExecutionAdvice(actor: ExecutionActor, rawId: unknown) {
  const attemptId = executionIdSchema.parse(rawId);
  await withTransaction(async db => {
    const status = await ownedStatus(db, actor, attemptId);
    await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [status.conversationId]);
    if (status.responseAttemptId) {
      await db.query("SELECT id FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE", [status.responseAttemptId, status.conversationId]);
    }
    const advice = (await db.query("SELECT state FROM execution_advice_attempts WHERE id=$1 FOR UPDATE", [attemptId])).rows[0];
    if (!advice) throw hiddenRecord();
    if (!["prepared", "running", "unconfirmed"].includes(advice.state)) return;
    if (status.responseAttemptId) await db.query(`UPDATE response_attempts SET
      response_state=CASE WHEN native_turn_id IS NULL AND dispatch_state='prepared' THEN 'cancelled' ELSE 'stopping' END,
      updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND response_state IN ('pending','running','stopping')`, [status.responseAttemptId]);
    await db.query(`UPDATE execution_advice_attempts SET state='cancelled',failure_code='cancelled',
      settled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`, [attemptId]);
  });
  return readExecutionAdviceStatus(actor, attemptId);
}
