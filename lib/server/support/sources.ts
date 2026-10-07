import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { lockOriginalHeader, verifyPlanSources } from "../plans/sources";
import { verifyExecutionSources } from "../execution/sources";
import type { SupportActor } from "./policy";
import type { SupportSource } from "./schema";
import { supportEngagementsSchema, supportSourcesSchema } from "./schema";
import { supportDigest } from "./commands";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../db/client";
import { lockSupportActor } from "./policy";
import { enforceSupportRate } from "./commands";
import { searchEvidence } from "../retrieval/search";
import { resolveRetrievalCitation } from "../retrieval/citations";

type OriginalKind = "accepted_profile" | "approved_excerpt" | "verified_research" | "shared_knowledge";
type DependencyIdentity = { kind: SupportSource["kind"]; revisionId: string; engagementId?: string };

/** Manual evidence discovery uses deterministic lexical retrieval, never a model,
 * embedding call or user-entered URL fetch. Audience is restricted before ranking. */
export async function searchSupportEvidence(actor: SupportActor, customerId: string,
  workloadId: string | null, audience: "internal" | "delivery", query: string) {
  await withTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "read", audience);
    await enforceSupportRate(db, actor, "read");
  });
  const found = await searchEvidence(actor, { scope: "combined", customerId, workloadId: workloadId ?? undefined,
    query, use: "discovery", limit: 10 }, { audience, workloadId, lexicalOnly: true });
  return withTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "read", audience);
    const results = [];
    for (const item of found.results) {
      const citation = await resolveRetrievalCitation(db, actor, item.citationId);
      const reference = supportSourcesSchema.parse([{ id: randomUUID(),
        kind: citation.sourceKind === "published_shared" ? "shared_knowledge" : citation.sourceKind,
        sourceRevisionId: citation.sourceRevisionId, generation: citation.sourceGeneration,
        contentDigest: citation.contentDigest, locator: citation.locators[0], citationId: citation.citationId }])[0]!;
      results.push({ title: item.title, text: citation.text, asOf: citation.asOf, quality: item.quality,
        caveats: item.caveats, reference });
    }
    return { results, warnings: found.completenessWarnings };
  });
}

export async function supportSelectedEngagements(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, selected: readonly string[], lock = false, audience: "internal" | "delivery" = "internal") {
  supportEngagementsSchema.parse(selected);
  // An explicitly empty selection has no identities to authorize or lock. This
  // does not select customer engagements implicitly or bypass source checks.
  if (selected.length === 0) return [];
  const rows = (await db.query<{ id: string; workload_id: string | null; active_baseline_id: string; execution_generation: string | null }>(
    `SELECT e.id,e.workload_id,e.active_baseline_id,x.generation AS execution_generation FROM engagements e
      LEFT JOIN execution_workspaces x ON x.engagement_id=e.id AND x.environment_id=e.environment_id
      AND x.workspace_id=e.workspace_id AND x.customer_id=e.customer_id WHERE e.id=ANY($1::uuid[])
      AND e.environment_id=$2 AND e.workspace_id=$3 AND e.customer_id=$4
       AND ($5::uuid IS NULL OR e.workload_id=$5) AND ($6='internal' OR e.audience='delivery')
       ORDER BY e.id ${lock ? "FOR UPDATE OF e" : ""}`,
     [selected, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, workloadId, audience])).rows;
  if (rows.length !== selected.length) throw hiddenRecord();
  return rows;
}

