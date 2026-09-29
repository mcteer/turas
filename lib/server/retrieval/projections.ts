import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { profilePayloadSchema } from "../../contracts/profile-payloads";
import { getServerConfig } from "../config";
import { unsupportedProfileRevisionIds } from "../profiles/eligibility";
import { approvedArtifactUnitChunks } from "../profiles/artifact-excerpts";
import { citationLocatorSchema } from "../../contracts/retrieval";
import { passageDigest,collapseDuplicateChunks,type RetrievalChunk } from "./chunker";
import { enqueueRetrievalJob } from "./jobs";
import { sanitizedKnowledgeSchema } from "../../contracts/knowledge";
import { knowledgeLineageIsCurrent } from "../profiles/eligibility";

export const projectionContract = "retrieval-projection-v1";
export const projectionContractDigest = createHash("sha256")
  .update(`${projectionContract}:nfc:approved-unit:no-overlap:2000:duplicate-locators`).digest("hex");

/** Tombstone a source synchronously; cleanup can remove its copy later. */
export async function retireRetrievalProjection(client: PoolClient,
  kind: "accepted_profile" | "approved_excerpt" | "verified_research" | "published_shared",
  revisionId: string,environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<number> {
  const marker = await client.query<{ schema_version: number }>(`
    SELECT schema_version FROM turas_environment WHERE environment_id=$1`,[environmentId]);
  if ((marker.rows[0]?.schema_version ?? 0) < 19) return 0;
  const retired = await client.query<{ id: string }>(`UPDATE retrieval_sources
    SET lifecycle_state='retired',updated_at=now()
    WHERE environment_id=$1 AND source_kind=$2 AND source_revision_id=$3
      AND lifecycle_state='current' RETURNING id`,[environmentId,kind,revisionId]);
  for (const source of retired.rows) await enqueueRetrievalJob(client,source.id,"cleanup",environmentId);
  return retired.rows.length;
}

type SourceCandidate = {
  environmentId: string; workspaceId: string; customerId: string;
  workloadId: string | null; sourceKind: "accepted_profile" | "approved_excerpt" | "verified_research";
  revisionId: string; audience: "internal" | "delivery"; generation: number;
  chunks: RetrievalChunk[];
};

const narrativeKeys = new Set([
  "businessDescription","objectives","purpose","boundaries","responsibilities",
  "usageDescription","rationale","nextCapability","description","severityRationale",
  "mitigation","statement","measure","baseline","comparison","action","text",
  "sourceExcerpt","title","displayName","category","status","state",
]);

function profileNarratives(value: unknown, audience: "internal" | "delivery",
  path = ""): Array<{ path: string; text: string }> {
  if (!value || typeof value !== "object") return [];
  const result: Array<{ path: string; text: string }> = [];
  for (const [key, entry] of Object.entries(value)) {
    const current = path ? `${path}.${key}` : key;
    if (audience === "delivery" && key === "sourceExcerpt") continue;
    if (typeof entry === "string" && narrativeKeys.has(key) && entry.trim()) {
      result.push({ path: current,text: entry });
    } else if (Array.isArray(entry)) {
      entry.forEach((part,index) => {
        if (typeof part === "string" && narrativeKeys.has(key) && part.trim()) {
          result.push({ path: `${current}.${index}`,text: part });
        } else if (typeof part === "object") result.push(...profileNarratives(part,audience,`${current}.${index}`));
      });
    } else if (typeof entry === "object") result.push(...profileNarratives(entry,audience,current));
  }
  return result;
}

function simpleChunks(text: string, locator: (start: number,end: number) => unknown): RetrievalChunk[] {
  const characters = Array.from(text);
  const chunks: RetrievalChunk[] = [];
  for (let start = 0; start < characters.length; start += 2_000) {
    const end = Math.min(start + 2_000,characters.length);
    const passage = characters.slice(start,end).join("");
    if (!passage.trim()) continue;
    chunks.push({ text: passage,digest: passageDigest(passage),
      locators: [citationLocatorSchema.parse(locator(start,end))],warnings: [] });
  }
  return chunks;
}

export async function buildCurrentProjection(client: PoolClient,
  kind: SourceCandidate["sourceKind"], revisionId: string,
  audience: SourceCandidate["audience"],
  environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<SourceCandidate | null> {
  if (kind === "accepted_profile") {
    const found = await client.query<{ workspace_id: string; customer_id: string;
      workload_id: string | null; revision_number: string; payload: unknown;
      data_category: string; review_decision: string | null;
      restricted_support: boolean; partner_safe_attestation: string | null }>(`
      SELECT v.workspace_id,v.customer_id,r.workload_id,v.revision_number,
        v.payload,v.data_category,d.decision AS review_decision,
        d.partner_safe_attestation,
        EXISTS (SELECT 1 FROM profile_evidence_links l
          LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id
          LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id
          LEFT JOIN artifact_evidence_selections selection ON selection.id=l.artifact_selection_id
          WHERE l.profile_revision_id=v.id AND
            ((source.id IS NOT NULL AND source.audience<>'delivery') OR
             (support.id IS NOT NULL AND
               (support.audience<>'delivery' OR support.data_category<>'delivery_context')) OR
             (selection.id IS NOT NULL AND
               (selection.audience<>'delivery' OR selection.data_category<>'delivery_context'))))
          AS restricted_support
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
        AND r.current_accepted_revision_id=v.id
      JOIN profile_review_decisions d ON d.revision_id=v.id AND d.decision='accept'
      WHERE v.id=$1 AND (v.audience=$2 OR ($2='internal' AND v.audience='delivery'))`,
    [revisionId,audience]);
    const row = found.rows[0];
    if (!row || (audience === "delivery" && (row.data_category !== "delivery_context" ||
        (row.restricted_support && !row.partner_safe_attestation))) ||
        (await unsupportedProfileRevisionIds(client,[revisionId],true)).has(revisionId)) return null;
    const payload = profilePayloadSchema.safeParse(row.payload);
    if (!payload.success || (audience === "delivery" && payload.data.kind === "stakeholder" &&
      payload.data.classification === "internal")) return null;
    const chunks = profileNarratives(payload.data,audience).flatMap(({ path,text }) => simpleChunks(text,
      () => ({ kind: "profile_field",fieldPath: path })));
    if (!chunks.length) return null;
    return { environmentId,workspaceId: row.workspace_id,customerId: row.customer_id,
      workloadId: row.workload_id,sourceKind: kind,revisionId,audience,
      generation: Number(row.revision_number),chunks };
  }
  if (kind === "approved_excerpt") {
    const found = await client.query<{ workspace_id: string; customer_id: string;
      lifecycle_generation: string; audience: string; workload_id: string | null }>(`
      SELECT s.workspace_id,s.customer_id,s.lifecycle_generation,s.audience,
        record.workload_id
      FROM artifact_evidence_selections s
      JOIN profile_revisions pr ON pr.id=s.profile_revision_id
      JOIN profile_records record ON record.id=pr.record_id
        AND record.current_accepted_revision_id=pr.id
      WHERE s.id=$1`, [revisionId]);
    const row = found.rows[0];
    if (!row || (audience === "delivery" && row.audience !== "delivery")) return null;
    const chunks = await approvedArtifactUnitChunks(client,revisionId,
      audience === "internal" ? "internal" : "partner");
    if (!chunks.length) return null;
    return { environmentId,workspaceId: row.workspace_id,customerId: row.customer_id,
      workloadId: row.workload_id,sourceKind: kind,revisionId,audience,
      generation: Number(row.lifecycle_generation),chunks };
  }
  const found = await client.query<{ workspace_id: string; customer_id: string;
    version: string; passage: string; location: string; audience: string }>(`
    SELECT v.workspace_id,v.customer_id,v.version,v.passage,v.location,v.audience
    FROM evidence_source_revisions v
    JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
    JOIN research_checks c ON c.source_revision_id=v.id
      AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
    WHERE v.id=$1 AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
      WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))`,
  [revisionId]);
  const row = found.rows[0];
  if (!row || (audience === "delivery" && row.audience !== "delivery")) return null;
  const url = new URL(row.location);
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const chunks = simpleChunks(row.passage,(start,end) => ({ kind: "research_passage",
    canonicalUrl: url.toString(),start,end }));
  if (!chunks.length) return null;
  return { environmentId,workspaceId: row.workspace_id,customerId: row.customer_id,
    workloadId: null,sourceKind: kind,revisionId,audience,
    generation: Number(row.version),chunks };
}

/** Writes a separate audience copy; indexing still requires a current worker lease. */
export async function materializeCurrentProjection(client: PoolClient,
  kind: SourceCandidate["sourceKind"], revisionId: string,
  audience: SourceCandidate["audience"],
  environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<string | null> {
  const candidate = await buildCurrentProjection(client,kind,revisionId,audience,environmentId);
  if (!candidate) return null;
  const chunks = collapseDuplicateChunks(candidate.chunks);
  const contentDigest = createHash("sha256")
    .update(JSON.stringify(chunks.map((chunk) => ({ digest: chunk.digest,
      locators: chunk.locators,warnings: chunk.warnings }))))
    .digest("hex");
  const id = randomUUID();
  const source = await client.query<{ id: string }>(`
    INSERT INTO retrieval_sources(id,environment_id,workspace_id,customer_id,workload_id,
      scope,source_kind,source_revision_id,audience,projection_contract,contract_digest,
      source_generation,content_digest)
    VALUES($1,$2,$3,$4,$5,'customer',$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (environment_id,source_kind,source_revision_id,audience,contract_digest,source_generation)
    DO UPDATE SET updated_at=now()
      WHERE retrieval_sources.content_digest=EXCLUDED.content_digest
    RETURNING id`,
  [id,candidate.environmentId,candidate.workspaceId,candidate.customerId,candidate.workloadId,
    kind,revisionId,audience,projectionContract,projectionContractDigest,
    candidate.generation,contentDigest]);
  const sourceId = source.rows[0]?.id;
  if (!sourceId) return null;
  for (const [index,chunk] of chunks.entries()) {
    await client.query(`INSERT INTO retrieval_passages
      (id,source_id,ordinal,passage_digest,passage_text,locators,extraction_warnings)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (source_id,ordinal) DO NOTHING`,
    [randomUUID(),sourceId,index+1,chunk.digest,chunk.text,
      JSON.stringify(chunk.locators),JSON.stringify(chunk.warnings)]);
  }
  await enqueueRetrievalJob(client,sourceId,"index",environmentId);
  return sourceId;
}

/** Public projection contains only the reviewed nine-field payload. */
export async function materializeSharedProjection(client: PoolClient,
  revisionId: string,environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<string | null> {
  const result = await client.query<{ head_generation: string; content_digest: string;
    payload: unknown }>(`SELECT p.head_generation,r.content_digest,payload.payload
    FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id
    JOIN knowledge_revision_payloads payload ON payload.revision_id=r.id
    WHERE p.revision_id=$1 AND p.environment_id=$2 AND p.state='published'`,
  [revisionId,environmentId]);
  const row = result.rows[0];
  if (!row || !await knowledgeLineageIsCurrent(client,revisionId)) return null;
  const payload = sanitizedKnowledgeSchema.safeParse(row.payload);
  if (!payload.success || createHash("sha256").update(JSON.stringify(payload.data))
    .digest("hex") !== row.content_digest) return null;
  const chunks = collapseDuplicateChunks(Object.entries(payload.data).flatMap(([fieldPath,value]) =>
    simpleChunks(value,(start,end) => ({ kind: "shared_field",fieldPath,start,end }))));
  if (!chunks.length) return null;
  const previous = await client.query<{ id: string }>(`UPDATE retrieval_sources
    SET lifecycle_state='retired',updated_at=now()
    WHERE environment_id=$1 AND source_kind='published_shared'
      AND source_revision_id IN (SELECT r.id FROM knowledge_revisions r
        WHERE r.contribution_id=(SELECT contribution_id FROM knowledge_revisions WHERE id=$2))
      AND source_revision_id<>$2 AND lifecycle_state='current'
    RETURNING id`,[environmentId,revisionId]);
  for (const source of previous.rows) await enqueueRetrievalJob(client,source.id,"cleanup",environmentId);
  const id = randomUUID();
  const inserted = await client.query<{ id: string }>(`
    INSERT INTO retrieval_sources(id,environment_id,scope,source_kind,source_revision_id,
      audience,projection_contract,contract_digest,source_generation,content_digest)
    VALUES($1,$2,'shared','published_shared',$3,'shared',$4,$5,$6,$7)
    ON CONFLICT (environment_id,source_kind,source_revision_id,audience,contract_digest,source_generation)
    DO UPDATE SET updated_at=now() WHERE retrieval_sources.content_digest=EXCLUDED.content_digest
    RETURNING id`,[id,environmentId,revisionId,projectionContract,projectionContractDigest,
      row.head_generation,row.content_digest]);
  const sourceId = inserted.rows[0]?.id;
  if (!sourceId) return null;
  for (const [index,chunk] of chunks.entries()) {
    await client.query(`INSERT INTO retrieval_passages
      (id,source_id,ordinal,passage_digest,passage_text,locators,extraction_warnings)
      VALUES($1,$2,$3,$4,$5,$6,'[]'::jsonb)
      ON CONFLICT (source_id,ordinal) DO NOTHING`,
    [randomUUID(),sourceId,index+1,chunk.digest,chunk.text,JSON.stringify(chunk.locators)]);
  }
  await enqueueRetrievalJob(client,sourceId,"index",environmentId);
  return sourceId;
}
