import {hiddenRecord} from "../../../../contracts/http";
import {getServerConfig} from "../../../config";
import type {PoolClient} from "pg";
import {z} from "zod";
import type {AppIdentity} from "../identity";
import {lockProfileActor,lockProfileActors} from "../../../profiles/policy";
import {requireResearchAccount,researchSourceIsEligible,researchSourcesAreEligibleInTransaction,researchSourceKey} from "../account";
import {evidenceDatabase} from "./database";
import {communityAttributionWarning} from "../solution-research/attribution";

export const publicLearningSchema = z.object({
  id: z.string(), accountId: z.string(), url: z.url(), title: z.string(), passageId: z.string(), quote: z.string(), quoteTruncated: z.boolean(),
  publishedAt: z.string().nullable(), firstSeen: z.iso.datetime(), lastSeen: z.iso.datetime(),
  attributionWarning: z.string().nullable(), queryMatched: z.boolean(),
  evidenceState: z.enum(["recently_checked", "refresh_due", "changed", "historical"]),
});
export async function recallPublicLearning(identity: AppIdentity, accountId: string, query: string, signal: AbortSignal, acrossAccounts = false, existingClient?:PoolClient) {
  if(identity.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID)throw hiddenRecord();
  if(existingClient)await lockProfileActor(existingClient,identity,accountId,undefined,true);
  else await requireResearchAccount(identity,accountId);
  const sql = existingClient ? {query:async(text:string,values:unknown[])=>(await existingClient.query(text,values)).rows} : await evidenceDatabase();
  const rows = await sql.query(selectionSql(false),[identity.environmentId,identity.workspaceId,accountId,query,acrossAccounts,identity.membershipId,identity.kind,[]]);
  signal.throwIfAborted();
  return parseSelected(identity,rows,existingClient);
}
async function parseSelected(identity:AppIdentity,rows:unknown,existingClient?:PoolClient){
  const parsed = z.array(z.object({ id: z.string(), account_id: z.string(), url: z.string(), title: z.string(), passage_id: z.string(), quote: z.string(),
    published_at: z.coerce.date().nullable(), first_seen: z.coerce.date(), last_seen: z.coerce.date(), refresh_after: z.coerce.date().nullable(), changed: z.boolean(), query_matched: z.boolean() })).parse(rows);
  const authority=existingClient?await researchSourcesAreEligibleInTransaction(existingClient,identity,parsed.map(row=>({accountId:row.account_id,url:row.url}))):null;
  const eligible=[];
  for(const row of parsed)if(authority?authority.get(researchSourceKey({accountId:row.account_id,url:row.url})):await researchSourceIsEligible(identity,row.account_id,row.url))eligible.push(row);
  return eligible.map(row => publicLearningSchema.parse({ id: row.id, accountId: row.account_id, url: row.url, title: row.title,
    passageId: row.passage_id, queryMatched: row.query_matched, quote: row.quote.slice(0, 1600), quoteTruncated: row.quote.length > 1600, publishedAt: row.published_at?.toISOString().slice(0, 10) ?? null,
    firstSeen: row.first_seen.toISOString(), attributionWarning: communityAttributionWarning({ url: row.url }), lastSeen: row.last_seen.toISOString(), evidenceState: row.changed ? "changed"
      : !row.refresh_after ? "historical" : row.refresh_after.getTime() <= Date.now() ? "refresh_due" : "recently_checked" }));
}

