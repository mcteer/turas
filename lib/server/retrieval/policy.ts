import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { embeddingContractVersion, retrievalContractVersion } from "../../contracts/retrieval";
import { getServerConfig } from "../config";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { lockProfileActor } from "../profiles/policy";
import { knowledgeLineageIsCurrent, unsupportedProfileRevisionIds } from "../profiles/eligibility";

export const retrievalSchemaVersion = 28;
export const retrievalVectorDimension = 1_536;
export const retrievalVectorExtension = "0.8.6";

/** Operational rollback switch for 005 routes and new retrieval work. */
export function retrievalIntakeEnabled(): boolean {
  return process.env.TURAS_005_DISABLED !== "1";
}

/** Gate only 005 routes and workers. Earlier feature paths keep their own schema gate. */
export async function assertRetrievalReady(
  client: Pick<PoolClient, "query">,
  expectedEnvironment = getServerConfig().TURAS_ENVIRONMENT_ID,
): Promise<void> {
  if (!retrievalIntakeEnabled()) {
    throw new HttpFailure(503,"unavailable","Retrieval unavailable");
  }
  try {
    const result = await client.query<{
      environment_id: string;
      schema_version: number;
      vector_version: string | null;
      dimensions: string | null;
      sources: string | null;
      receipts: string | null;
    }>(`
      SELECT e.environment_id,e.schema_version,
        (SELECT extversion FROM pg_extension WHERE extname='vector') AS vector_version,
        (SELECT format_type(a.atttypid,a.atttypmod) FROM pg_attribute a
          WHERE a.attrelid=to_regclass('public.retrieval_passages')
            AND a.attname='embedding' AND NOT a.attisdropped) AS dimensions,
        to_regclass('public.retrieval_sources')::text AS sources,
        to_regclass('public.retrieval_receipts')::text AS receipts
      FROM turas_environment e LIMIT 1`);
    const state = result.rows[0];
    if (result.rowCount !== 1 || state?.environment_id !== expectedEnvironment ||
      state.schema_version < retrievalSchemaVersion ||
      state.vector_version !== retrievalVectorExtension ||
      state.dimensions !== `vector(${retrievalVectorDimension})` ||
      !state.sources || !state.receipts ||
      retrievalContractVersion !== "retrieval-v1" ||
      embeddingContractVersion !== "embedding-v1") {
      throw new Error("retrieval prerequisite missing");
    }
  } catch {
    throw new HttpFailure(503, "unavailable", "Retrieval unavailable");
  }
}

export type AuthorizedRetrievalScope = {
  environmentId: string;
  workspaceId: string | null;
  customerId: string | null;
  audience: "internal" | "delivery";
  includeShared: boolean;
};

export async function authorizeRetrievalScope(client: PoolClient, actor: CurrentSession,
  scope: "customer" | "shared" | "combined", customerId?: string,
  effectiveAudience?:"internal"|"delivery",readOnly=false): Promise<AuthorizedRetrievalScope> {
  await assertRetrievalReady(client);
  const active = await client.query(`SELECT 1 FROM memberships m
    JOIN principals p ON p.id=m.principal_id AND p.active
    JOIN workspaces w ON w.id=m.workspace_id AND w.active
    JOIN login_sessions ls ON ls.id=$2 AND ls.principal_id=p.id
      AND ls.revoked_at IS NULL AND ls.expires_at>now()
    LEFT JOIN partner_organizations o ON o.id=m.partner_org_id
      AND o.workspace_id=m.workspace_id
    WHERE m.id=$1 AND m.principal_id=$3 AND m.workspace_id=$4 AND m.active
      AND m.kind=$5 AND m.role=$6 AND (m.kind='internal' OR o.active)`,
    [actor.membershipId, actor.sessionId, actor.principalId, actor.workspaceId,
      actor.kind, actor.role]);
  if (!active.rowCount) throw new HttpFailure(401, "unauthorized", "Sign in again");
  if (actor.kind==="partner" && effectiveAudience==="internal") throw hiddenRecord();
  if (scope !== "shared") {
    if (!customerId) throw hiddenRecord();
    await lockProfileActor(client, actor, customerId, undefined, readOnly);
  }
  return {
    environmentId: getServerConfig().TURAS_ENVIRONMENT_ID,
    workspaceId: scope === "shared" ? null : actor.workspaceId,
    customerId: scope === "shared" ? null : customerId ?? null,
    audience: effectiveAudience ?? (actor.kind === "internal" ? "internal" : "delivery"),
    includeShared: scope !== "customer",
  };
}

