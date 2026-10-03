import {query,withTransaction} from "../lib/server/db/client";
import {requireOwnedExecutionClone} from "./execution-eval-environment";
import {executionDigest} from "../lib/server/execution/commands";
export const EXECUTION_EVAL_DOMAIN_TABLES=["execution_workspaces","execution_records","execution_record_revisions","execution_record_payloads","execution_record_sources",
  "execution_review_decisions","execution_review_payloads","execution_milestone_heads","execution_milestone_events","execution_milestone_payloads",
  "execution_reconciliations","execution_reconciliation_items","execution_reconciliation_payloads","execution_time_entries","execution_time_revisions","execution_time_payloads",
  "execution_time_decisions","execution_time_decision_payloads","execution_actual_days","execution_resource_days","execution_actual_package_heads","execution_effort_heads",
  "execution_command_receipts","profile_records","profile_revisions","research_requests","delivery_plans","plan_revisions","plan_decisions","engagements","milestone_baselines",
  "staffing_allocations","staffing_allocation_revisions","staffing_allocation_days","staffing_decisions","workforce_resources","workforce_resource_revisions","knowledge_publications"] as const;
export async function executionLiveDomainDigests(){
  requireOwnedExecutionClone();return withTransaction(async db=>{
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const hashes:Record<string,string>={};
    for(const table of EXECUTION_EVAL_DOMAIN_TABLES)hashes[table]=executionDigest((await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows);
    return hashes;
  });
}
/** Preserve raw actual metadata, even on a failed capture. Never manufacture a
 * terminal, tokens, a provider response, or a passing semantic assessment. */
export async function readExecutionLivePartialEvidence(attemptId:string){
  requireOwnedExecutionClone();
  const advice=(await query(`SELECT id,conversation_id,response_attempt_id,state,context_bytes,dependency_count,read_calls,model_steps,deadline_at,failure_code
    FROM execution_advice_attempts WHERE id=$1 AND environment_id=$2`,[attemptId,process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if(!advice)throw new Error("Owned partial attempt unavailable");
  const context=(await query("SELECT snapshot FROM execution_advice_context_payloads WHERE attempt_id=$1",[attemptId])).rows[0]?.snapshot??null;
  const dependencies=(await query("SELECT kind,dependency_id,revision_id,generation,content_digest FROM execution_advice_dependencies WHERE attempt_id=$1 ORDER BY kind,dependency_id",[attemptId])).rows;
  const tools=(await query(`SELECT r.id,r.ordinal,r.tool_name,r.request_digest,s.bytes,s.content_digest,p.result FROM execution_advice_reads r
    LEFT JOIN execution_advice_read_results s ON s.receipt_id=r.id LEFT JOIN execution_advice_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 ORDER BY r.ordinal`,[attemptId])).rows;
  const steps=(await query(`SELECT s.id,s.ordinal,s.step_token,u.native_event_id,u.event_type,u.input_tokens,u.output_tokens,u.outcome,
    o.provider_path,o.max_output_tokens,o.deadline_ms,o.prompt_digest,o.captured,o.io_started_at FROM execution_advice_steps s
    LEFT JOIN execution_advice_usage u ON u.step_id=s.id LEFT JOIN execution_live_provider_observations o ON o.step_id=s.id
    WHERE s.attempt_id=$1 ORDER BY s.ordinal`,[attemptId])).rows;
  const projections=advice.response_attempt_id?(await query(`SELECT p.native_event_id,p.event_type,p.turn_id,p.emitted_at,p.visible_payload FROM event_projections p
    JOIN response_attempts r ON r.conversation_id=p.conversation_id AND r.native_turn_id=p.turn_id WHERE r.id=$1 ORDER BY p.emitted_at,p.native_event_id`,[advice.response_attempt_id])).rows:[];
  return {advice,context,dependencies,tools,steps,projections};
}
export async function readExecutionLiveEvidence(attemptId:string){
  const raw=await readExecutionLivePartialEvidence(attemptId),a=raw.advice;
  const proof=(await query(`SELECT r.snapshot_digest,i.snapshot_digest AS injected_digest,i.turn_id FROM context_snapshot_receipts r
    JOIN context_injection_receipts i ON i.attempt_id=r.attempt_id WHERE r.attempt_id=$1`,[a.response_attempt_id])).rows;
  if(!raw.context||proof.length!==1||executionDigest(raw.context)!==proof[0].snapshot_digest||proof[0].injected_digest!==proof[0].snapshot_digest||
    raw.tools.length!==a.read_calls||raw.steps.length!==a.model_steps||raw.dependencies.length!==a.dependency_count)throw new Error("Execution actual receipt coverage changed");
  for(const t of raw.tools)if(t.content_digest&&executionDigest(t.result)!==t.content_digest)throw new Error("Execution captured read payload changed");
  for(const s of raw.steps)if(s.captured&&executionDigest(s.captured)!==s.prompt_digest)throw new Error("Execution captured provider input changed");
  return {...raw,turnId:proof[0].turn_id as string,steps:raw.steps.map(s=>({id:s.id,ordinal:s.ordinal,stepToken:s.step_token,
    usage:{source:s.input_tokens===null||s.output_tokens===null?"unknown":"reported",inputTokens:s.input_tokens===null?null:Number(s.input_tokens),outputTokens:s.output_tokens===null?null:Number(s.output_tokens)},
    provider:s.io_started_at?{path:s.provider_path,maxOutputTokens:s.max_output_tokens,deadlineMs:Number(s.deadline_ms),
      tools:s.captured.tools.map((t:{type?:string;name?:string})=>t.type==="function"?t.name:t.type),promptDigest:s.prompt_digest,captured:s.captured,ioStartedAt:s.io_started_at.toISOString()}:null}))};
}
