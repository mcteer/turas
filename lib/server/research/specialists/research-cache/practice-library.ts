import { embedQuery } from "../embeddings";
import { sourceSchema } from "../solution-research/schema";
import { informationTypeSchema } from "../solution-research/freshness";
import type { AppIdentity } from "../identity";
import { readCachedSource } from "./sources";
import { evidenceDatabase } from "./database";
import { digest, normalized } from "./schema";
import { embeddingsConfigured } from "../embeddings";
import { researchPassages } from "../solution-research/source-integrity";
import { retainedPracticePassages } from "./practice-passages";
import { z } from "zod";

export const practiceSourceTypeSchema = z.enum(["vercel_documentation", "customer_engineering", "conference_presentation", "webinar", "practitioner_report", "independent_analysis"]);
export const practiceInformationTypeSchema = informationTypeSchema;
export const practiceSourceSchema = z.object({
  url: z.url(), title: z.string(), product: z.string(), topic: z.string(), sourceType: practiceSourceTypeSchema,
  informationType: informationTypeSchema, publishedAt: z.string().nullable(), checkedAt: z.string(), refreshAfter: z.string(), stale: z.boolean(),
  passages: z.array(z.object({ id: z.string(), text: z.string() })).max(8),
}).strict();
export type PracticeSource = z.infer<typeof practiceSourceSchema>;
export const practiceRunSchema = z.object({ id: z.string(), product: z.string(), topic: z.string(), brief: z.record(z.string(), z.unknown()), sourceUrls: z.array(z.url()), createdAt: z.string(), refreshAfter: z.string() }).strict();

