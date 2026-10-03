import { HttpFailure } from "../../contracts/http";
import { executionToolInput, executionReadSchemas, type ExecutionReadTool } from "../../execution/advice";
import { executionSkillMarkdown } from "../../execution/skill-text";
import type { FeaturePrincipal } from "../conversations/feature";
import { executionTransaction } from "./commands";
import { boundExecutionToolActor } from "./tool-actor";
import { readChargedExecutionSnapshot } from "./initial-context";
import { reserveExecutionRead, storeExecutionRead } from "./read-budget";
import { executionCursor, readExecutionCursor } from "./previews";

export async function runExecutionRead(principal: FeaturePrincipal, tool: ExecutionReadTool, raw: unknown, callId: string): Promise<unknown> {
  const request = executionToolInput(tool, raw), input = { callId, tool, request };
  const admission = await executionTransaction(async db => {
    const bound = await boundExecutionToolActor(db, principal);
    await readChargedExecutionSnapshot(db, bound);
    return reserveExecutionRead(db, bound, input);
  });
  if (admission.state === "replayed") return admission.result;
  if (admission.state === "unconfirmed") throw new HttpFailure(409, "execution_read_unconfirmed", "A previous read has no confirmed result");
  return executionTransaction(async db => {
    const bound = await boundExecutionToolActor(db, principal), { summary, view, records, dependencies } = bound.current;
    await readChargedExecutionSnapshot(db, bound);
    let result: unknown;
    if (tool === "load_skill") result = executionSkillMarkdown;
    else if (tool === "execution_effort") result = { engagementId: view.engagementId, baselineId: view.baselineId, generation: view.generation,
      asOf: summary.asOf, period: summary.period, formulaVersion: summary.receipt.formulaVersion, effort: summary.effort,
      planEffortProvenance: summary.planEffortProvenance, citations: dependencies.filter(d => ["baseline", "actual_ledger", "effort_head", "planned_period", "reconciliation_collection"].includes(d.kind)) };
    else if (tool === "execution_summary") result = { engagementId: view.engagementId, baselineId: view.baselineId, generation: view.generation,
      asOf: summary.asOf, state: summary.state, reviewRequired: summary.reviewRequired, status: summary.status,
      milestones: view.milestones.map(m => ({ id: m.id, key: m.key, title: m.title, state: m.state, version: m.version, plannedDate: m.plannedDate, unknownDateReason: m.unknownPlannedDateReason })),
      citations: dependencies.filter(d => ["baseline", "milestone", "execution_record", "execution_collection"].includes(d.kind)) };
    else {
      const selected = executionReadSchemas.execution_records.parse(request);
      const scope = { feature: "execution-advice-v1", attempt: bound.attemptId, generation: bound.scope.generation, kind: selected.kind ?? null, limit: selected.limit };
      const cursor = readExecutionCursor(selected.cursor, scope);
      const eligible = records.filter(r => r.content && !r.reviewRequired && (!selected.kind || r.kind === selected.kind)).sort((a, b) => a.id.localeCompare(b.id));
      if (cursor && !eligible.some(r => r.id === cursor.lastId)) throw new HttpFailure(409, "source_changed", "Execution records changed");
      const start = cursor ? eligible.findIndex(r => r.id === cursor.lastId) + 1 : 0, page = eligible.slice(start, start + selected.limit), last = page.at(-1);
      result = { engagementId: view.engagementId, baselineId: view.baselineId, generation: view.generation, asOf: summary.asOf,
        records: page.map(r => ({ id: r.id, revisionId: r.revisionId, kind: r.kind, baselineId: r.baselineId, contentDigest: r.contentDigest, state: "accepted", content: r.content })),
        nextCursor: start + page.length < eligible.length && last ? executionCursor(scope, summary.asOf, last.id) : null,
        citations: dependencies.filter(d => d.kind === "execution_record" && page.some(r => r.revisionId === d.revisionId)) };
    }
    return storeExecutionRead(db, bound, admission.receiptId, input, result);
  });
}
