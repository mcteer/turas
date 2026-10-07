import { query, withTransaction } from "../lib/server/db/client";
import { requireOwnedSupportClone } from "./support-eval-environment";
import { supportDigest } from "../lib/server/support/commands";

const domainTables = ["support_records", "support_revisions", "support_payloads", "support_review_decisions",
  "support_decision_payloads", "support_command_receipts", "profile_records", "profile_revisions",
  "delivery_plans", "plan_revisions", "plan_decisions", "engagements", "milestone_baselines"] as const;

export async function supportLiveDomainDigests() {
  requireOwnedSupportClone();
  return withTransaction(async db => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const digests: Record<string, string> = {};
    for (const table of domainTables)
      digests[table] = supportDigest((await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows);
    return digests;
  });
}

/** Retain failed and uncertain attempts as well as successes. Provider secrets,
 * headers and arbitrary metadata are never queried. Missing usage stays null. */
export async function readSupportLiveEvidence(attemptId: string) {
  requireOwnedSupportClone();
  const attempt = (await query(`SELECT id,response_attempt_id,state,deadline_at,failure_code,model_steps,read_calls,
    context_bytes,dependency_count FROM support_advice_attempts WHERE id=$1 AND environment_id=$2`,
  [attemptId, process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if (!attempt) throw new Error("Owned support attempt unavailable");
  const payloads = (await query("SELECT kind,content_digest,payload FROM support_advice_payloads WHERE attempt_id=$1 ORDER BY kind", [attemptId])).rows;
  for (const item of payloads) if (supportDigest(item.payload) !== item.content_digest) throw new Error("Support capture payload changed");
  const steps = (await query(`SELECT s.id,s.ordinal,u.outcome,u.input_tokens,u.output_tokens,
    o.provider_path,o.max_output_tokens,o.prompt_digest,o.captured,o.io_started_at,o.cost_usd,o.generation_id,o.provider_finished_at,
    o.output_text,o.output_digest,o.finish_reason
    FROM support_model_step_receipts s LEFT JOIN support_advice_usage u ON u.step_id=s.id
    LEFT JOIN support_live_provider_observations o ON o.step_id=s.id WHERE s.attempt_id=$1 ORDER BY s.ordinal`, [attemptId])).rows;
  for (const item of steps) if (item.captured && supportDigest(item.captured) !== item.prompt_digest)
    throw new Error("Support provider input capture changed");
  const reads = (await query(`SELECT r.ordinal,r.tool_name,r.request_digest,p.payload FROM support_advice_reads r
    LEFT JOIN support_advice_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 ORDER BY r.ordinal`, [attemptId])).rows;
  if (steps.length !== attempt.model_steps || reads.length !== attempt.read_calls) throw new Error("Support capture receipt coverage mismatch");
  const injection = (await query(`SELECT r.snapshot_digest,i.snapshot_digest AS injected_digest,i.turn_id
    FROM context_snapshot_receipts r LEFT JOIN context_injection_receipts i ON i.attempt_id=r.attempt_id
    WHERE r.attempt_id=$1`, [attempt.response_attempt_id])).rows;
  const usageComplete = steps.length > 0 && steps.every(step => step.io_started_at && step.outcome === "confirmed" &&
    step.input_tokens !== null && step.input_tokens !== undefined && step.output_tokens !== null && step.output_tokens !== undefined);
  return { attempt, payloads, steps, reads, injection, usageComplete,
    inputTokens: usageComplete ? steps.reduce((sum, step) => sum + Number(step.input_tokens), 0) : null,
    outputTokens: usageComplete ? steps.reduce((sum, step) => sum + Number(step.output_tokens), 0) : null,
    costUsd: steps.length > 0 && steps.every(step => step.cost_usd !== null && step.cost_usd !== undefined)
      ? steps.reduce((sum, step) => sum + Number(step.cost_usd), 0) : null };
}
