import { createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { citationLocatorSchema, retrievalResponseSchema, retrievalSearchSchema,
  retrievalContractVersion, retrievalLimits, evidenceQualitySchema,
  type RetrievalSearchInput } from
  "../../contracts/retrieval";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { knowledgeLineageHasMaterialConflict } from "../profiles/eligibility";
import { passageDigest } from "./chunker";
import { currentFactEligible, retrievalCoverageWarnings, retrievalQuality } from "./context";
import { embedRetrievalTexts } from "./embeddings";
import { authorizeRetrievalScope, recheckRetrievalSource } from "./policy";
import { recordRetrievalMetric } from "./telemetry";

type Source = { id: string; source_kind: string; source_revision_id: string;
  source_generation: string; audience: string; content_digest: string;
  projection_contract: string };
type Ranked = Source & { passage_id: string; passage_digest: string;
  passage_text: string; locators: unknown; extraction_warnings: unknown;
  score: number };

let activeSearches = 0;

async function rateLimit(client: PoolClient, actor: CurrentSession): Promise<void> {
  const config = getServerConfig();
  const start = new Date(Math.floor(Date.now()/60_000)*60_000);
  const key = createHmac("sha256",config.TURAS_MAINTENANCE_SECRET)
    .update(`retrieval-v1:${actor.principalId}`).digest("hex");
  const limit = await client.query<{ count: number }>(`INSERT INTO rate_windows
    (environment_id,key_hash,category,window_start,count,expires_at)
    VALUES($1,$2,'retrieval_search',$3,1,$4)
    ON CONFLICT (environment_id,key_hash,category,window_start)
    DO UPDATE SET count=rate_windows.count+1 RETURNING count`,
  [config.TURAS_ENVIRONMENT_ID,key,start,new Date(start.getTime()+60_000)]);
  if ((limit.rows[0]?.count ?? 0) > retrievalLimits.perPrincipalPerMinute) {
    throw new HttpFailure(429,"rate_limited","Retrieval request limit reached");
  }
}

async function eligibleSources(client: PoolClient, actor: CurrentSession,
  input: RetrievalSearchInput,effectiveAudience?:"internal"|"delivery",
  customerWideOnly=false): Promise<Source[]> {
  const scope = await authorizeRetrievalScope(client,actor,input.scope,input.customerId,effectiveAudience);
  const rows = await client.query<Source>(`SELECT id,source_kind,source_revision_id,
      source_generation,audience,content_digest,projection_contract
    FROM retrieval_sources WHERE environment_id=$1 AND lifecycle_state='current'
      AND ((scope='customer' AND workspace_id=$2 AND customer_id=$3
        AND ($4::uuid IS NULL OR workload_id IS NULL OR workload_id=$4)
        AND (NOT $7::boolean OR workload_id IS NULL)
        AND (audience='delivery' OR $5='internal'))
        OR (scope='shared' AND $6::boolean AND audience='shared'))
    ORDER BY id LIMIT 10001`,
  [scope.environmentId,scope.workspaceId,scope.customerId,input.workloadId ?? null,
    scope.audience,scope.includeShared,customerWideOnly]);
  if (rows.rows.length > 10_000) throw new HttpFailure(503,"unavailable","Retrieval unavailable");
  const eligible: Source[] = [];
  for (const source of rows.rows) {
    const generation = Number(source.source_generation);
    if (!Number.isSafeInteger(generation)) continue;
    if (await recheckRetrievalSource(client,{ id: source.id,kind: source.source_kind,
      revisionId: source.source_revision_id,generation,audience: source.audience,
      contentDigest: source.content_digest,projectionContract: source.projection_contract },scope)) {
      eligible.push(source);
    }
  }
  return eligible;
}

export async function rankPassages(client: PoolClient, sources: readonly Source[], query: string,
  vector: readonly number[] | null): Promise<Ranked[]> {
  if (!sources.length) return [];
  const queryVector = vector ? `[${vector.join(",")}]` : null;
  await client.query("SET LOCAL statement_timeout='2000ms'");
  const ranked = await client.query<Ranked>(`WITH eligible AS MATERIALIZED (
      SELECT p.id AS passage_id,p.source_id,p.passage_digest,p.passage_text,
        p.locators,p.extraction_warnings,p.search_vector,p.embedding,p.embedding_state,
        p.embedding_contract,s.source_kind,s.source_revision_id,s.source_generation,
        s.audience,s.content_digest,s.projection_contract
      FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id
      WHERE s.id=ANY($1::uuid[]) AND s.lifecycle_state='current'
    ), lexical AS (
      SELECT passage_id,row_number() OVER
        (ORDER BY ts_rank_cd(search_vector,websearch_to_tsquery('english',$2)) DESC,
          passage_id) AS rank
      FROM eligible WHERE search_vector @@ websearch_to_tsquery('english',$2)
      ORDER BY ts_rank_cd(search_vector,websearch_to_tsquery('english',$2)) DESC,
        passage_id LIMIT 30
    ), semantic AS (
      SELECT passage_id,row_number() OVER (ORDER BY embedding <=> $3::public.vector,
        passage_id) AS rank
      FROM eligible WHERE $3::text IS NOT NULL AND embedding_state='ready'
        AND embedding_contract='embedding-v1' AND embedding IS NOT NULL
      ORDER BY embedding <=> $3::public.vector,passage_id LIMIT 30
    ), scored AS (
      SELECT passage_id,sum(1.0/(60+rank)) AS score FROM (
        SELECT passage_id,rank FROM lexical UNION ALL
        SELECT passage_id,rank FROM semantic
      ) branches GROUP BY passage_id
    )
    SELECT e.passage_id,e.passage_digest,e.passage_text,e.locators,e.extraction_warnings,
      e.source_id AS id,e.source_kind,e.source_revision_id,e.source_generation,
      e.audience,e.content_digest,e.projection_contract,scored.score
    FROM scored JOIN eligible e ON e.passage_id=scored.passage_id
    ORDER BY scored.score DESC,e.passage_id LIMIT 60`,
  [sources.map((source) => source.id),query,queryVector]);
  return ranked.rows;
}

async function qualityFor(client: PoolClient, row: Ranked, asOf: Date) {
  if (row.source_kind === "published_shared") {
    const shared = await client.query<{ public_quality: unknown }>(
      "SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",
      [row.source_revision_id]);
    return evidenceQualitySchema.safeParse(shared.rows[0]?.public_quality).data ??
      retrievalQuality(null,{},asOf);
  }
  if (row.source_kind === "verified_research") {
    const found = await client.query<{ quality_input: unknown; observation_at: Date | null;
      publication_at: Date | null }>(`SELECT quality_input,observation_at,publication_at
      FROM evidence_source_revisions WHERE id=$1`,[row.source_revision_id]);
    return retrievalQuality(found.rows[0]?.quality_input,{
      observationAt: found.rows[0]?.observation_at,
      publicationAt: found.rows[0]?.publication_at },asOf);
  }
  const found = await client.query<{ quality_input: unknown; payload: Record<string, unknown> }>(`
    SELECT v.quality_input,v.payload FROM profile_revisions v
    WHERE v.id=${row.source_kind === "approved_excerpt" ?
      "(SELECT s.profile_revision_id FROM artifact_evidence_selections s WHERE s.id=$1)" : "$1"}`,
  [row.source_revision_id]);
  const payload = found.rows[0]?.payload ?? {};
  const observed = payload.observedAt ?? payload.observationEnd;
  return retrievalQuality(found.rows[0]?.quality_input,{
    observationAt: typeof observed === "string" ? new Date(observed) : null,
    reviewAt: typeof payload.reviewAt === "string" ? new Date(payload.reviewAt) : null },asOf);
}

async function hasMaterialConflict(client: PoolClient, row: Ranked,
  actor: CurrentSession,input: RetrievalSearchInput): Promise<boolean> {
  const typed = await client.query(`SELECT 1 FROM evidence_conflict_targets WHERE state='confirmed'
    AND ((first_kind=$1 AND first_revision_id=$2) OR
      (second_kind=$1 AND second_revision_id=$2))
    AND environment_id=$3
    AND (scope='shared' OR (scope='customer' AND workspace_id=$4 AND customer_id=$5))
    LIMIT 1`,
  [row.source_kind,row.source_revision_id,getServerConfig().TURAS_ENVIRONMENT_ID,
    actor.workspaceId,input.scope === "shared" ? null : input.customerId ?? null]);
  if (typed.rowCount) return true;
  if (row.source_kind === "published_shared") {
    return knowledgeLineageHasMaterialConflict(client,row.source_revision_id);
  }
  if (row.source_kind !== "accepted_profile") return false;
  const profile = await client.query(`SELECT 1 FROM evidence_conflicts WHERE state='confirmed'
    AND (first_revision_id=$1 OR second_revision_id=$1)
    AND workspace_id=$2 AND customer_id=$3 LIMIT 1`,
  [row.source_revision_id,actor.workspaceId,
    input.scope === "shared" ? null : input.customerId ?? null]);
  return Boolean(profile.rowCount);
}

export async function searchEvidence(actor: CurrentSession, raw: unknown,
  effective?:{audience:"internal"|"delivery";workloadId:string|null;lexicalOnly?:boolean}) {
  const parsed = retrievalSearchSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422,"invalid_query","Invalid retrieval request");
  const input = parsed.data;
  if (effective && input.workloadId !== undefined &&
      input.workloadId !== effective.workloadId) {
    throw new HttpFailure(409,"context_changed","Planning workload changed");
  }
  const scopedInput=effective ? {...input,workloadId:effective.workloadId ?? undefined}:input;
  const started = Date.now();
  if (activeSearches >= retrievalLimits.activePerEnvironment) {
    throw new HttpFailure(429,"rate_limited","Retrieval busy");
  }
  activeSearches += 1;
  try {
    await withTransaction(async (client) => {
      await authorizeRetrievalScope(client,actor,input.scope,input.customerId,
        effective?.audience);
      await rateLimit(client,actor);
    });
    let vector: number[] | null = null;
    try { if (!effective?.lexicalOnly) vector = (await embedRetrievalTexts([input.query]))[0]; }
    catch { recordRetrievalMetric("lexical_degraded_count",1); }
    const result = await withTransaction(async (client) => {
      const sources = await eligibleSources(client,actor,scopedInput,effective?.audience,
        Boolean(effective && effective.workloadId===null));
      const ranked = await rankPassages(client,sources,input.query,vector);
      const asOf = new Date();
      const bySource = new Map<string,number>();
      const seen = new Set<string>();
      const selections: Array<{ row: Ranked; citationId: string;
        quality: Awaited<ReturnType<typeof qualityFor>>; locators: unknown[];
        warnings: string[]; caveats: string[]; title: string;
        productVersion: string | null }> = [];
      for (const row of ranked) {
        if (selections.length >= Math.min(input.limit,retrievalLimits.resultCount)) break;
        if ((bySource.get(row.source_revision_id) ?? 0) >= retrievalLimits.perSourceRevision) continue;
        if (seen.has(`${row.source_revision_id}:${row.passage_digest}`) ||
            passageDigest(row.passage_text) !== row.passage_digest) continue;
        const locators = citationLocatorSchema.array().min(1).max(50).safeParse(row.locators);
        if (!locators.success) continue;
        const quality = await qualityFor(client,row,asOf);
        const conflict = await hasMaterialConflict(client,row,actor,scopedInput);
        if (input.use === "current_fact" && !currentFactEligible(quality,conflict,asOf)) continue;
        const caveats = [
          ...(quality.freshness === "Stale" || quality.freshness === "Unknown" ?
            [`${quality.freshness} source date`] : []),
          ...(conflict ? ["Confirmed material conflict"] : []),
        ];
        const shared = row.source_kind === "published_shared" ?
          await client.query<{ title: string; product_version: string }>(`
            SELECT payload->>'title' AS title,payload->>'productVersion' AS product_version
            FROM knowledge_revision_payloads WHERE revision_id=$1`,[row.source_revision_id]) : null;
        selections.push({ row,citationId: randomUUID(),quality,
          locators: locators.data,warnings: Array.isArray(row.extraction_warnings)
            ? row.extraction_warnings.filter((item): item is string => typeof item === "string").slice(0,10)
            : [],caveats,
          title: shared?.rows[0]?.title ?? (row.source_kind === "verified_research" ?
            "Verified public research" : row.source_kind === "approved_excerpt" ?
              "Approved customer excerpt" : "Accepted customer fact"),
          productVersion: shared?.rows[0]?.product_version ?? null });
        seen.add(`${row.source_revision_id}:${row.passage_digest}`);
        bySource.set(row.source_revision_id,(bySource.get(row.source_revision_id) ?? 0)+1);
      }
      const validUntil = new Date(Math.min(asOf.getTime()+86_400_000,
        ...selections.map((item) => Date.parse(item.quality.validUntil))));
      const receiptId = randomUUID();
      const response = retrievalResponseSchema.parse({ version: retrievalContractVersion,
        receiptId,asOf: asOf.toISOString(),validUntil: validUntil.toISOString(),
        mode: vector ? "hybrid" : "lexical_degraded",language: "en",
        completenessWarnings: [
          ...retrievalCoverageWarnings(input.query,!vector),
          ...(selections.length ? [] : ["No eligible evidence found for this request"]),
        ],
        results: selections.map((item) => ({ citationId: item.citationId,
          sourceKind: item.row.source_kind,sourceRevisionId: item.row.source_revision_id,
          passageDigest: item.row.passage_digest,
          title: item.title,
          text: item.row.passage_text,locators: item.locators,quality: item.quality,
          caveats: item.caveats,warnings: item.warnings,
          productVersion: item.productVersion })) });
      await client.query(`INSERT INTO retrieval_receipts
        (id,environment_id,actor_membership_id,scope,workspace_id,customer_id,
         mode,embedding_contract,citation_ids,as_of,valid_until)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [receiptId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,input.scope,
        input.scope === "shared" ? null : actor.workspaceId,input.customerId ?? null,
        response.mode,vector ? "embedding-v1" : null,
        JSON.stringify(selections.map((item) => item.citationId)),asOf,validUntil]);
      for (const [index,item] of selections.entries()) {
        await client.query(`INSERT INTO retrieval_receipt_sources
          (id,receipt_id,ordinal,source_id,passage_id,source_kind,source_revision_id,
           source_generation,passage_digest,projection_contract,locators,valid_until)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [item.citationId,receiptId,index+1,item.row.id,item.row.passage_id,
          item.row.source_kind,item.row.source_revision_id,item.row.source_generation,
          item.row.passage_digest,item.row.projection_contract,
          JSON.stringify(item.locators),validUntil]);
      }
      return response;
    });
    recordRetrievalMetric("search_duration_ms",Date.now()-started);
    return result;
  } finally { activeSearches -= 1; }
}
