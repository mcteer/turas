import {withOperationalProviderIo} from '../../../operations/admission';
import {signCheckedPublicPage,type CheckedPublicPage} from "../../public-dossier";
import { embedRetrievalTexts } from "../../../retrieval/embeddings";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import { embeddingModel, embeddingSchema, embeddingsConfigured, embedQuery } from "../embeddings";
import { readPublicSource } from "../solution-research/provider";
import { sourceSchema } from "../solution-research/schema";
import { researchPassages } from "../solution-research/source-integrity";
import { cachedFetch } from "./fetch";
import { evidenceDatabase } from "./database";
import { canonicalSourceUrl, digest, normalized, snapshotReferenceSchema } from "./schema";
import { researchSourceIsEligible, requireResearchAccount } from "../account";
import { withTransaction } from "../../../db/client";
import { lockWorkspaceActor } from "../../../profiles/policy";
import {getServerConfig} from "../../../config";

const pageSchema = z.object({ source: sourceSchema, truncated: z.boolean(),proof:z.object({
  url:z.url(),title:z.string(),text:z.string(),bodyDigest:z.string(),normalizedDigest:z.string(),
  retrievedAt:z.string(),publishedAt:z.string().nullable(),discoveryPurpose:z.string(),
  receiptSignature:z.string().optional(),textTruncated:z.boolean().optional(),totalNormalizedCharacters:z.number().optional(),
}).optional() });
const snapshotSchema = z.object({ id: z.string(), source: sourceSchema, truncated: z.boolean(), checked_at: z.coerce.date(), refresh_after: z.coerce.date(), index_state: z.string() });

type ReadOptions={recordAccount?:boolean;independentDiscovery?:CheckedPublicPage["independentDiscovery"];informationType?:z.infer<typeof sourceSchema>['informationType']};
const maintenanceBrand=Symbol('retained-public-source-maintenance');
type MaintenanceScope=Pick<AppIdentity,'environmentId'|'workspaceId'>&{[maintenanceBrand]:true;accountId:string;url:string};

export async function readCachedSource(identity:AppIdentity,accountId:string,workload:string,url:string,signal:AbortSignal,notBefore?:Date,options:ReadOptions={}){
 return readCachedSourceForScope(identity,accountId,workload,url,signal,notBefore,options);
}

/** Service maintenance can only recheck an already-retained public URL. It has
 * no human login, private customer-read capability, or profile-write authority. */