/** Current authority is held before metadata discovery. Private lineage never leaves this adapter. */
export async function dependencyUnion(db: PoolClient, actor: SupportActor, customerId: string,
  refs: readonly SupportSource[]): Promise<DependencyIdentity[]> {
  const pending: DependencyIdentity[] = refs.map(ref => ({ kind: ref.kind, revisionId: ref.sourceRevisionId,
    ...("engagementId" in ref ? { engagementId: ref.engagementId } : {}) }));
  const seen = new Map<string, DependencyIdentity>();
  while (pending.length) {
    const next = pending.pop()!, key = `${next.kind}:${next.revisionId}`;
    if (seen.has(key)) continue;
    seen.set(key, next);
    if (seen.size > 200) throw new HttpFailure(422, "scope_too_large", "Narrow the support evidence closure");
    if (next.kind === "execution_record") {
      const rows = (await db.query<{ source_kind: SupportSource["kind"]; source_revision_id: string }>(
        `SELECT source_kind,source_revision_id FROM execution_record_sources WHERE revision_id=$1
          AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
        [next.revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, next.engagementId])).rows;
      pending.push(...rows.map(row => ({ kind: row.source_kind, revisionId: row.source_revision_id, engagementId: next.engagementId })));
    } else if (next.kind === "milestone_baseline") {
      const row = (await db.query<{ revision_id: string }>(`SELECT revision_id FROM milestone_baselines
        WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND engagement_id=$5`,
      [next.revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, next.engagementId])).rows[0];
      if (!row) throw hiddenRecord();
      const dependencies = (await db.query<{ source_kind: OriginalKind; source_revision_id: string }>(
        `SELECT source_kind,source_revision_id FROM plan_source_dependencies WHERE revision_id=$1
          UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,
            source_revision_id FROM plan_private_dependencies WHERE revision_id=$1`, [row.revision_id])).rows;
      pending.push(...dependencies.map(dependency => ({ kind: dependency.source_kind, revisionId: dependency.source_revision_id })));
    } else if (next.kind === "shared_knowledge") {
      const dependencies = (await db.query<{ source_kind: OriginalKind | "published_shared"; source_revision_id: string }>(
        "SELECT source_kind,source_revision_id FROM knowledge_lineage WHERE revision_id=$1", [next.revisionId])).rows;
      pending.push(...dependencies.map(dependency => ({ kind: dependency.source_kind === "published_shared" ? "shared_knowledge" : dependency.source_kind,
        revisionId: dependency.source_revision_id })));
    }
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.revisionId.localeCompare(b.revisionId));
}

/** Hold authority before this call, originals before engagement/support heads. */
export async function verifySupportSources(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: "internal" | "delivery", selected: readonly string[],
  refs: readonly SupportSource[], lock = false): Promise<string> {
  supportSourcesSchema.parse(refs);
  const engagements = await supportSelectedEngagements(db, actor, customerId, workloadId, selected, false, audience);
  for (const ref of refs) if ("engagementId" in ref && !selected.includes(ref.engagementId)) throw hiddenRecord();
  const union = await dependencyUnion(db, actor, customerId, refs);
  if (lock) for (const dependency of union) if (!["execution_record", "milestone_baseline"].includes(dependency.kind))
    await lockOriginalHeader(db, dependency.kind as OriginalKind, dependency.revisionId);

  for (const ref of refs) if ("locator" in ref) {
    // Customer-wide scopes may select evidence from multiple workloads, but each
    // original is still checked with its own server-resolved workload identity.
    const kind = ref.kind === "shared_knowledge" ? "published_shared" : ref.kind;
    const rows = (await db.query<{ workload_id: string | null }>(`SELECT DISTINCT workload_id FROM retrieval_sources
      WHERE environment_id=$1 AND source_kind=$2 AND source_revision_id=$3 AND lifecycle_state='current'
        AND ((scope='shared' AND $2='published_shared') OR
          (scope='customer' AND workspace_id=$4 AND customer_id=$5 AND (audience='delivery' OR $6='internal')))
        AND ($7::uuid IS NULL OR workload_id IS NULL OR workload_id=$7)`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, kind, ref.sourceRevisionId, actor.workspaceId, customerId, audience, workloadId])).rows;
    if (rows.length !== 1) throw new HttpFailure(409, "source_changed", "Support evidence changed; choose current evidence");
    await verifyPlanSources(db, actor, customerId, workloadId ?? rows[0]!.workload_id, audience, [ref], false, true);
  }
  if (lock) {
    const locked = await supportSelectedEngagements(db, actor, customerId, workloadId, selected, true, audience);
    if (supportDigest(locked) !== supportDigest(engagements))
      throw new HttpFailure(409, "source_changed", "Selected engagement inputs changed; refresh support evidence");
  }
  for (const engagement of engagements) {
    const bound = refs.filter(ref => "engagementId" in ref && ref.engagementId === engagement.id);
    await verifyExecutionSources(db, actor, customerId, engagement.id, audience, bound, lock);
  }
  if (lock && supportDigest(await supportSelectedEngagements(db, actor, customerId, workloadId, selected, false, audience)) !== supportDigest(engagements))
    throw new HttpFailure(409, "source_changed", "Selected execution inputs changed; refresh support evidence");
  // Retrieval receipt IDs are transient lookup permissions, not original-source
  // identity. Persisted references intentionally omit them.
  const identities = refs.map(ref => "locator" in ref ? {
    id: ref.id, kind: ref.kind, sourceRevisionId: ref.sourceRevisionId, generation: ref.generation,
    contentDigest: ref.contentDigest, locator: ref.locator,
  } : ref);
  return supportDigest({ refs: identities.sort((a, b) => a.kind.localeCompare(b.kind) || a.sourceRevisionId.localeCompare(b.sourceRevisionId)),
    engagements: engagements.map(row => ({ id: row.id, baselineId: row.active_baseline_id, executionGeneration: row.execution_generation })), dependencyCount: union.length });
}
