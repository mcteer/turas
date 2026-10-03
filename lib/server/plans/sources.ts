import type { PoolClient } from "pg";
import type { PlanDraftContent } from "../../contracts/plan-content";
import { planSha256 } from "../../contracts/plans";
import { HttpFailure } from "../../contracts/http";
import { hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { evidenceQualitySchema } from "../../contracts/retrieval";
import { currentFactEligible,retrievalQuality } from "../retrieval/context";
import { knowledgeLineageHasMaterialConflict } from "../profiles/eligibility";
import type { PlanIssue } from "../../contracts/plan-content";
import { authorizeRetrievalScope,recheckRetrievalSource } from "../retrieval/policy";
import { resolveRetrievalCitation } from "../retrieval/citations";
import { originalCurrent } from "../retrieval/fences";
import type { PlanActor } from "./policy";

type SourceReference = PlanDraftContent["sourceDependencies"][number];
type SourceRow = {id:string;source_kind:string;source_revision_id:string;
  source_generation:string;audience:string;content_digest:string;
  projection_contract:string;workload_id:string|null};

function retrievalKind(kind:SourceReference["kind"]):string {
  return kind === "shared_knowledge" ? "published_shared" : kind;
}

export async function lockOriginalHeader(client:PoolClient,
  kind:SourceReference["kind"],id:string):Promise<void> {
  let result;
  switch (kind) {
    case "accepted_profile":
      result=await client.query(`SELECT 1 FROM profile_revisions revision
        JOIN profile_records record ON record.id=revision.record_id
        WHERE revision.id=$1 FOR SHARE OF record`,[id]);
      break;
    case "approved_excerpt":
      result=await client.query(`SELECT 1 FROM artifact_evidence_selections selection
        JOIN artifact_versions version ON version.id=selection.version_id
        WHERE selection.id=$1 FOR SHARE OF version`,[id]);
      break;
    case "verified_research":
      result=await client.query(`SELECT 1 FROM evidence_source_revisions revision
        JOIN evidence_sources source ON source.id=revision.source_id
        WHERE revision.id=$1 FOR SHARE OF source`,[id]);
      break;
    case "shared_knowledge":
      result=await client.query(`SELECT 1 FROM knowledge_publications publication
        WHERE publication.revision_id=$1 FOR SHARE OF publication`,[id]);
      break;
  }
  if (!result.rowCount) throw new HttpFailure(409,"plan_source_changed",
    "Plan evidence changed; review its sources again");
}

/** Lock a union of immutable revision dependencies before a batched consumer
 * acquires engagement/workforce locks. Missing originals remain ineligible;
 * currentPlanSourceDigest still performs each revision's authority checks. */
export async function lockPlanRevisionSourceHeaders(client: PoolClient, revisionIds: readonly string[]) {
  const rows = (await client.query<{source_kind: string; source_revision_id: string}>(`
    SELECT source_kind,source_revision_id FROM plan_source_dependencies WHERE revision_id=ANY($1::uuid[])
    UNION SELECT CASE WHEN source_kind='published_shared' THEN 'shared_knowledge' ELSE source_kind END,source_revision_id
      FROM plan_private_dependencies WHERE revision_id=ANY($1::uuid[])
    ORDER BY source_kind,source_revision_id`, [revisionIds])).rows;
  for (const row of rows) {
    if (!["accepted_profile", "approved_excerpt", "verified_research", "shared_knowledge"].includes(row.source_kind)) {
      throw new HttpFailure(409, "plan_source_changed", "Plan evidence changed; review its sources again");
    }
    try { await lockOriginalHeader(client, row.source_kind as SourceReference["kind"], row.source_revision_id); }
    catch (error) {
      if (!(error instanceof HttpFailure) || error.status !== 409) throw error;
      // Consumers check the missing original and retain historical commitments.
    }
  }
}

/** Resolve original identities under the reader's current scope, never receipt TTL. */
export async function verifyPlanSources(client:PoolClient,actor:PlanActor,
  customerId:string,workloadId:string|null,audience:"internal"|"delivery",
  references:readonly SourceReference[],lock=false,
  alreadyAuthorized=false):Promise<string> {
  // Callers may skip the duplicate retrieval actor check only while holding
  // lockPlanActor's current authority locks in this same transaction.
  const scope = alreadyAuthorized ? {
    environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,
    workspaceId:actor.workspaceId,customerId,audience,includeShared:true,
  } : await authorizeRetrievalScope(client,actor,"combined",customerId,
    audience,true);
  const ordered = [...references].sort((a,b) =>
    a.kind.localeCompare(b.kind) || a.sourceRevisionId.localeCompare(b.sourceRevisionId) ||
    a.id.localeCompare(b.id));
  const state:string[] = [];
  for (const reference of ordered) {
    if (lock) await lockOriginalHeader(client,reference.kind,
      reference.sourceRevisionId);
    if (reference.citationId) {
      const citation = await resolveRetrievalCitation(client,actor,reference.citationId);
      const receipt = await client.query<{source_kind:string;source_revision_id:string;
        source_generation:string}>(`SELECT citation.source_kind,citation.source_revision_id,
        citation.source_generation FROM retrieval_receipt_sources citation
        JOIN retrieval_receipts receipt ON receipt.id=citation.receipt_id
        WHERE citation.id=$1 AND receipt.actor_membership_id=$2
          AND receipt.valid_until>now() AND citation.valid_until>now()`,
      [reference.citationId,actor.membershipId]);
      const recorded = receipt.rows[0];
      if (!recorded || recorded.source_kind !== retrievalKind(reference.kind) ||
          recorded.source_revision_id !== reference.sourceRevisionId ||
          Number(recorded.source_generation) !== reference.generation) {
        throw new HttpFailure(409,"plan_citation_changed",
          "Plan citation changed; choose current evidence");
      }
      if (!citation.locators.some((locator) =>
        planSha256(locator) === planSha256(reference.locator))) {
        throw new HttpFailure(409,"plan_citation_changed",
          "Plan citation changed; choose current evidence");
      }
    }
    const kind = retrievalKind(reference.kind);
    const candidates = await client.query<SourceRow>(`SELECT id,source_kind,source_revision_id,
      source_generation,audience,content_digest,projection_contract,workload_id
      FROM retrieval_sources WHERE environment_id=$1 AND source_kind=$2
        AND source_revision_id=$3 AND source_generation=$4 AND content_digest=$5
        AND lifecycle_state='current'
        AND ((scope='shared' AND $6='published_shared') OR
          (scope='customer' AND workspace_id=$7 AND customer_id=$8
            AND (workload_id IS NULL OR workload_id=$9)
            AND (audience='delivery' OR $10='internal')))
      ORDER BY audience,id ${lock ? "FOR SHARE" : ""}`,
    [scope.environmentId,kind,reference.sourceRevisionId,reference.generation,
      reference.contentDigest,kind,actor.workspaceId,customerId,workloadId,audience]);
    let current = false;
    for (const candidate of candidates.rows) {
      const located = await client.query(`SELECT 1 FROM retrieval_passages
        WHERE source_id=$1 AND locators @> $2::jsonb LIMIT 1`,
      [candidate.id,JSON.stringify([reference.locator])]);
      if (!located.rowCount) continue;
      if (await recheckRetrievalSource(client,{
        id:candidate.id,kind:candidate.source_kind,
        revisionId:candidate.source_revision_id,generation:Number(candidate.source_generation),
        audience:candidate.audience,contentDigest:candidate.content_digest,
        projectionContract:candidate.projection_contract,
      },scope)) { current = true;break; }
    }
    if (!current) throw new HttpFailure(409,"plan_source_changed",
      "Plan evidence changed; review its sources again");
    if (await materialConflict(client,actor,customerId,reference)) {
      throw new HttpFailure(409,"plan_source_changed",
        "Plan evidence changed; review its sources again");
    }
    state.push(`${reference.kind}:${reference.sourceRevisionId}:${reference.generation}:${reference.contentDigest}`);
  }
  return planSha256(state);
}

export async function persistPlanSources(client:PoolClient,revisionId:string,
  references:readonly SourceReference[],consumedByModel=false):Promise<void> {
  for (const reference of references) {
    await client.query(`INSERT INTO plan_source_dependencies
      (revision_id,dependency_id,source_kind,source_revision_id,source_generation,
       source_digest,locator,consumed_by_model)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [revisionId,reference.id,reference.kind,reference.sourceRevisionId,
      reference.generation,reference.contentDigest,JSON.stringify(reference.locator),
      consumedByModel]);
    if (reference.kind === "shared_knowledge") {
      const lineage = await client.query<{source_kind:string;source_revision_id:string;
        source_generation:string;source_digest:string}>(`SELECT source_kind,source_revision_id,
        source_generation,source_digest FROM knowledge_lineage WHERE revision_id=$1
        ORDER BY source_kind,source_revision_id`,[reference.sourceRevisionId]);
      for (const privateSource of lineage.rows) {
        await client.query(`INSERT INTO plan_private_dependencies
          (revision_id,source_kind,source_revision_id,source_generation,source_digest)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [revisionId,privateSource.source_kind,privateSource.source_revision_id,
          privateSource.source_generation,privateSource.source_digest]);
      }
    }
  }
}