export async function refreshRetainedPublicSource(scope:Pick<AppIdentity,'environmentId'|'workspaceId'>,accountId:string,url:string,signal:AbortSignal){
 const canonical=canonicalSourceUrl(url);
 const authority:MaintenanceScope={...scope,accountId,url:canonical,[maintenanceBrand]:true};
 await assertPublicMaintenanceScope(authority);
 return readCachedSourceForScope(authority,accountId,'public evidence',canonical,signal,undefined,{recordAccount:false});
}
export async function retainedPublicSourceMaintenanceAllowed(scope:Pick<AppIdentity,'environmentId'|'workspaceId'>,accountId:string,url:string){
 try{await assertPublicMaintenanceScope({...scope,accountId,url:canonicalSourceUrl(url),[maintenanceBrand]:true});return true;}catch{return false;}
}
async function assertPublicMaintenanceScope(scope:MaintenanceScope){
 if(scope.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID)throw new Error('Research maintenance environment mismatch');
 await withTransaction(async db=>{
  const allowed=await db.query(`SELECT 1 FROM turas_public_learning l
   JOIN customer_references c ON c.id::text=l.account_id AND c.workspace_id::text=l.workspace_id AND NOT c.synthetic
   JOIN workspaces w ON w.id=c.workspace_id AND w.active
   WHERE l.environment_id=$1 AND l.workspace_id=$2 AND l.account_id=$3 AND l.url=$4
    AND NOT EXISTS(SELECT 1 FROM evidence_sources s LEFT JOIN LATERAL
     (SELECT id FROM evidence_source_revisions WHERE source_id=s.id ORDER BY version DESC LIMIT 1) head ON true
     WHERE s.workspace_id=c.workspace_id AND s.customer_id=c.id AND s.origin='independent_research' AND s.canonical_location=l.url
      AND (head.id IS NULL OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=head.id AND e.event_type IN('withdraw','supersede'))
       OR NOT EXISTS(SELECT 1 FROM research_checks checks WHERE checks.source_revision_id=head.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result)
       OR EXISTS(SELECT 1 FROM evidence_conflicts conflict WHERE conflict.workspace_id=c.workspace_id AND conflict.customer_id=c.id
        AND conflict.state IN('flagged','confirmed') AND head.id IN(conflict.first_revision_id,conflict.second_revision_id)))) LIMIT 1`,
   [scope.environmentId,scope.workspaceId,scope.accountId,scope.url]);
  if(!allowed.rowCount)throw new Error('Public maintenance source is no longer eligible');
 });
}
async function readCachedSourceForScopeWithinFence(identity:AppIdentity|MaintenanceScope,accountId:string,workload:string,url:string,signal:AbortSignal,notBefore?:Date,options:ReadOptions={}) {
  const maintenance=maintenanceBrand in identity;
  if(maintenance){
   if(options.recordAccount!==false || identity.accountId!==accountId || identity.url!==canonicalSourceUrl(url))throw new Error('Invalid public maintenance scope');
   await assertPublicMaintenanceScope(identity);
  } else if(options.recordAccount!==false) await requireResearchAccount(identity,accountId);
  else await withTransaction(db=>lockWorkspaceActor(db,identity,undefined,true));
  const canonical = canonicalSourceUrl(url);
  if(!maintenance && options.recordAccount!==false && !await researchSourceIsEligible(identity,accountId,canonical))
    throw new Error("The customer source is no longer eligible; explicit source recovery is required.");
  const key = "page:" + digest(canonical);
  const read = await cachedFetch(identity, key, pageSchema, () => readPublicSource(canonical, signal), signal, { notBefore });
  const { source, truncated,proof:originalProof } = read.value;
  const discovery=options.independentDiscovery;
  if(discovery && (discovery.accountId!==accountId || !discovery.searchId || !['context','gateway_exa'].includes(discovery.provider) || !Number.isFinite(Date.parse(discovery.checkedAt))))throw new Error('Invalid independent discovery association');
  const proof=originalProof&&discovery?signCheckedPublicPage({...originalProof,independentDiscovery:discovery}):originalProof;
  const contentHash = digest(JSON.stringify([source.url, source.title, source.excerpt, source.publication ?? null, truncated,proof?.normalizedDigest??null]));
  const id = digest(canonical + "\n" + contentHash);
  const sql = await evidenceDatabase();
  signal.throwIfAborted();
  await sql.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,check_receipt)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb) ON CONFLICT(environment_id,workspace_id,id)
    DO UPDATE SET checked_at=greatest(turas_evidence_snapshots.checked_at,excluded.checked_at),
      refresh_after=greatest(turas_evidence_snapshots.refresh_after,excluded.refresh_after),
      check_receipt=CASE WHEN excluded.checked_at>=turas_evidence_snapshots.checked_at THEN excluded.check_receipt ELSE turas_evidence_snapshots.check_receipt END`,
    [identity.environmentId, identity.workspaceId, id, key, source.url, contentHash, JSON.stringify(source), truncated, read.checkedAt, read.refreshAfter,proof?JSON.stringify(proof):null]);
  if (!maintenance && options.recordAccount !== false) {
    await sql.query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility)
      VALUES($1,$2,$3,$4,$5,$6,'public') ON CONFLICT(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id) DO UPDATE SET visibility='public'`,
      [identity.environmentId, identity.workspaceId, identity.userId, accountId, normalized(workload), id]);
  }
  const paragraphs = researchPassages(source);
  const chunks: string[] = [];
  let packed="";
  for (const paragraph of paragraphs) {
    const characters=Array.from(paragraph.text);
    for(let offset=0;offset<characters.length;offset+=2000) {
      const part=characters.slice(offset,offset+2000).join("");
      if(packed && Array.from(packed+"\n\n"+part).length>2000){chunks.push(packed);packed="";}
      packed=packed?packed+"\n\n"+part:part;
    }
  }
  if(packed)chunks.push(packed);
  await sql.query(`INSERT INTO turas_evidence_passages(environment_id,workspace_id,snapshot_id,ordinal,text,model)
    SELECT $1,$2,$3,ordinality::integer,value,$4 FROM jsonb_array_elements_text($5::jsonb) WITH ORDINALITY
    ON CONFLICT DO NOTHING`, [identity.environmentId, identity.workspaceId, id, embeddingModel, JSON.stringify(chunks)]);
  await indexSnapshot(identity, id, signal);
  signal.throwIfAborted();
  const cachedSource = { ...source,...(options.informationType?{informationType:options.informationType}:{}),cache: { snapshotId: id, checkedAt: read.checkedAt, refreshAfter: read.refreshAfter } };
  let retentionWarning:string|null=null;
  if (!maintenance && options.recordAccount !== false) {
    // Source reads happen inside the background research specialists. Retain the
    // exact newly fetched passages immediately, without waiting for a generated
    // brief or copying any model interpretation into the account profile.
    try {
      const { learnPublicSources, publicLearningHasSource } = await import("./public-learning");
      await learnPublicSources(identity, accountId, [cachedSource], researchPassages(source).map(passage => ({ sourceId: source.id, passageId: passage.id })), signal);
    } catch(error) {
      const code=error && typeof error==='object' && 'code' in error && typeof error.code==='string'?error.code:
        error instanceof Error && error.message==='Public fetch receipt signature is invalid'?'invalid_fetch_signature':'retention_unavailable';
      console.warn(JSON.stringify({ event: "public_learning.background_write_failed",code }));
      retentionWarning='The page was read, but shared customer knowledge could not be updated. Do not claim profile persistence succeeded.';
    }
  }
  return { source: cachedSource, truncated, cacheHit: read.hit,retentionWarning };
}

