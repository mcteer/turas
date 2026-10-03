import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ExecutionAdviceScope } from "../../execution/advice";
import { EXECUTION_ADVICE_LIMITS } from "../../execution/advice";
import { executionSkillMarkdown, executionProcedureVersion } from "../../execution/skill-text";
import { readExecutionIdentityContext } from "../profiles/context";
import { executionDigest } from "./commands";
import { lockExecutionActor, type ExecutionActor } from "./policy";
import { selectExecutionSummarySnapshot } from "./summary";

export type ExecutionDependency = { kind: string; dependencyId: string; revisionId: string | null; generation: number; contentDigest: string };
const changed = () => new HttpFailure(409, "source_changed", "Execution explanation inputs changed");
export function mergeExecutionDependencies(...groups: ExecutionDependency[][]) {
  const map = new Map<string, ExecutionDependency>();
  for (const dep of groups.flat()) {
    if (!Number.isSafeInteger(dep.generation) || dep.generation < 0 || !/^[a-f0-9]{64}$/.test(dep.contentDigest)) throw changed();
    const key = `${dep.kind}/${dep.dependencyId}`, prior = map.get(key);
    if (prior && executionDigest(prior) !== executionDigest(dep)) throw changed();
    map.set(key, dep);
  }
  if (map.size > EXECUTION_ADVICE_LIMITS.dependencies) throw new HttpFailure(429, "execution_context_budget", "Narrow the explanation evidence scope");
  return [...map.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.dependencyId.localeCompare(b.dependencyId));
}
/** Full current input closure, including absence/collection identities. All
 * authoritative source locks precede engagement and eventual native mutexes. */