export async function currentPlanSourceDigest(client:PoolClient,actor:PlanActor,
  revisionId:string,customerId:string,workloadId:string|null,
  audience:"internal"|"delivery",lock=false,
  alreadyAuthorized=false):Promise<string> {
  const dependencies = await client.query<{dependency_id:string;source_kind:SourceReference["kind"];
    source_revision_id:string;source_generation:string;source_digest:string;locator:unknown}>(
    `SELECT dependency_id,source_kind,source_revision_id,source_generation,source_digest,
      locator FROM plan_source_dependencies WHERE revision_id=$1
      ORDER BY source_kind,source_revision_id,source_generation`,[revisionId]);
  const privateSources=await client.query<{source_kind:string;source_revision_id:string;
    source_generation:string;source_digest:string}>(`
    SELECT source_kind,source_revision_id,source_generation,source_digest
    FROM plan_private_dependencies WHERE revision_id=$1
    ORDER BY source_kind,source_revision_id,source_generation`,[revisionId]);
  if(!dependencies.rows.length && !privateSources.rows.length) return planSha256([]);
  const direct=await verifyPlanSources(client,actor,customerId,workloadId,audience,
    dependencies.rows.map((row) => ({id:row.dependency_id,kind:row.source_kind,
      sourceRevisionId:row.source_revision_id,generation:Number(row.source_generation),
      contentDigest:row.source_digest,locator:row.locator as SourceReference["locator"]})),
    lock,alreadyAuthorized);
  for (const source of privateSources.rows) {
    if (lock) {
      const kind=source.source_kind==="published_shared" ? "shared_knowledge":
        source.source_kind;
      if (!["accepted_profile","approved_excerpt","verified_research",
        "shared_knowledge"].includes(kind)) throw new HttpFailure(409,
        "plan_source_changed","Plan evidence changed; review its sources again");
      await lockOriginalHeader(client,kind as SourceReference["kind"],
        source.source_revision_id);
    }
    if (!await originalCurrent(client,source)) {
      throw new HttpFailure(409,"plan_source_changed",
        "Plan evidence changed; review its sources again");
    }
    const conflict=await client.query(`SELECT 1 FROM evidence_conflict_targets
      WHERE state='confirmed' AND environment_id=$1
        AND ((first_kind=$2 AND first_revision_id=$3) OR
          (second_kind=$2 AND second_revision_id=$3)) LIMIT 1`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,source.source_kind,
      source.source_revision_id]);
    if (conflict.rowCount) throw new HttpFailure(409,"plan_source_changed",
      "Plan evidence changed; review its sources again");
  }
  return direct;
}

