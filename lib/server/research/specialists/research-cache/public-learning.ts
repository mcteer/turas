import { z } from "zod";
import type { AppIdentity } from "../identity";
import { researchSourceIsEligible, requireResearchAccount } from "../account";
import { customerUpdateSchema } from "../solution-research/customer-update";
import { sourceSchema } from "../solution-research/schema";
import { researchPassages, verifiedPublicationDate } from "../solution-research/source-integrity";
import { communityAttributionWarning } from "../solution-research/attribution";
import { digest } from "./schema";
import { evidenceDatabase } from "./database";
import { retainSpecialistProfileSources } from "../retain-profile";

export const publicLearningSchema = z.object({
  id: z.string(), accountId: z.string(), url: z.url(), title: z.string(), passageId: z.string(), quote: z.string(), quoteTruncated: z.boolean(),
  publishedAt: z.string().nullable(), firstSeen: z.iso.datetime(), lastSeen: z.iso.datetime(),
  attributionWarning: z.string().nullable(), queryMatched: z.boolean(),
  evidenceState: z.enum(["recently_checked", "refresh_due", "changed", "historical"]),
});
type PublicPassageReference = { sourceId: string; passageId?: string; quote?: string; sourceType?: string };

// Share exact server-bound PUBLIC passages, never a generated claim, private question,
// customer context, coverage note or private research receipt. Original dates survive.
export async function learnPublicSources(identity: AppIdentity, accountId: string, sources: z.infer<typeof sourceSchema>[], references: PublicPassageReference[], signal: AbortSignal) {
  await requireResearchAccount(identity,accountId);
  const sql = await evidenceDatabase();
  const inserts = [];
  for (const reference of references) {
    const source = sources.find(item => item.id === reference.sourceId);
    if (!source?.cache) continue;
    const passages = researchPassages(source).filter(item => reference.passageId === item.id || (reference.quote !== undefined && item.text.includes(reference.quote)));
    for (const passage of passages) {
      signal.throwIfAborted();
      // The source must exist in the public fetch ledger, not just carry a model-supplied URL/cache field.
      inserts.push(sql.query(`INSERT INTO turas_public_learning
        (environment_id,workspace_id,account_id,id,source_id,snapshot_id,url,title,passage_id,quote,published_at,source_type,last_seen)
        SELECT $1,$2,$3,$4,$5,s.id,s.url,s.source->>'title',$7,$8,$9::date,$10,s.checked_at
        FROM turas_evidence_snapshots s WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.id=$6 AND s.source->>'id'=$5
          AND strpos(s.source->>'excerpt',$8)>0
        ON CONFLICT(environment_id,workspace_id,account_id,id) DO UPDATE SET last_seen=excluded.last_seen,snapshot_id=excluded.snapshot_id,source_id=excluded.source_id,passage_id=excluded.passage_id
        WHERE turas_public_learning.last_seen<=excluded.last_seen`,
        [identity.environmentId, identity.workspaceId, accountId, digest(source.url + "\n" + passage.text), source.id,
          source.cache.snapshotId, passage.id, passage.text, verifiedPublicationDate(source), reference.sourceType ?? "unclassified"]));
    }
  }
  if (inserts.length) await sql.transaction(inserts);
  await retainSpecialistProfileSources(identity,accountId,sources,references);
  console.info(JSON.stringify({ event: "public_learning.recorded", passageCount: inserts.length }));
}