async function indexSnapshotWithinFence(identity: Pick<AppIdentity, "environmentId" | "workspaceId">, id: string, signal: AbortSignal) {
  if (!embeddingsConfigured()) return;
  const sql = await evidenceDatabase();
  const scope = [identity.environmentId, identity.workspaceId, id];
  const claimed = await sql.query(`UPDATE turas_evidence_snapshots SET index_state='indexing',index_attempts=index_attempts+1,index_after=now()+interval '2 minutes'
    WHERE environment_id=$1 AND workspace_id=$2 AND id=$3 AND index_state<>'ready' AND index_attempts<3 AND index_after<=now() RETURNING id`, scope);
  if (!claimed.length) return;
  try {
    const chunks = z.array(z.object({ ordinal: z.number().int(), text: z.string() })).parse(await sql.query(
      `SELECT ordinal,text FROM turas_evidence_passages WHERE environment_id=$1 AND workspace_id=$2 AND snapshot_id=$3 ORDER BY ordinal`, scope));
    const embedded:number[][]=[];
    for(let offset=0;offset<chunks.length;offset+=32) {
      signal.throwIfAborted();
      embedded.push(...await embedRetrievalTexts(chunks.slice(offset,offset+32).map(chunk=>chunk.text),{signal}));
    }
    const vectors = z.array(embeddingSchema).length(chunks.length).parse(embedded);
    signal.throwIfAborted();
    await sql.transaction([
      ...chunks.map((chunk, i) => sql.query(`UPDATE turas_evidence_passages SET embedding=$5::vector
        WHERE environment_id=$1 AND workspace_id=$2 AND snapshot_id=$3 AND ordinal=$4`, [...scope, chunk.ordinal, JSON.stringify(vectors[i])])),
      sql.query(`UPDATE turas_evidence_snapshots SET index_state='ready' WHERE environment_id=$1 AND workspace_id=$2 AND id=$3`, scope),
    ]);
    console.info(JSON.stringify({ event: "research_cache.indexed", snapshotId: id, chunks: chunks.length }));
  } catch {
    await sql.query(`UPDATE turas_evidence_snapshots SET index_state='failed',index_after=now()+interval '15 minutes'
      WHERE environment_id=$1 AND workspace_id=$2 AND id=$3`, scope);
    console.warn(JSON.stringify({ event: "research_cache.index_failed", snapshotId: id }));
    signal.throwIfAborted();
  }
}

