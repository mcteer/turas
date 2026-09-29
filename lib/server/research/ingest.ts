import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { qualityInputSchema } from "../../contracts/profiles";
import type { CurrentSession } from "../auth/sessions";
import { rateEvidence } from "../profiles/quality";
import { materializeCurrentProjection,retireRetrievalProjection } from "../retrieval/projections";
import { lockResearchOwner } from "./policy";
import { passageSupportsResearchScope } from "./normalize";

export const publicAuthorityPolicy = "public-authority-v1" as const;
const trustedIdentity = "public-fetch-v1";

function officialProductAuthority(url: URL,product: string): boolean {
  return product.toLowerCase() === "vercel" &&
    (url.hostname === "vercel.com" || url.hostname === "www.vercel.com") &&
    url.pathname.startsWith("/docs/");
}

/** The synthetic fixture writer remains separate; only checked server fetches enter here. */
export async function ingestCheckedObservation(client: PoolClient,actor: CurrentSession,
  observationId: string): Promise<{ sourceRevisionId: string; attributed: boolean }> {
  const found = await client.query<{ id: string; run_id: string; origin: string;
    canonical_url: string; passage_text: string; passage_digest: string;
    body_digest: string; normalized_digest: string | null;
    normalized_text: string; raw_body: Buffer | null;
    retrieval_at: Date;
    identity_checked: boolean; scope_checked: boolean; integrity_checked: boolean;
    content_checked: boolean; customer_id: string; workspace_id: string;
    conversation_id: string; mode: string; public_fields: Record<string,unknown>;
    run_state: string; operation_state: string }>(`
    SELECT o.id,o.run_id,o.origin,o.canonical_url,o.passage_text,o.passage_digest,
      o.body_digest,o.normalized_digest,p.normalized_text,p.raw_body,o.retrieval_at,
      o.identity_checked,o.scope_checked,
      o.integrity_checked,o.content_checked,r.customer_id,r.workspace_id,
      req.conversation_id,req.mode,req.public_fields,r.state AS run_state,
      operation.state AS operation_state
    FROM research_observations o JOIN research_observation_payloads p ON p.observation_id=o.id
    JOIN research_runs r ON r.id=o.run_id
    JOIN research_operations operation ON operation.id=o.operation_id
    JOIN research_requests req ON req.id=r.request_id
    WHERE o.id=$1 FOR UPDATE OF o,r`,[observationId]);
  const row = found.rows[0];
  if (!row) throw hiddenRecord();
  await lockResearchOwner(client,actor,row.customer_id,row.conversation_id);
  const contentSupportsScope = passageSupportsResearchScope(row.passage_text,
    row.mode,row.public_fields);
  if (row.workspace_id !== actor.workspaceId || row.origin !== "independent_discovery" ||
      !row.identity_checked || !row.scope_checked || !row.integrity_checked ||
      !row.content_checked || !contentSupportsScope ||
      !row.normalized_text.includes(row.passage_text) ||
      !row.normalized_digest ||
      createHash("sha256").update(row.normalized_text).digest("hex") !== row.normalized_digest ||
      !row.raw_body || createHash("sha256").update(row.raw_body).digest("hex") !== row.body_digest ||
      createHash("sha256").update(row.passage_text).digest("hex") !== row.passage_digest) {
    throw new HttpFailure(409,"research_source_unverified","Public source is not verified");
  }
  const current = await client.query<{ id: string; retired: boolean }>(`
    SELECT link.source_revision_id AS id,
      EXISTS (SELECT 1 FROM evidence_source_events event
        WHERE event.source_revision_id=link.source_revision_id
          AND event.event_type IN ('withdraw','supersede')) AS retired
    FROM research_evidence_links link
    WHERE link.observation_id=$1 AND link.linkage_state='attributed'`,[observationId]);
  if (current.rows[0]?.retired) {
    throw new HttpFailure(409,"research_source_retired","Public source is no longer current");
  }
  if (current.rows[0]) return { sourceRevisionId: current.rows[0].id,attributed: true };
  if (row.run_state !== "running" || row.operation_state !== "succeeded") {
    throw new HttpFailure(409,"research_not_running","Research is no longer running");
  }
  const url = new URL(row.canonical_url);
  const official = row.mode === "practices" &&
    officialProductAuthority(url,String(row.public_fields.product ?? ""));
  const qualityInput = qualityInputSchema.parse({ rubricVersion: "evidence-quality-v1",
    R: official ? 4 : 1,D: 4,C: 0,
    reliabilityRationale: official ?
      "Exact quotation from the versioned official product documentation allowlist" :
      "Public source identity checked; authority awaits steward review",
    directnessRationale: "Exact quotation retained from the fetched public page",
    corroborationRationale: "No independently verified corroborating origin counted",
    informationType: row.mode === "practices" ? "product_capability" : "account_status",
    dateBasis: "observation" });
  const title = await client.query<{ title: string }>(`
    SELECT title FROM research_discovery_results
    WHERE run_id=$1 AND public_url=$2 ORDER BY created_at LIMIT 1`,
  [row.run_id,row.canonical_url]);
  const sourceTitle = title.rows[0]?.title ?? "Verified public page";
  await client.query(`SELECT customer_id FROM customer_profile_state
    WHERE customer_id=$1 AND workspace_id=$2 FOR UPDATE`,[row.customer_id,row.workspace_id]);
  const source = await client.query<{ id: string }>(`SELECT id FROM evidence_sources
    WHERE workspace_id=$1 AND customer_id=$2 AND origin='independent_research'
      AND canonical_location=$3 FOR UPDATE`,
  [row.workspace_id,row.customer_id,row.canonical_url]);
  const sourceId = source.rows[0]?.id ?? randomUUID();
  if (!source.rows[0]) await client.query(`INSERT INTO evidence_sources
    (id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity)
    VALUES($1,$2,$3,'independent_research',$4,$5)`,
  [sourceId,row.workspace_id,row.customer_id,row.canonical_url,trustedIdentity]);
  const prior = await client.query<{ id: string; version: string;
    passage_digest: string; retired: boolean }>(`
    SELECT revision.id,revision.version,revision.passage_digest,
      EXISTS (SELECT 1 FROM evidence_source_events event
        WHERE event.source_revision_id=revision.id
          AND event.event_type IN ('withdraw','supersede')) AS retired
    FROM evidence_source_revisions revision
    WHERE revision.source_id=$1 ORDER BY revision.version DESC LIMIT 1`,[sourceId]);
  const previous = prior.rows[0];
  let revisionId: string;
  if (previous?.passage_digest === row.passage_digest && !previous.retired) {
    revisionId = previous.id;
  } else {
    revisionId = randomUUID();
    const version = Number(previous?.version ?? 0)+1;
    await client.query(`INSERT INTO evidence_source_revisions
      (id,source_id,workspace_id,customer_id,version,location,title,passage,
       supported_claim,passage_digest,observation_at,retrieval_at,rights,audience,quality_input)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$10,$11,'delivery',$12)`,
    [revisionId,sourceId,row.workspace_id,row.customer_id,version,row.canonical_url,
      sourceTitle,row.passage_text,row.passage_digest,row.retrieval_at,
      "Public quotation with source attribution",JSON.stringify(qualityInput)]);
    await client.query(`INSERT INTO research_checks
      (source_revision_id,trusted_ingest_identity,check_version,identity_result,
       scope_result,integrity_result,content_result,rationale)
      VALUES($1,$2,'research-check-v2',true,true,true,true,$3)`,
    [revisionId,trustedIdentity,official ?
      `${publicAuthorityPolicy}: official product passage` :
      `${publicAuthorityPolicy}: public identity, low authority pending review`]);
    const rated = rateEvidence({ R: qualityInput.R,D: qualityInput.D,C: qualityInput.C,
      informationType: qualityInput.informationType,dateBasis: qualityInput.dateBasis,
      evidenceAt: row.retrieval_at,asOf: new Date() });
    await client.query(`INSERT INTO evidence_quality_snapshots
      (id,source_revision_id,rubric_version,rating_actor,input,information_type,
       date_basis,as_of,freshness,score,band)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(),revisionId,qualityInput.rubricVersion,trustedIdentity,
      JSON.stringify(qualityInput),qualityInput.informationType,qualityInput.dateBasis,
      rated.asOf,rated.F,rated.Q,rated.band]);
    if (previous && !previous.retired) await client.query(`INSERT INTO evidence_source_events
      (id,source_revision_id,lifecycle_version,event_type,rationale)
      VALUES($1,$2,1,'supersede','New checked public observation')`,
    [randomUUID(),previous.id]);
    if (previous && !previous.retired) await retireRetrievalProjection(client,
      "verified_research",previous.id);
    if (previous) await client.query(`UPDATE customer_profile_state SET version=version+1,
      internal_generation=internal_generation+1,delivery_generation=delivery_generation+1,
      updated_at=now() WHERE customer_id=$1`,[row.customer_id]);
    await materializeCurrentProjection(client,"verified_research",revisionId,"delivery");
    await materializeCurrentProjection(client,"verified_research",revisionId,"internal");
  }
  await client.query(`INSERT INTO research_evidence_links
    (id,observation_id,source_revision_id,linkage_state)
    VALUES($1,$2,$3,'attributed') ON CONFLICT (observation_id,source_revision_id) DO NOTHING`,
  [randomUUID(),observationId,revisionId]);
  return { sourceRevisionId: revisionId,attributed: true };
}
