import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { executionContextCharge, type ExecutionReadTool } from "../../execution/advice";
import { executionDigest } from "./commands";
import type { boundExecutionToolActor } from "./tool-actor";
type Bound = Awaited<ReturnType<typeof boundExecutionToolActor>>;
function live(bound: Bound) {
  if (Date.now() >= bound.deadlineAt.getTime() || Date.now() >= bound.actor.expiresAt.getTime())
    throw new HttpFailure(409, "execution_advice_expired", "Execution explanation deadline reached");
}
/** Commit this reservation before running the read. A crashed reservation without
 * a settled payload stays unconfirmed; replay cannot execute it a second time. */
export async function reserveExecutionRead(db: PoolClient, bound: Bound, input: { callId: string; tool: ExecutionReadTool; request: unknown }) {
  if (!input.callId || input.callId.length > 200) throw new HttpFailure(400, "invalid_input", "Invalid native read identity");
  const digest = executionDigest({ tool: input.tool, request: input.request });
  const prior = (await db.query(`SELECT r.id,r.tool_name,r.request_digest,s.content_digest,p.result FROM execution_advice_reads r
    LEFT JOIN execution_advice_read_results s ON s.receipt_id=r.id LEFT JOIN execution_advice_read_payloads p ON p.receipt_id=r.id
    WHERE r.attempt_id=$1 AND r.call_id=$2`, [bound.attemptId, input.callId])).rows[0];
  if (prior) {
    if (prior.tool_name !== input.tool || prior.request_digest !== digest) throw new HttpFailure(409, "key_conflict", "Native read identity already used");
    live(bound);
    if (!prior.content_digest || prior.result === null || prior.result === undefined) return { state: "unconfirmed" as const, receiptId: prior.id as string };
    if (executionDigest(prior.result) !== prior.content_digest) throw new HttpFailure(409, "source_changed", "Saved execution read changed");
    return { state: "replayed" as const, receiptId: prior.id as string, result: prior.result as unknown };
  }
  const next = executionContextCharge(bound.counters, { bytes: 0, read: true, dependencyCount: bound.counters.dependencyCount });
  live(bound); const receiptId = randomUUID();
  await db.query(`INSERT INTO execution_advice_reads(id,attempt_id,call_id,tool_name,ordinal,request_digest) VALUES($1,$2,$3,$4,$5,$6)`,
    [receiptId, bound.attemptId, input.callId, input.tool, next.readCalls, digest]);
  await db.query("UPDATE execution_advice_attempts SET read_calls=$2 WHERE id=$1", [bound.attemptId, next.readCalls]);
  return { state: "admitted" as const, receiptId };
}
export async function storeExecutionRead(db: PoolClient, bound: Bound, receiptId: string, input: { callId: string; tool: ExecutionReadTool; request: unknown }, result: unknown) {
  const row = (await db.query("SELECT id,tool_name,request_digest FROM execution_advice_reads WHERE attempt_id=$1 AND call_id=$2", [bound.attemptId, input.callId])).rows[0];
  if (!row || row.id !== receiptId || row.tool_name !== input.tool || row.request_digest !== executionDigest({ tool: input.tool, request: input.request }))
    throw new HttpFailure(409, "source_changed", "Native read association changed");
  const serialized = JSON.stringify(result), bytes = Buffer.byteLength(serialized, "utf8");
  const next = executionContextCharge(bound.counters, { bytes, read: false, dependencyCount: bound.counters.dependencyCount });
  live(bound);
  await db.query("INSERT INTO execution_advice_read_results(receipt_id,bytes,content_digest) VALUES($1,$2,$3)", [receiptId, bytes, executionDigest(result)]);
  await db.query("INSERT INTO execution_advice_read_payloads(receipt_id,result) VALUES($1,$2)", [receiptId, serialized]);
  await db.query("UPDATE execution_advice_attempts SET context_bytes=$2 WHERE id=$1", [bound.attemptId, next.contextBytes]);
  live(bound); return result;
}