export async function learnPublicEvidence(identity: AppIdentity, update: z.infer<typeof customerUpdateSchema>, sources: z.infer<typeof sourceSchema>[], signal: AbortSignal) {
  await learnPublicSources(identity, update.accountId, sources, update.findings.flatMap(finding => [
    { sourceId: finding.sourceId, passageId: finding.passageId, sourceType: finding.sourceType },
    ...(finding.supportingPassageIds ?? []).map(passageId => ({ sourceId: finding.sourceId, passageId, sourceType: finding.sourceType })),
  ]), signal);
}
export async function publicLearningHasSource(identity: Pick<AppIdentity, "environmentId" | "workspaceId">, accountId: string, url: string) {
  const sql = await evidenceDatabase();
  const rows = await sql.query(`SELECT 1 FROM turas_public_learning WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND url=$4 LIMIT 1`, [identity.environmentId, identity.workspaceId, accountId, url]);
  return rows.length > 0;
}
export async function latestPublicLearningDate(identity: Pick<AppIdentity, "environmentId" | "workspaceId">, accountId: string) {
  const sql = await evidenceDatabase();
  const rows = await sql.query(`SELECT max(last_seen)::date AS latest_date
    FROM turas_public_learning WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3`,
    [identity.environmentId, identity.workspaceId, accountId]);
  const latest = rows[0]?.latest_date;
  return latest ? z.coerce.date().parse(latest).toISOString().slice(0, 10) : null;
}
export async function recallPublicLearning(identity: AppIdentity, accountId: string, query: string, signal: AbortSignal, acrossAccounts = false) {
  await requireResearchAccount(identity,accountId);
  const sql = await evidenceDatabase();
  const rows = await sql.query(`WITH ranked AS (SELECT l.*,s.refresh_after,
      ($4='' OR l.search_text @@ websearch_to_tsquery('english',$4)) AS query_matched,
      ts_rank_cd(l.search_text,websearch_to_tsquery('english',$4)) AS relevance,
      row_number() OVER (PARTITION BY l.account_id,l.url ORDER BY ts_rank_cd(l.search_text,websearch_to_tsquery('english',$4)) DESC,l.last_seen DESC,l.id) AS passage_rank,
      EXISTS(SELECT 1 FROM turas_evidence_snapshots n WHERE n.environment_id=l.environment_id AND n.workspace_id=l.workspace_id
        AND n.url=l.url AND n.id<>l.snapshot_id AND n.checked_at>l.last_seen) AS changed
    FROM turas_public_learning l LEFT JOIN turas_evidence_snapshots s ON s.environment_id=l.environment_id AND s.workspace_id=l.workspace_id AND s.id=l.snapshot_id
    WHERE l.environment_id=$1 AND l.workspace_id=$2 AND (l.account_id=$3 OR $5::boolean)
      AND EXISTS(SELECT 1 FROM customer_references c WHERE c.id::text=l.account_id
        AND c.workspace_id::text=l.workspace_id AND ($7='internal' OR EXISTS(
          SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id
            AND g.membership_id=$6::uuid AND g.state='active')))
      ) SELECT * FROM ranked
    WHERE query_matched OR NOT EXISTS(SELECT 1 FROM ranked WHERE query_matched)
    ORDER BY (account_id=$3) DESC,passage_rank,relevance DESC,
      (source_type IN ('customer_publication','vendor_case_study','conference_presentation','webinar')) DESC,
      last_seen DESC,id LIMIT 8`,
    [identity.environmentId, identity.workspaceId, accountId, query, acrossAccounts,identity.membershipId,identity.kind]);
  signal.throwIfAborted();
  const parsed = z.array(z.object({ id: z.string(), account_id: z.string(), url: z.string(), title: z.string(), passage_id: z.string(), quote: z.string(),
    published_at: z.coerce.date().nullable(), first_seen: z.coerce.date(), last_seen: z.coerce.date(), refresh_after: z.coerce.date().nullable(), changed: z.boolean(), query_matched: z.boolean() })).parse(rows);
  const eligible=[];
  for(const row of parsed)if(await researchSourceIsEligible(identity,row.account_id,row.url))eligible.push(row);
  return eligible.map(row => publicLearningSchema.parse({ id: row.id, accountId: row.account_id, url: row.url, title: row.title,
    passageId: row.passage_id, queryMatched: row.query_matched, quote: row.quote.slice(0, 1600), quoteTruncated: row.quote.length > 1600, publishedAt: row.published_at?.toISOString().slice(0, 10) ?? null,
    firstSeen: row.first_seen.toISOString(), attributionWarning: communityAttributionWarning({ url: row.url }), lastSeen: row.last_seen.toISOString(), evidenceState: row.changed ? "changed"
      : !row.refresh_after ? "historical" : row.refresh_after.getTime() <= Date.now() ? "refresh_due" : "recently_checked" }));
}

// Use the existing authenticated maintenance job. Bounded public page checks, no
// autonomous model sessions, internal connector access or customer writes.
export async function refreshPublicLearning(identity: AppIdentity, signal: AbortSignal) {
  const environmentId = identity.environmentId;
  const sql = await evidenceDatabase();
  const due = z.array(z.object({ workspace_id: z.string(), account_id: z.string(), url: z.string() })).parse(await sql.query(`
    WITH candidates AS (
      SELECT workspace_id,account_id,url FROM turas_public_learning WHERE environment_id=$1 AND workspace_id=$2
        AND coalesce(refresh_attempt_at,last_seen)<now()-interval '1 day'
      GROUP BY workspace_id,account_id,url ORDER BY min(coalesce(refresh_attempt_at,last_seen)) LIMIT 2
    ), claimed AS (
      UPDATE turas_public_learning l SET refresh_attempt_at=now() FROM candidates c
      WHERE l.environment_id=$1 AND l.workspace_id=c.workspace_id AND l.account_id=c.account_id AND l.url=c.url
        AND coalesce(l.refresh_attempt_at,l.last_seen)<now()-interval '1 day'
      RETURNING l.workspace_id,l.account_id,l.url
    ) SELECT DISTINCT workspace_id,account_id,url FROM claimed`, [environmentId,identity.workspaceId]));
  let refreshed = 0;
  const { readCachedSource } = await import("./sources");
  for (const row of due) {
    signal.throwIfAborted();
    try {
      await requireResearchAccount(identity,row.account_id);
      const check = await readCachedSource(identity,
        row.account_id, "public evidence", row.url, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
      // Preserve every historical passage. Only mark text confirmed when the
      // current page still contains it; removed or changed passages remain dated.
      await sql.query(`UPDATE turas_public_learning SET snapshot_id=$5,last_seen=greatest(last_seen,$6::timestamptz)
        WHERE environment_id=$1 AND workspace_id=$2 AND account_id=$3 AND url=$4 AND strpos($7,quote)>0`,
        [environmentId, row.workspace_id, row.account_id, row.url, check.source.cache.snapshotId, check.source.cache.checkedAt, check.source.excerpt]);
      refreshed++;
    } catch {
      console.warn(JSON.stringify({ event: "public_learning.refresh_failed" }));
      signal.throwIfAborted();
    }
  }
  return { refreshAttempted: due.length, refreshed };
}

// New account sources can change a prior conclusion even when its own pages are
// unchanged. Do not replay an older brief without considering that new evidence.
export async function hasNewPublicSources(identity: AppIdentity, accountId: string, knownUrls: string[], researchedAt: string) {
  const sql = await evidenceDatabase();
  const rows = await sql.query(`SELECT 1 FROM turas_public_learning WHERE environment_id=$1 AND workspace_id=$2
    AND account_id=$3 AND first_seen>$4::timestamptz AND NOT(url=ANY($5::text[])) LIMIT 1`,
    [identity.environmentId, identity.workspaceId, accountId, researchedAt, knownUrls]);
  return rows.length > 0;
}