/** Recheck original source and projection generation after ranking and before output. */
export async function recheckRetrievalSource(client: PoolClient,
  source: { id: string; kind: string; revisionId: string; generation: number;
    audience: string; contentDigest: string; projectionContract: string },
  scope: AuthorizedRetrievalScope): Promise<boolean> {
  const projected = await client.query<{ source_revision_id: string }>(`
    SELECT source_revision_id FROM retrieval_sources
    WHERE id=$1 AND environment_id=$2 AND source_kind=$3 AND source_revision_id=$4
      AND source_generation=$5 AND audience=$6 AND content_digest=$7
      AND projection_contract=$12
      AND lifecycle_state='current' AND
      ((scope='shared' AND $8::boolean AND workspace_id IS NULL AND customer_id IS NULL)
       OR (scope='customer' AND workspace_id=$9 AND customer_id=$10
         AND (audience='delivery' OR $11='internal')))`,
  [source.id, scope.environmentId, source.kind, source.revisionId,
    source.generation, source.audience, source.contentDigest,
    scope.includeShared, scope.workspaceId, scope.customerId, scope.audience,
    source.projectionContract]);
  if (!projected.rowCount) return false;
  if (source.kind === "accepted_profile") {
    const current = await client.query(`SELECT 1 FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
        AND v.revision_number=$5
        AND (v.audience='delivery' OR $4='internal')
        AND ($4='internal' OR NOT EXISTS (SELECT 1 FROM profile_evidence_links l
          LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id
          LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id
          LEFT JOIN artifact_evidence_selections selection ON selection.id=l.artifact_selection_id
          WHERE l.profile_revision_id=v.id AND d.partner_safe_attestation IS NULL AND
            ((source.id IS NOT NULL AND source.audience<>'delivery') OR
             (support.id IS NOT NULL AND
               (support.audience<>'delivery' OR support.data_category<>'delivery_context')) OR
             (selection.id IS NOT NULL AND
               (selection.audience<>'delivery' OR selection.data_category<>'delivery_context')))))`,
    [source.revisionId, scope.workspaceId, scope.customerId, scope.audience,
      source.generation]);
    return Boolean(current.rowCount) &&
      !(await unsupportedProfileRevisionIds(client, [source.revisionId], true)).has(source.revisionId);
  }
  if (source.kind === "approved_excerpt") {
    const current = await client.query(`SELECT 1 FROM artifact_evidence_selections s
      JOIN artifact_versions v ON v.id=s.version_id
        AND v.lifecycle_generation=s.lifecycle_generation
        AND v.sha256_digest=s.original_digest AND v.state IN ('ready','partial')
      JOIN artifact_extraction_runs r ON r.id=s.run_id AND r.state='published'
      JOIN artifact_evidence_payloads ep ON ep.selection_id=s.id
      JOIN profile_revisions pr ON pr.id=s.profile_revision_id
      JOIN profile_records p ON p.id=pr.record_id AND p.current_accepted_revision_id=pr.id
      WHERE s.id=$1 AND s.workspace_id=$2 AND s.customer_id=$3
        AND v.lifecycle_generation=$5
        AND (s.audience='delivery' OR $4='internal')`,
    [source.revisionId, scope.workspaceId, scope.customerId, scope.audience,
      source.generation]);
    return Boolean(current.rowCount);
  }
  if (source.kind === "verified_research") {
    const current = await client.query(`SELECT 1 FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks c ON c.source_revision_id=v.id
      WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
        AND v.version=$5
        AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
        AND (v.audience='delivery' OR $4='internal')
        AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
          WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))`,
    [source.revisionId, scope.workspaceId, scope.customerId, scope.audience,
      source.generation]);
    return Boolean(current.rowCount);
  }
  if (source.kind === "published_shared") {
    const current = await client.query(`SELECT 1 FROM knowledge_publications p
      JOIN knowledge_revision_payloads payload ON payload.revision_id=p.revision_id
      WHERE p.revision_id=$1 AND p.environment_id=$2 AND p.state='published'
        AND p.head_generation=$3`,
    [source.revisionId, scope.environmentId, source.generation]);
    return Boolean(current.rowCount) && await knowledgeLineageIsCurrent(client, source.revisionId);
  }
  return false;
}