export async function readPlanSource(client:PoolClient,actor:PlanActor,
  planId:string,revisionId:string,dependencyId:string):Promise<{
    contractVersion:"delivery-plan-v1";dependencyId:string;sourceKind:string;
    sourceRevisionId:string;generation:number;locator:unknown;text:string}> {
  const { readPlan }=await import("./read");
  const detail=await readPlan(actor,planId,revisionId,client);
  if (!["readable","historical_warning"].includes(detail.contentAvailability)) throw hiddenRecord();
  const found=await client.query<{source_kind:SourceReference["kind"];
    source_revision_id:string;source_generation:string;source_digest:string;locator:unknown}>(
    `SELECT source_kind,source_revision_id,source_generation,source_digest,locator
      FROM plan_source_dependencies WHERE revision_id=$1 AND dependency_id=$2`,
    [revisionId,dependencyId]);
  const row=found.rows[0];
  if (!row) throw hiddenRecord();
  const reference:SourceReference={id:dependencyId,kind:row.source_kind,
    sourceRevisionId:row.source_revision_id,generation:Number(row.source_generation),
    contentDigest:row.source_digest,locator:row.locator as SourceReference["locator"]};
  await verifyPlanSources(client,actor,detail.customerId,detail.workloadId,
    detail.audience,[reference],true,true);
  const passage=await client.query<{passage_text:string}>(`SELECT passage.passage_text
    FROM retrieval_sources source JOIN retrieval_passages passage ON passage.source_id=source.id
    WHERE source.environment_id=$1 AND source.source_kind=$2
      AND source.source_revision_id=$3 AND source.source_generation=$4
      AND source.content_digest=$5 AND source.lifecycle_state='current'
      AND passage.locators @> $6::jsonb
      AND ((source.scope='shared' AND $2='published_shared') OR
        (source.scope='customer' AND source.workspace_id=$7 AND source.customer_id=$8
          AND (source.workload_id IS NULL OR source.workload_id=$9)
          AND (source.audience='delivery' OR $10='internal')))
    ORDER BY passage.chunk_index LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,retrievalKind(reference.kind),
    reference.sourceRevisionId,reference.generation,reference.contentDigest,
    JSON.stringify([reference.locator]),actor.workspaceId,detail.customerId,
    detail.workloadId,detail.audience]);
  if (!passage.rows[0]) throw hiddenRecord();
  return {contractVersion:"delivery-plan-v1",dependencyId,
    sourceKind:reference.kind,sourceRevisionId:reference.sourceRevisionId,
    generation:reference.generation,locator:reference.locator,
    text:passage.rows[0].passage_text.slice(0,2_000)};
}

async function sourceQuality(client:PoolClient,reference:SourceReference,at:Date) {
  if (reference.kind==="shared_knowledge") {
    const row=await client.query<{public_quality:unknown}>(
      "SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",
      [reference.sourceRevisionId]);
    return evidenceQualitySchema.safeParse(row.rows[0]?.public_quality).data ?? null;
  }
  if (reference.kind==="verified_research") {
    const row=await client.query<{quality_input:unknown;observation_at:Date|null;
      publication_at:Date|null}>(`SELECT quality_input,observation_at,publication_at
      FROM evidence_source_revisions WHERE id=$1`,[reference.sourceRevisionId]);
    return row.rows[0] ? retrievalQuality(row.rows[0].quality_input,{
      observationAt:row.rows[0].observation_at,
      publicationAt:row.rows[0].publication_at},at):null;
  }
  const row=await client.query<{quality_input:unknown;payload:Record<string,unknown>}>(`
    SELECT quality_input,payload FROM profile_revisions WHERE id=${
      reference.kind==="approved_excerpt" ?
        "(SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1)":"$1"}`,
    [reference.sourceRevisionId]);
  if (!row.rows[0]) return null;
  const payload=row.rows[0].payload;
  const observed=payload.observedAt ?? payload.observationEnd;
  return retrievalQuality(row.rows[0].quality_input,{
    observationAt:typeof observed==="string" ? new Date(observed):null,
    reviewAt:typeof payload.reviewAt==="string" ? new Date(payload.reviewAt):null},at);
}

async function materialConflict(client:PoolClient,actor:PlanActor,
  customerId:string,reference:SourceReference):Promise<boolean> {
  const kind=retrievalKind(reference.kind);
  const target=await client.query(`SELECT 1 FROM evidence_conflict_targets
    WHERE state='confirmed' AND environment_id=$1
      AND ((first_kind=$2 AND first_revision_id=$3) OR
        (second_kind=$2 AND second_revision_id=$3))
      AND (scope='shared' OR (workspace_id=$4 AND customer_id=$5)) LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,kind,reference.sourceRevisionId,
    actor.workspaceId,customerId]);
  if (target.rowCount) return true;
  if (reference.kind==="shared_knowledge") {
    return knowledgeLineageHasMaterialConflict(client,reference.sourceRevisionId);
  }
  if (reference.kind==="accepted_profile") {
    const legacy=await client.query(`SELECT 1 FROM evidence_conflicts
      WHERE state='confirmed' AND workspace_id=$1 AND customer_id=$2
        AND (first_revision_id=$3 OR second_revision_id=$3) LIMIT 1`,
    [actor.workspaceId,customerId,reference.sourceRevisionId]);
    return Boolean(legacy.rowCount);
  }
  return false;
}

