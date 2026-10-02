import { createHash } from "node:crypto";
import { query, withTransaction } from "../lib/server/db/client";
import { requireOwnedStaffingClone } from "./staffing-eval-environment";
import type { StaffingLiveWriteReceipt } from "./staffing-live-writes";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readStaffingLiveWriteReceipts(): Promise<StaffingLiveWriteReceipt[]> {
  requireOwnedStaffingClone();
  return withTransaction(async db => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const receipts: StaffingLiveWriteReceipt[] = [];
    for (const table of ["workforce_command_receipts", "staffing_command_receipts"]) {
      for (const row of (await db.query(`SELECT id,action,actor_membership_id,request_key,to_jsonb(t) AS receipt
        FROM ${table} t ORDER BY id`)).rows) receipts.push({ id: row.id, receipt_table: table, action: row.action,
        actor_membership_id: row.actor_membership_id, request_key: row.request_key, digest: hash(row.receipt) });
    }
    return receipts;
  });
}
/** Preserve failed/partial real captures before disposing their owned database.
 * Missing association/usage remains missing; this is never a passing record. */
export async function readStaffingLivePartialEvidence(attemptId: string) {
  requireOwnedStaffingClone();
  const advice = (await query(`SELECT id,conversation_id,response_attempt_id,state,context_bytes,dependency_count,read_calls,model_steps,
    deadline_at,failure_code FROM staffing_advisory_attempts WHERE id=$1 AND environment_id=$2`,
  [attemptId, process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if (!advice) throw new Error("Owned partial attempt unavailable");
  const context = advice.response_attempt_id ? (await query("SELECT snapshot,snapshot_digest FROM context_snapshot_receipts WHERE attempt_id=$1",
    [advice.response_attempt_id])).rows : [];
  const tools = (await query(`SELECT r.id,r.ordinal,r.tool_name,p.result FROM staffing_advisory_read_receipts r
    LEFT JOIN staffing_advisory_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 ORDER BY r.ordinal`, [attemptId])).rows;
  const observations = (await query(`SELECT step_receipt_id,turn_id,step_index,provider_path,max_output_tokens,content_digest,captured
    FROM staffing_live_provider_observations WHERE attempt_id=$1 ORDER BY step_index`, [attemptId])).rows;
  const steps = (await query(`SELECT s.id,s.ordinal,s.step_token,u.native_event_id,u.event_type,u.input_tokens,u.output_tokens
    FROM staffing_model_step_receipts s LEFT JOIN staffing_model_step_usage_receipts u ON u.step_receipt_id=s.id
    WHERE s.attempt_id=$1 ORDER BY s.ordinal`, [attemptId])).rows;
  const nativeFailures = advice.response_attempt_id ? (await query(`SELECT p.event_type,p.visible_payload->>'code' AS code,
    p.visible_payload->>'errorName' AS error_name,p.visible_payload->>'semanticErrorId' AS semantic_error_id,
    p.visible_payload->>'statusCode' AS status_code,p.visible_payload->>'domainCode' AS domain_code
    FROM event_projections p JOIN response_attempts r ON r.conversation_id=p.conversation_id
    WHERE r.id=$1 AND p.turn_id=r.native_turn_id AND p.event_type IN ('step.failed','turn.failed')
    ORDER BY p.emitted_at,p.native_event_id`, [advice.response_attempt_id])).rows : [];
  return { state: "partial-not-reviewed", advice, context, tools, observations, steps, nativeFailures };
}
/** Owned synthetic data only. Include every customer's commitments so a hidden
 * write cannot pass by leaving the bound demand unchanged. No names or payloads
 * are returned from this ledger fingerprint. */
export async function staffingLiveLedgerDigest() {
  requireOwnedStaffingClone();
  return withTransaction(async db => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = ["staffing_allocations", "staffing_allocation_revisions", "staffing_allocation_days",
      "staffing_capacity_days", "staffing_demand_days", "staffing_decisions", "staffing_allocation_events"];
    const digests: string[] = [];
    for (const table of tables) {
      const rows = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
      digests.push(hash(rows));
    }
    return hash(digests);
  });
}

/** Capture actual durable snapshots/results and observed provider inputs. These
 * are evidence for review, not inferred semantic grades or provider completions. */
export async function readStaffingLiveEvidence(attemptId: string) {
  requireOwnedStaffingClone();
  const response = (await query(`SELECT a.response_attempt_id,a.context_bytes,a.dependency_count,a.read_calls,a.model_steps,
    a.state,r.native_turn_id FROM staffing_advisory_attempts a JOIN response_attempts r ON r.id=a.response_attempt_id
    WHERE a.id=$1 AND a.environment_id=$2`, [attemptId, process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if (!response?.response_attempt_id || !response.native_turn_id) throw new Error("Actual live association unavailable");
  const context = (await query("SELECT snapshot,snapshot_digest FROM context_snapshot_receipts WHERE attempt_id=$1",
    [response.response_attempt_id])).rows;
  const injections = (await query("SELECT turn_id,snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1",
    [response.response_attempt_id])).rows;
  const tools = (await query(`SELECT r.id,r.ordinal,r.tool_name,p.result FROM staffing_advisory_read_receipts r
    LEFT JOIN staffing_advisory_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 ORDER BY r.ordinal`, [attemptId])).rows;
  const observations = (await query(`SELECT step_receipt_id,turn_id,step_index,provider_path,max_output_tokens,content_digest,captured
    FROM staffing_live_provider_observations WHERE attempt_id=$1 ORDER BY step_index`, [attemptId])).rows;
  const steps = (await query(`SELECT s.id AS receipt_id,s.ordinal,s.step_token,u.native_event_id,u.event_type,u.input_tokens,u.output_tokens
    FROM staffing_model_step_receipts s LEFT JOIN staffing_model_step_usage_receipts u ON u.step_receipt_id=s.id
    WHERE s.attempt_id=$1 ORDER BY s.ordinal`, [attemptId])).rows;
  const nativeTerminals = (await query(`SELECT p.native_event_id,p.event_type,p.turn_id,p.emitted_at FROM event_projections p
    JOIN response_attempts r ON r.conversation_id=p.conversation_id AND r.native_turn_id=p.turn_id
    WHERE r.id=$1 AND p.event_type IN ('turn.completed','turn.failed','turn.cancelled') ORDER BY p.emitted_at,p.native_event_id`,
  [response.response_attempt_id])).rows;
  if (context.length !== 1 || injections.length !== 1 || injections[0].turn_id !== response.native_turn_id ||
    injections[0].snapshot_digest !== context[0].snapshot_digest || !steps.length || steps.length > 6 ||
    steps.length !== response.model_steps || tools.length !== response.read_calls || tools.length > 6 ||
    response.context_bytes < 1 || response.context_bytes > 24576 || response.dependency_count < 1 || response.dependency_count > 200 ||
    observations.length !== steps.length) throw new Error("Actual live receipt coverage or budget failed");
  const allowed = new Set(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "load_skill"]);
  const binding = (await query(`SELECT b.mode FROM staffing_advisory_attempts a JOIN staffing_conversation_bindings b ON b.id=a.binding_id
    WHERE a.id=$1`, [attemptId])).rows[0];
  if (binding?.mode === "finance") allowed.add("read_staffing_scenario");
  for (const [index, step] of steps.entries()) {
    const observation = observations[index];
    if (step.ordinal !== index + 1 || step.step_token !== `${response.native_turn_id}/${index}` ||
      observation.step_receipt_id !== step.receipt_id || observation.turn_id !== response.native_turn_id || observation.step_index !== index ||
      observation.max_output_tokens < 1 || observation.max_output_tokens > 4096 ||
      step.output_tokens !== null && Number(step.output_tokens) > observation.max_output_tokens ||
      !Array.isArray(observation.captured?.tools) || observation.captured.tools.some((tool: { type?: string; name?: string }) =>
        tool.type !== "function" || !tool.name || !allowed.has(tool.name))) throw new Error("Actual live paid identity or catalog failed");
  }
  return { response, context: context[0].snapshot, tools, steps, observations, nativeTerminals };
}