export async function recordVercelPracticeSource(identity: AppIdentity, product: string, topic: string, url: string, sourceType: z.infer<typeof practiceSourceTypeSchema>, informationType: z.infer<typeof informationTypeSchema>, signal: AbortSignal) {
  const sql = await evidenceDatabase();
  const read = await readCachedSource(identity, "public-vercel-practice", `${product} ${topic}`, url, signal, undefined, { recordAccount: false,informationType });
  const source = sourceSchema.parse(read.source);
  const snapshot = source.cache;
  if (!snapshot) throw new Error("Practice source was not cached.");
  await sql.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,published_at,checked_at,refresh_after)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::timestamptz,$12::timestamptz)
    ON CONFLICT(environment_id,workspace_id,product,url) DO UPDATE SET topic=excluded.topic,snapshot_id=excluded.snapshot_id,title=excluded.title,source_type=excluded.source_type,information_type=excluded.information_type,published_at=excluded.published_at,checked_at=excluded.checked_at,refresh_after=excluded.refresh_after,last_seen=now()`,
    [identity.environmentId, identity.workspaceId, normalized(product), normalized(topic), snapshot.snapshotId, source.url, source.title, sourceType, informationType, source.publication?.date ?? null, snapshot.checkedAt, snapshot.refreshAfter]);
  return { source, cacheHit: read.cacheHit };
}

async function practiceSourceReceipts(identity: AppIdentity, product: string, query: string, signal: AbortSignal, completeReferences=false, documentationOnly=false) {
  const sql = await evidenceDatabase();
  let vector: number[] | null = null;
  if (embeddingsConfigured() && query) {
    try { vector = await embedQuery(query, signal); } catch { signal.throwIfAborted(); }
  }
  const rows = await sql.query(`WITH candidates AS MATERIALIZED (
      SELECT p.*,s.source,s.url AS source_url,s.truncated,s.checked_at AS snapshot_checked_at,s.refresh_after AS snapshot_refresh_after,
        m.product,m.topic,m.title,m.source_type,m.information_type,m.published_at
      FROM turas_vercel_practice_sources m JOIN turas_evidence_snapshots s ON s.environment_id=m.environment_id AND s.workspace_id=m.workspace_id AND s.id=m.snapshot_id
      JOIN turas_evidence_passages p ON p.environment_id=s.environment_id AND p.workspace_id=s.workspace_id AND p.snapshot_id=s.id
      WHERE m.environment_id=$1 AND m.workspace_id=$2 AND ($3='' OR m.product=$3)
        AND (NOT $6::boolean OR (m.source_type='vercel_documentation' AND s.url LIKE 'https://vercel.com/docs/%' AND s.url !~ '[?#]'))
        AND (p.search_text @@ websearch_to_tsquery('english',$4) OR $4=''
          OR ($5::vector IS NOT NULL AND p.embedding IS NOT NULL AND p.embedding <=> $5::vector < 0.82))
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY snapshot_id ORDER BY
        CASE WHEN search_text @@ websearch_to_tsquery('english',$4) THEN ts_rank_cd(search_text,websearch_to_tsquery('english',$4)) ELSE 0 END DESC,
        CASE WHEN $5::vector IS NOT NULL AND embedding IS NOT NULL THEN embedding <=> $5::vector ELSE 1 END, ordinal) AS passage_rank
      FROM candidates
    ) SELECT * FROM ranked WHERE passage_rank<=8 ORDER BY
      CASE WHEN $5::vector IS NOT NULL AND embedding IS NOT NULL THEN embedding <=> $5::vector ELSE 1 END, passage_rank LIMIT 48`,
    [identity.environmentId, identity.workspaceId, normalized(product), query, vector ? JSON.stringify(vector) : null,documentationOnly]);
  signal.throwIfAborted();
  const grouped = new Map<string, PracticeSource>();
  for (const row of rows) {
    const source = sourceSchema.parse(row.source);
    const passages = retainedPracticePassages(source, String(row.text), query);
    const current = grouped.get(row.snapshot_id) ?? practiceSourceSchema.parse({
      url: row.source_url, title: row.title, product: row.product, topic: row.topic, sourceType: row.source_type,
      informationType: row.information_type, publishedAt: row.published_at ? new Date(row.published_at).toISOString().slice(0, 10) : null,
      checkedAt: new Date(row.snapshot_checked_at).toISOString(), refreshAfter: new Date(row.snapshot_refresh_after).toISOString(),
      stale: new Date(row.snapshot_refresh_after).getTime() <= Date.now(), passages: [],
    });
    for (const passage of passages) {
      if (current.passages.length >= 8) break;
      if (!current.passages.some(existing => existing.id === passage.id)) current.passages.push(passage);
    }
    grouped.set(row.snapshot_id, current);
  }
  return [...grouped.entries()].slice(0, 8).map(([snapshotId,source])=>({snapshotId,source:completeReferences
    ? {...source,passages:researchPassages(sourceSchema.parse(rows.find(row=>row.snapshot_id===snapshotId)!.source))}
    :source}));
}

/** Existing specialist view: no private account or query metadata is added. */
export async function searchVercelPracticeSources(identity:AppIdentity,product:string,query:string,signal:AbortSignal){
 return (await practiceSourceReceipts(identity,product,query,signal)).map(row=>row.source);
}
/** Exact retained cache identities for source-consumption fencing. */
export async function searchVercelPracticeSourceReceipts(identity:AppIdentity,query:string,signal:AbortSignal,documentationOnly=false){
 return practiceSourceReceipts(identity,'',query,signal,true,documentationOnly);
}

export async function latestVercelPracticeRun(identity: AppIdentity, product: string, topic: string) {
  const sql = await evidenceDatabase();
  const rows = await sql.query(`SELECT id,product,topic,brief,source_urls,created_at,refresh_after
    FROM turas_vercel_practice_runs WHERE environment_id=$1 AND workspace_id=$2 AND product=$3 AND topic=$4
    ORDER BY created_at DESC LIMIT 1`, [identity.environmentId, identity.workspaceId, normalized(product), normalized(topic)]);
  const row = rows[0];
  if (!row) return null;
  return practiceRunSchema.parse({ id: row.id, product: row.product, topic: row.topic, brief: row.brief,
    sourceUrls: row.source_urls, createdAt: new Date(row.created_at).toISOString(), refreshAfter: new Date(row.refresh_after).toISOString() });
}

export async function recordVercelPracticeRun(identity: AppIdentity, product: string, topic: string, brief: Record<string, unknown>, sourceUrls: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  const sql = await evidenceDatabase();
  const id = digest(JSON.stringify([identity.environmentId, identity.workspaceId, normalized(product), normalized(topic), brief, sourceUrls]));
  const refreshAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await sql.query(`INSERT INTO turas_vercel_practice_runs(id,environment_id,workspace_id,product,topic,brief,source_urls,refresh_after)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz)
    ON CONFLICT(id) DO UPDATE SET brief=excluded.brief,source_urls=excluded.source_urls,created_at=now(),refresh_after=excluded.refresh_after`,
    [id, identity.environmentId, identity.workspaceId, normalized(product), normalized(topic), JSON.stringify(brief), JSON.stringify(sourceUrls), refreshAfter]);
  return id;
}