export async function assessPlanEvidence(client:PoolClient,actor:PlanActor,
  customerId:string,content:Pick<PlanDraftContent,"sourceDependencies"|"assertions">):Promise<{
    issues:PlanIssue[];historicalWarning:boolean}> {
  const at=new Date();
  const evaluations=new Map<string,{adequate:boolean;warning:boolean}>();
  for (const reference of content.sourceDependencies) {
    const quality=await sourceQuality(client,reference,at);
    const conflict=await materialConflict(client,actor,customerId,reference);
    const adequate=Boolean(quality && currentFactEligible(quality,conflict,at));
    evaluations.set(reference.id,{adequate,
      warning:Boolean(!quality || ["Stale","Unknown"].includes(quality.freshness))});
  }
  const issues:PlanIssue[]=[];
  for (const [index,assertion] of content.assertions.entries()) {
    if (!assertion.decisionCritical || !["accepted_fact","attributed_research",
      "shared_practice"].includes(assertion.kind)) continue;
    if (!assertion.sourceDependencyIds.some((id)=>evaluations.get(id)?.adequate)) {
      issues.push({code:"critical_evidence_inadequate",
        path:`assertions.${index}.sourceDependencyIds`});
    }
  }
  return {issues,historicalWarning:[...evaluations.values()].some((value)=>value.warning)};
}