export async function storedSourceCandidates(identity: AppIdentity, accountId: string, workload: string, query: string, signal: AbortSignal) {
  await requireResearchAccount(identity,accountId);
  const sql = await evidenceDatabase();
  let vector: number[] | null = null;
  const available = await sql.query(`SELECT 1 FROM turas_evidence_accounts
    WHERE environment_id=$1 AND workspace_id=$2 AND (owner_user_id=$3 OR visibility='public') AND account_id=$4 AND workload=$5 LIMIT 1`,
    [identity.environmentId, identity.workspaceId, identity.userId, accountId, normalized(workload)]);
  if (!available.length) return { retrieval: "keyword" as const, sources: [] };
  if (embeddingsConfigured() && query) {
    try {
      const key = "query:" + digest(JSON.stringify([identity.userId, accountId, normalized(workload), normalized(query), embeddingModel]));
      vector = (await cachedFetch(identity, key, embeddingSchema, () => embedQuery(query, signal), signal)).value;
    } catch { signal.throwIfAborted(); }
  }
  const rows = await sql.query(`WITH eligible AS MATERIALIZED (
      SELECT DISTINCT s.* FROM turas_evidence_snapshots s JOIN turas_evidence_accounts a
      ON a.environment_id=s.environment_id AND a.workspace_id=s.workspace_id AND a.snapshot_id=s.id
      WHERE a.environment_id=$1 AND a.workspace_id=$2 AND (a.owner_user_id=$3 OR a.visibility='public') AND a.account_id=$4 AND a.workload=$5
      AND NOT EXISTS (SELECT 1 FROM turas_evidence_snapshots newer WHERE newer.environment_id=s.environment_id
        AND newer.workspace_id=s.workspace_id AND newer.fetch_key=s.fetch_key AND newer.checked_at>s.checked_at)
      AND NOT EXISTS(SELECT 1 FROM evidence_sources canonical
        LEFT JOIN LATERAL(SELECT * FROM evidence_source_revisions v WHERE v.source_id=canonical.id ORDER BY v.version DESC LIMIT 1) head ON true
        WHERE canonical.workspace_id=$2::uuid AND canonical.customer_id=$4::uuid AND canonical.origin='independent_research'
          AND canonical.canonical_location=s.url AND (head.id IS NULL OR ($9='partner' AND head.audience<>'delivery')
            OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=head.id AND e.event_type IN('withdraw','supersede'))
            OR NOT EXISTS(SELECT 1 FROM research_checks checks WHERE checks.source_revision_id=head.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result)
            OR EXISTS(SELECT 1 FROM independent_research_documents document WHERE document.source_revision_id=head.id AND encode(sha256(convert_to(document.document_text,'UTF8')),'hex')<>document.document_digest)
            OR EXISTS(SELECT 1 FROM evidence_conflict_targets conflict WHERE conflict.environment_id=$1 AND conflict.state='confirmed'
              AND (conflict.scope='shared' OR (conflict.scope='customer' AND conflict.workspace_id=canonical.workspace_id AND conflict.customer_id=canonical.customer_id))
              AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=head.id) OR
                (conflict.second_kind='verified_research' AND conflict.second_revision_id=head.id)))))
    ), text_hits AS (
      SELECT snapshot_id,row_number() OVER(ORDER BY max(ts_rank_cd(p.search_text,websearch_to_tsquery('english',$6))) DESC,snapshot_id) AS rank
      FROM turas_evidence_passages p JOIN eligible s ON s.id=p.snapshot_id
      WHERE p.environment_id=$1 AND p.workspace_id=$2 AND p.search_text @@ websearch_to_tsquery('english',$6) GROUP BY snapshot_id ORDER BY rank LIMIT 30
    ), vector_hits AS (
      SELECT snapshot_id,row_number() OVER(ORDER BY min(p.embedding <=> $7::vector),snapshot_id) AS rank
      FROM turas_evidence_passages p JOIN eligible s ON s.id=p.snapshot_id
      WHERE p.environment_id=$1 AND p.workspace_id=$2 AND p.embedding IS NOT NULL AND $7::vector IS NOT NULL AND p.model=$8
      GROUP BY snapshot_id HAVING min(p.embedding <=> $7::vector)<0.75 ORDER BY rank LIMIT 30
    ), ranked AS (
      SELECT coalesce(t.snapshot_id,v.snapshot_id) AS id,coalesce(1.0/(60+t.rank),0)+coalesce(1.0/(60+v.rank),0) AS score
      FROM text_hits t FULL JOIN vector_hits v ON t.snapshot_id=v.snapshot_id
    ) SELECT s.id,s.source,s.truncated,s.checked_at,s.refresh_after,s.index_state FROM eligible s JOIN ranked r ON r.id=s.id
      ORDER BY r.score DESC,s.id LIMIT 8`,
    [identity.environmentId, identity.workspaceId, identity.userId, accountId, normalized(workload), query,
      vector ? JSON.stringify(vector) : null, embeddingModel,identity.kind]);
  signal.throwIfAborted();
  const eligible=[];
  for(const row of z.array(snapshotSchema).parse(rows)){
    signal.throwIfAborted();
    if(await researchSourceIsEligible(identity,accountId,row.source.url))eligible.push(row);
  }
  return { retrieval: vector ? "hybrid" as const : "keyword" as const, sources: eligible.map(row => ({
    id: row.source.id, url: row.source.url, title: row.source.title, truncated: row.truncated,
    checkedAt: row.checked_at.toISOString(), refreshAfter: row.refresh_after.toISOString(),
    stale: row.refresh_after.getTime() <= Date.now(), snapshotId: row.id,
  })) };
}