export async function selectExecutionAdviceInputs(db: PoolClient, actor: ExecutionActor, scope: ExecutionAdviceScope, attemptId: string) {
  await lockExecutionActor(db, actor, scope.customerId, "advice", true);
  if (scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
  const identity = await readExecutionIdentityContext(actor, attemptId, db);
  if (identity.customer.id !== scope.customerId) throw hiddenRecord();
  const selected = await selectExecutionSummarySnapshot(db, actor, scope.engagementId, scope.period), { view, inputs } = selected;
  if (!view.initialized || view.reviewRequired || view.generation !== scope.generation || view.baselineId !== scope.baselineId) throw changed();
  const dependencies: ExecutionDependency[] = [];
  const add = (kind: string, dependencyId: string, generation: number, value: unknown, revisionId: string | null = null) =>
    dependencies.push({ kind, dependencyId, revisionId, generation, contentDigest: executionDigest(value) });
  add("execution_collection", scope.engagementId, view.generation, { records: inputs.records, status: inputs.status, state: view.state, period: scope.period });
  add("profile_collection", scope.customerId, Number(identity.contextVersion), identity);
  add("actor", actor.membershipId, 1, { principal: actor.principalId, workspace: actor.workspaceId, kind: actor.kind, role: actor.role });
  add("session", actor.sessionId, 1, { expiresAt: actor.expiresAt.toISOString(), member: actor.membershipId });
  for (const baseline of inputs.baselines) {
    add("baseline", baseline.id, Number(baseline.baseline_number), baseline, baseline.id);
    const plan = (await db.query("SELECT revision_id FROM milestone_baselines WHERE id=$1", [baseline.id])).rows[0];
    const sources = (await db.query(`SELECT source_kind,source_revision_id,source_generation,source_digest FROM plan_source_dependencies WHERE revision_id=$1
      UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,source_revision_id,source_generation,source_digest
      FROM plan_private_dependencies WHERE revision_id=$1`, [plan.revision_id])).rows;
    for (const source of sources) dependencies.push({ kind: source.source_kind, dependencyId: source.source_revision_id,
      revisionId: source.source_revision_id, generation: Number(source.source_generation), contentDigest: source.source_digest });
  }
  add("plan_head", inputs.baselines.find(b => b.id === scope.baselineId)!.plan_id, view.planVersion, { baseline: scope.baselineId, revision: view.baselineRevisionId }, view.baselineRevisionId);
  const pending = inputs.records.map(r => r.revision_id as string), seen = new Set<string>();
  while (pending.length) {
    const revisionId = pending.pop()!; if (seen.has(revisionId)) continue; seen.add(revisionId);
    if (seen.size > 200) throw new HttpFailure(429, "execution_context_budget", "Narrow the explanation evidence scope");
    const row = (await db.query("SELECT record_id,revision_number,content_digest FROM execution_record_revisions WHERE id=$1 AND engagement_id=$2", [revisionId, scope.engagementId])).rows[0];
    if (!row) throw changed();
    dependencies.push({ kind: "execution_record", dependencyId: revisionId, revisionId, generation: Number(row.revision_number), contentDigest: row.content_digest });
    const reviews = (await db.query("SELECT id,action,expected_version FROM execution_review_decisions WHERE revision_id=$1 ORDER BY created_at,id", [revisionId])).rows;
    add("record_reviews", revisionId, Math.max(1, reviews.length), reviews, revisionId);
    for (const source of (await db.query("SELECT source_kind,source_revision_id,source_generation,content_digest FROM execution_record_sources WHERE revision_id=$1", [revisionId])).rows) {
      dependencies.push({ kind: source.source_kind, dependencyId: source.source_revision_id, revisionId: source.source_revision_id,
        generation: Number(source.source_generation), contentDigest: source.content_digest });
      if (source.source_kind === "execution_record") pending.push(source.source_revision_id);
    }
  }
  for (const milestone of inputs.milestones) add("milestone", milestone.id, milestone.version, milestone);
  for (const head of inputs.effort.heads) add("effort_head", head.id, Number(head.version), head, head.revision_id);
  add("actual_ledger", scope.engagementId, view.generation, { digest: inputs.effort.actualDigest, mutations: inputs.effort.mutations });
  add("planned_period", scope.engagementId, view.generation, { confirmed: inputs.effort.plannedIdentity, tentative: inputs.effort.tentativeIdentity });
  const reconciliation = (await db.query("SELECT id,old_baseline_id,new_baseline_id,preview_digest,rationale_digest,created_at FROM execution_reconciliations WHERE engagement_id=$1 ORDER BY created_at,id", [scope.engagementId])).rows;
  add("reconciliation_collection", scope.engagementId, view.generation, reconciliation);
  add("procedure", scope.bindingId, 1, { version: executionProcedureVersion, markdown: executionSkillMarkdown });
  return { ...selected, identity, dependencies: mergeExecutionDependencies(dependencies) };
}
export async function readExecutionDependencies(db: PoolClient, attemptId: string): Promise<ExecutionDependency[]> {
  return mergeExecutionDependencies((await db.query("SELECT kind,dependency_id,revision_id,generation,content_digest FROM execution_advice_dependencies WHERE attempt_id=$1 ORDER BY kind,dependency_id", [attemptId])).rows
    .map(r => ({ kind: r.kind, dependencyId: r.dependency_id, revisionId: r.revision_id, generation: Number(r.generation), contentDigest: r.content_digest })));
}
export async function assertExecutionDependencies(db: PoolClient, attemptId: string, current: ExecutionDependency[]) {
  const consumed = await readExecutionDependencies(db, attemptId);
  if (!consumed.length || executionDigest(consumed) !== executionDigest(current)) throw changed();
  return consumed;
}
export async function insertExecutionDependencies(db: PoolClient, attemptId: string, dependencies: ExecutionDependency[]) {
  for (const dep of mergeExecutionDependencies(dependencies)) await db.query(`INSERT INTO execution_advice_dependencies
    (id,attempt_id,kind,dependency_id,revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), attemptId, dep.kind, dep.dependencyId, dep.revisionId, dep.generation, dep.contentDigest]);
}