const recallOrdering="origin_priority,passage_rank,relevance DESC,(source_type IN ('customer_publication','vendor_case_study','conference_presentation','webinar')) DESC,last_seen DESC,id";
function selectionSql(batch:boolean){return `WITH learning AS (
    SELECT l.environment_id,l.workspace_id,l.account_id,l.id,l.url,l.title,l.passage_id,l.quote,
      l.published_at,l.first_seen,l.last_seen,l.source_type,l.snapshot_id,l.search_text,0 AS origin_priority
    FROM turas_public_learning l WHERE l.environment_id=$1 AND l.workspace_id=$2
    UNION ALL
    -- Canonical ingestion predates the passage ledger for some accounts. Reuse
    -- its exact stored passage without writing a synthetic fetch or new dates.
    -- Existing ledger URLs always win; fallback fills remaining selected slots.
    SELECT $1,$2,v.customer_id::text,v.id::text,v.location,v.title,v.id::text,v.passage,
      v.publication_at::date,v.created_at,v.retrieval_at,'unclassified',NULL,to_tsvector('english',v.title || ' ' || v.passage),1
    FROM evidence_source_revisions v JOIN evidence_sources source ON source.id=v.source_id
    JOIN research_checks checks ON checks.source_revision_id=v.id
    WHERE v.workspace_id=$2::uuid AND source.origin='independent_research'
      AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result
      AND ($7='internal' OR v.audience='delivery')
      AND NOT EXISTS(SELECT 1 FROM evidence_source_revisions newer WHERE newer.source_id=v.source_id AND newer.version>v.version)
      AND NOT EXISTS(SELECT 1 FROM turas_public_learning original WHERE original.environment_id=$1
        AND original.workspace_id=$2 AND original.account_id=v.customer_id::text AND original.url=v.location)
  ), ranked AS (SELECT l.*,s.refresh_after,
      ($4='' OR l.search_text @@ websearch_to_tsquery('english',$4)) AS query_matched,
      ts_rank_cd(l.search_text,websearch_to_tsquery('english',$4)) AS relevance,
      row_number() OVER (PARTITION BY l.account_id,l.url ORDER BY ts_rank_cd(l.search_text,websearch_to_tsquery('english',$4)) DESC,l.last_seen DESC,l.id) AS passage_rank,
      EXISTS(SELECT 1 FROM turas_evidence_snapshots n WHERE n.environment_id=l.environment_id AND n.workspace_id=l.workspace_id
        AND n.url=l.url AND n.id<>l.snapshot_id AND n.checked_at>l.last_seen) AS changed
    FROM learning l LEFT JOIN turas_evidence_snapshots s ON s.environment_id=l.environment_id AND s.workspace_id=l.workspace_id AND s.id=l.snapshot_id
    WHERE l.environment_id=$1 AND l.workspace_id=$2 AND (l.account_id=$3 OR $5::boolean OR l.account_id=ANY($8::text[]))
      AND EXISTS(SELECT 1 FROM customer_references c WHERE c.id::text=l.account_id
        AND c.workspace_id::text=l.workspace_id AND ($7='internal' OR EXISTS(
          SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id
            AND g.membership_id=$6::uuid AND g.state='active')))
      AND NOT EXISTS(SELECT 1 FROM evidence_sources canonical
        LEFT JOIN LATERAL(SELECT * FROM evidence_source_revisions v WHERE v.source_id=canonical.id ORDER BY v.version DESC LIMIT 1) head ON true
        WHERE canonical.workspace_id::text=l.workspace_id AND canonical.customer_id::text=l.account_id AND canonical.origin='independent_research'
          AND canonical.canonical_location=l.url AND (head.id IS NULL OR ($7='partner' AND head.audience<>'delivery')
            OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=head.id AND e.event_type IN('withdraw','supersede'))
            OR NOT EXISTS(SELECT 1 FROM research_checks checks WHERE checks.source_revision_id=head.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result)
            OR EXISTS(SELECT 1 FROM independent_research_documents document WHERE document.source_revision_id=head.id AND encode(sha256(convert_to(document.document_text,'UTF8')),'hex')<>document.document_digest)
            OR EXISTS(SELECT 1 FROM evidence_conflict_targets conflict WHERE conflict.environment_id=$1 AND conflict.state='confirmed'
              AND (conflict.scope='shared' OR (conflict.scope='customer' AND conflict.workspace_id=canonical.workspace_id AND conflict.customer_id=canonical.customer_id))
              AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=head.id) OR
                (conflict.second_kind='verified_research' AND conflict.second_revision_id=head.id)))))
      ) ${batch ? `, selected AS (SELECT ranked.*,row_number() OVER(PARTITION BY account_id ORDER BY ${recallOrdering}) AS account_rank FROM ranked) SELECT * FROM selected WHERE account_rank<=8 ORDER BY account_id,account_rank` : `SELECT * FROM ranked WHERE query_matched OR NOT EXISTS(SELECT 1 FROM ranked WHERE query_matched) ORDER BY (account_id=$3) DESC,${recallOrdering} LIMIT 8`}`;}

/** Same selected-passage boundary independently for every authorized account. */
export async function recallPublicLearningForAccounts(identity:AppIdentity,accountIds:readonly string[],signal:AbortSignal,db:PoolClient){
 if(identity.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID)throw hiddenRecord();
 const ids=[...new Set(accountIds)].sort();
 await lockProfileActors(db,identity,ids,undefined,true);
 if(!ids.length)return [];
 const rows=(await db.query(selectionSql(true),[identity.environmentId,identity.workspaceId,ids[0],'',false,identity.membershipId,identity.kind,ids])).rows;
 signal.throwIfAborted();
 return parseSelected(identity,rows,db);
}