export async function snapshotDependenciesValid(identity: AppIdentity, references: z.infer<typeof snapshotReferenceSchema>[],accountId:string) {
  if (!references.length) return false;
  const sql = await evidenceDatabase();
  const ids = [...new Set(references.map(r => r.snapshotId))];
  const rows = await sql.query(`SELECT s.id,s.url FROM turas_evidence_snapshots s
    WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.id=ANY($3::text[]) AND s.refresh_after>now()
    AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots n WHERE n.environment_id=s.environment_id AND n.workspace_id=s.workspace_id
      AND n.fetch_key=s.fetch_key AND n.checked_at>s.checked_at)`, [identity.environmentId, identity.workspaceId, ids]);
  if(rows.length!==ids.length)return false;
  for(const row of rows)if(!await researchSourceIsEligible(identity,accountId,z.string().parse(row.url)))return false;
  return true;
}

export async function indexSnapshot(identity: Pick<AppIdentity, "environmentId" | "workspaceId">, id: string, signal: AbortSignal) {
 return withOperationalProviderIo(()=>indexSnapshotWithinFence(identity,id,signal),signal);
}

async function readCachedSourceForScope(identity:AppIdentity|MaintenanceScope,accountId:string,workload:string,url:string,signal:AbortSignal,notBefore?:Date,options:ReadOptions={}) {
 return withOperationalProviderIo(()=>readCachedSourceForScopeWithinFence(identity,accountId,workload,url,signal,notBefore,options),signal);
}
