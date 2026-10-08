import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { retrievalQuality } from "../retrieval/context";
import type { SupportActor } from "./policy";
import type { SupportSource } from "./schema";

/** Only call after verifySupportSources has locked and qualified the exact
 * selection. Keep original dates distinct from projection/retrieval time. */
export async function captureSupportEvidence(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: "internal" | "delivery", refs: readonly SupportSource[]) {
  const evidence = [];
  for (const source of refs) {
    const { citationId: _permission, ...reference } = "citationId" in source ? source : { ...source, citationId: undefined };
    if ("locator" in source) {
      const row = (await db.query(`SELECT p.passage_text,
        COALESCE(v.payload->>'observedAt',v.payload->>'observationEnd',r.observation_at::text) AS observation_date,
        COALESCE(r.publication_at,k.published_at) AS publication_date,COALESCE(v.quality_input,r.quality_input) AS quality_input,
        v.payload->>'reviewAt' AS review_at,k.public_quality
        FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
        LEFT JOIN artifact_evidence_selections a ON s.source_kind='approved_excerpt' AND a.id=s.source_revision_id
        LEFT JOIN profile_revisions v ON v.id=CASE WHEN s.source_kind='approved_excerpt' THEN a.profile_revision_id
          WHEN s.source_kind='accepted_profile' THEN s.source_revision_id END
        LEFT JOIN evidence_source_revisions r ON s.source_kind='verified_research' AND r.id=s.source_revision_id
        LEFT JOIN knowledge_publications k ON s.source_kind='published_shared' AND k.revision_id=s.source_revision_id AND k.state='published'
        WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3 AND s.source_generation=$4
          AND s.content_digest=$5 AND s.lifecycle_state='current' AND p.locators @> $6::jsonb
          AND ((s.scope='shared' AND $2='published_shared') OR (s.scope='customer' AND s.workspace_id=$7 AND s.customer_id=$8
            AND ($9::uuid IS NULL OR s.workload_id IS NULL OR s.workload_id=$9) AND (s.audience='delivery' OR $10='internal')))
        ORDER BY p.ordinal LIMIT 1`, [getServerConfig().TURAS_ENVIRONMENT_ID,
        source.kind === "shared_knowledge" ? "published_shared" : source.kind, source.sourceRevisionId, source.generation,
        source.contentDigest, JSON.stringify([source.locator]), actor.workspaceId, customerId, workloadId, audience])).rows[0];
      if (!row) throw new HttpFailure(409, "support_context_changed", "Selected evidence is no longer available");
      const observationDate = row.observation_date ? new Date(row.observation_date).toISOString() : null;
      const publicationDate = row.publication_date ? new Date(row.publication_date).toISOString() : null;
      const quality = row.public_quality ?? retrievalQuality(row.quality_input, {
        observationAt: observationDate ? new Date(observationDate) : null,
        publicationAt: publicationDate ? new Date(publicationDate) : null,
        reviewAt: row.review_at ? new Date(row.review_at) : null,
      });
      evidence.push({ citationKey: source.id, reference, text: row.passage_text as string, observationDate, publicationDate, quality });
    } else {
      const row = source.kind === "execution_record"
        ? (await db.query(`SELECT p.content,v.event_date::text AS observation_date FROM execution_record_revisions v
          JOIN execution_records r ON r.accepted_revision_id=v.id JOIN execution_record_payloads p ON p.revision_id=v.id
          WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5
            AND (v.audience='delivery' OR $6='internal')`,
        [source.sourceRevisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, source.engagementId, audience])).rows[0]
        : (await db.query(`SELECT p.content,b.accepted_at::text AS observation_date FROM milestone_baselines b
          JOIN milestone_baseline_payloads p ON p.baseline_id=b.id JOIN engagements e ON e.active_baseline_id=b.id
          WHERE b.id=$1 AND b.environment_id=$2 AND b.workspace_id=$3 AND b.customer_id=$4 AND b.engagement_id=$5
            AND (e.audience='delivery' OR $6='internal')`,
        [source.sourceRevisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, source.engagementId, audience])).rows[0];
      if (!row) throw new HttpFailure(409, "support_context_changed", "Selected execution evidence is no longer available");
      evidence.push({ citationKey: source.id, reference, text: JSON.stringify(row.content),
        observationDate: row.observation_date as string, publicationDate: null, quality: null });
    }
  }
  return evidence;
}
