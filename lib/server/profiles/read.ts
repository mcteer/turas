import { readPublicCustomerCoverage } from "../research/public-read";
import {lockLearningOriginalClosure} from '../learning/sources';
import { getServerConfig } from "../config";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { profileListQuerySchema } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import type { CurrentReadActor } from "../auth/read-actor";
import { lockProfileActor, requireSteward } from "./policy";
import { projectRevision, stripPrivateLineage, type ProjectionRow, type ReviewState } from "./projection";
import { withTransaction } from "../db/client";
import { enforceProfileRate } from "./rate";
import { qualityInputSchema, unknownQualityInput } from "../../contracts/profiles";
import { rateEvidence } from "./quality";
import { unsupportedProfileRevisionIds } from "./eligibility";
import { approvedArtifactExcerpts, pendingArtifactReviewSources } from "./artifact-excerpts";

type RecordRow = {
  id: string; record_id: string; workload_id: string | null; kind: string;
  record_version?: string;
  audience: ProjectionRow["audience"]; data_category: ProjectionRow["dataCategory"];
  author_membership_id: string; payload: unknown; quality_input: Record<string, unknown>;
  source_references: string[]; revision_number: string; review_state: ReviewState;
  decision_rationale: string | null; partner_safe_reason: string | null;
  rating_evidence_at?: string | null; has_quality_snapshot?: boolean;
  created_at: Date;
};
function projectionRow(row: RecordRow): ProjectionRow {
  return { id: row.id, recordId: row.record_id, workloadId: row.workload_id,
    kind: row.kind, reviewState: row.review_state, audience: row.audience,
    dataCategory: row.data_category, authorMembershipId: row.author_membership_id,
    payload: row.payload, qualityInput: row.quality_input,
    sourceReferences: row.source_references, candidateSequence: Number(row.revision_number),
    decisionRationale: row.decision_rationale, partnerSafeReason: row.partner_safe_reason,
    createdAt: row.created_at.toISOString(),
    ...(row.has_quality_snapshot ? { ratingEvidenceAt: row.rating_evidence_at ?? null } : {}) };
}
async function supportMetadata(client: PoolClient, actor: CurrentReadActor,
  rows: readonly RecordRow[]): Promise<Map<string, { restrictedSupport: boolean;
    safeAttestation: string | null; visibleEvidenceIds: string[] }>> {
  const metadata = new Map<string, { restrictedSupport: boolean;
    safeAttestation: string | null; visibleEvidenceIds: string[] }>();
  if (actor.kind !== "partner" || rows.length === 0) return metadata;
  const found = await client.query<{ id: string; restricted: boolean; partner_safe_attestation: string | null }>(`
    SELECT v.id,d.partner_safe_attestation,
      EXISTS (SELECT 1 FROM profile_evidence_links l
        LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id
        LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id
        WHERE l.profile_revision_id=v.id AND
          ((source.id IS NOT NULL AND source.audience<>'delivery') OR
           (support.id IS NOT NULL AND (support.audience<>'delivery' OR
             support.data_category<>'delivery_context')))) AS restricted
    FROM profile_revisions v LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
    WHERE v.id=ANY($1::uuid[])`, [rows.map((row) => row.id)]);
  for (const row of found.rows) metadata.set(row.id,
    { restrictedSupport: row.restricted, safeAttestation: row.partner_safe_attestation,
      visibleEvidenceIds: [] });
  const visible = await client.query<{ id: string; evidence_id: string }>(`
    SELECT l.profile_revision_id AS id,
      coalesce(l.source_revision_id,l.supporting_profile_revision_id) AS evidence_id
    FROM profile_evidence_links l
    LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id
    LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id
    LEFT JOIN profile_records support_record ON support_record.id=support.record_id
    WHERE l.profile_revision_id=ANY($1::uuid[])
      AND ((source.id IS NOT NULL AND source.audience='delivery' AND
        NOT EXISTS (SELECT 1 FROM evidence_source_events e
          WHERE e.source_revision_id=source.id AND e.event_type IN ('withdraw','supersede')))
        OR (support.id IS NOT NULL AND support.audience='delivery'
          AND support.data_category='delivery_context'
          AND support_record.current_accepted_revision_id=support.id))`,
  [rows.map((row) => row.id)]);
  for (const row of visible.rows) metadata.get(row.id)?.visibleEvidenceIds.push(row.evidence_id);
  return metadata;
}

/** Bounded current accepted sections; deliberately separate from UI history/drafts. */
export async function readAcceptedProfilePage(client:PoolClient,actor:CurrentReadActor,customerId:string,
  section:'summary'|'workloads'|'facts',limit:number,afterId?:string){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new HttpFailure(422,'invalid_input','Invalid page size');
  await lockProfileActor(client,actor,customerId,undefined,true);
  const state=(await client.query('SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2',[customerId,actor.workspaceId])).rows[0];
  const generation=Number(actor.kind==='partner'?state.delivery_generation:state.internal_generation);
  const sections=section==='summary'?['customer_details','maturity_assessment']:section==='workloads'?['workload_details']:['stakeholder','product_use','risk','engagement_reference','decision','outcome','next_review','claim'];
  const result=await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,v.audience,v.data_category,v.author_membership_id,
    v.payload,v.quality_input,v.source_references,v.revision_number,q.input->>'evidenceAt' AS rating_evidence_at,(q.id IS NOT NULL) AS has_quality_snapshot,
    NULL::text AS decision_rationale,NULL::text AS partner_safe_reason,v.created_at,'accepted'::text AS review_state
    FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
    LEFT JOIN LATERAL(SELECT id,input FROM evidence_quality_snapshots WHERE profile_revision_id=v.id ORDER BY created_at DESC,id DESC LIMIT 1) q ON true
    WHERE r.workspace_id=$1 AND r.customer_id=$2 AND r.kind=ANY($3::text[]) AND v.data_category NOT IN('commercial','personnel')
      AND ($4='internal' OR(v.audience='delivery' AND v.data_category='delivery_context'))
      AND ($5::uuid IS NULL OR r.id>$5) ORDER BY r.id LIMIT 101 FOR SHARE OF r`,[actor.workspaceId,customerId,sections,actor.kind,afterId??null]);
  const candidates=result.rows.slice(0,100);
  for(const row of candidates)await lockLearningOriginalClosure(client,actor.workspaceId,customerId,[{sourceKind:'accepted_profile',sourceRevisionId:row.id}]);
  const unsupported=await unsupportedProfileRevisionIds(client,candidates.map(row=>row.id),true,null,['commercial','personnel']);
  const support=await supportMetadata(client,actor,candidates),eligible:Array<Record<string,unknown>&{supportStatus:string}>=[];
  let scanned:string|undefined=afterId;
  for(const row of candidates){
    scanned=row.record_id;
    if(unsupported.has(row.id))continue;
    const typedConflict=await client.query(`SELECT 1 FROM evidence_conflict_targets WHERE environment_id=$1 AND state='confirmed'
      AND ((first_kind='accepted_profile' AND first_revision_id=$2) OR(second_kind='accepted_profile' AND second_revision_id=$2)) LIMIT 1`,[getServerConfig().TURAS_ENVIRONMENT_ID,row.id]);
    if(typedConflict.rowCount)continue;
    const item=projectRevision({...projectionRow(row),...support.get(row.id)},actor.kind,actor.membershipId);
    if(item){eligible.push({...item,supportStatus:support.get(row.id)?.restrictedSupport?'restricted_source':'settled'});if(eligible.length===limit)break;}
  }
  const lastIndex=candidates.findIndex(row=>row.record_id===scanned);
  const hasMore=lastIndex<candidates.length-1 || result.rows.length>100;
  if(eligible.length<limit && result.rows.length>100)throw new HttpFailure(503,'incomplete','Section eligibility is incomplete');
  await lockProfileActor(client,actor,customerId,undefined,true);
  return {generation,items:eligible,nextPosition:hasMore?scanned:null};
}

function decodeCursor(raw: string | undefined, actor: ProfileActor, customerId: string,
  filter: string): { at: string; id: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    if (value.actor !== actor.membershipId || value.customer !== customerId || value.filter !== filter ||
        typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at)) ||
        typeof value.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)) {
      throw new Error();
    }
    return { at: value.at, id: value.id };
  } catch { throw new HttpFailure(422, "invalid_cursor", "Invalid cursor"); }
}

export async function listProfileRecords(actor: ProfileActor, customerId: string, input: unknown,
  existingClient?: PoolClient): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const parsed = profileListQuerySchema.safeParse(input);
  if (!parsed.success) throw new HttpFailure(422, "invalid_query", "Invalid profile query");
  const options = parsed.data;
  const filter = JSON.stringify({ kind: options.kind, workloadId: options.workloadId,
    state: options.state, query: options.query });
  const cursor = decodeCursor(options.cursor, actor, customerId, filter);
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const result = await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,d.rationale AS decision_rationale,
      d.partner_safe_reason,v.created_at,
      CASE WHEN r.current_accepted_revision_id=v.id THEN 'accepted'
           WHEN d.decision='reject' THEN 'rejected' ELSE 'pending' END AS review_state
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE v.workspace_id=$1 AND v.customer_id=$2
        AND (r.current_accepted_revision_id=v.id OR
             (v.author_membership_id=$3 AND (d.decision='reject' OR d.revision_id IS NULL)))
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
        AND ($5::text IS NULL OR r.kind=$5)
        AND ($6::uuid IS NULL OR r.workload_id=$6)
        AND ($7::text IS NULL OR
          CASE WHEN r.current_accepted_revision_id=v.id THEN 'accepted'
               WHEN d.decision='reject' THEN 'rejected' ELSE 'pending' END=$7)
        AND ($8::text IS NULL OR v.payload::text ILIKE '%' || $8 || '%')
        AND ($9::timestamptz IS NULL OR (v.created_at,v.id)<($9::timestamptz,$10::uuid))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $11`,
    [actor.workspaceId, customerId, actor.membershipId, actor.kind === "internal",
      options.kind ?? null, options.workloadId ?? null, options.state ?? null,
      options.query ?? null, cursor?.at ?? null, cursor?.id ?? null, options.limit + 1]);
    const page = result.rows.slice(0, options.limit);
    const support = await supportMetadata(client, actor, page);
    const items = page.map((row) => projectRevision({ ...projectionRow(row), ...support.get(row.id) },
      actor.kind, actor.membershipId))
      .filter((row): row is Record<string, unknown> => row !== null);
    const last = page.at(-1);
    const nextCursor = result.rows.length > options.limit && last ? Buffer.from(JSON.stringify({
      actor: actor.membershipId, customer: customerId, filter,
      at: last.created_at.toISOString(), id: last.id,
    })).toString("base64url") : null;
    return { items, nextCursor };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function readProfile(actor: ProfileActor, customerId: string, existingClient?: PoolClient,
  selectedWorkloadId?: string,effectiveAudience?:"internal"|"delivery",
  customerWideOnly=false,shareActorRows=false,staffingFence=false): Promise<unknown> {
  if (actor.kind==="partner" && effectiveAudience==="internal") throw hiddenRecord();
  if (staffingFence && (!existingClient || effectiveAudience !== "delivery" || !shareActorRows)) throw hiddenRecord();
  const allowInternal=(effectiveAudience ?? (actor.kind==="internal" ? "internal":"delivery"))
    ==="internal";
  const projectionKind=allowInternal ? actor.kind:"partner";
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId, undefined, shareActorRows);
    if (!staffingFence) await enforceProfileRate(client, actor, customerId, "read");
    const customer = await client.query<{ id: string; display_name: string; synthetic: boolean }>(
      "SELECT id,display_name,synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2",
      [customerId, actor.workspaceId]);
    if (!customer.rows[0]) throw hiddenRecord();
    const workloads = await client.query<{ id: string; display_name: string; lifecycle: string }>(
      `SELECT w.id,w.display_name,w.lifecycle FROM customer_workloads w
       WHERE w.customer_id=$1 AND w.workspace_id=$2
         AND ($3::boolean OR EXISTS (
           SELECT 1 FROM profile_records r JOIN profile_revisions v
             ON v.id=r.current_accepted_revision_id
           WHERE r.customer_id=w.customer_id AND r.workload_id=w.id
             AND r.kind='workload_details' AND v.audience='delivery'
             AND v.data_category='delivery_context'))
       ORDER BY w.created_at,w.id`,
      [customerId, actor.workspaceId, allowInternal]);
    if (selectedWorkloadId && !workloads.rows.some((row) => row.id === selectedWorkloadId)) throw hiddenRecord();
    const accepted = await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      r.version AS record_version,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,
      q.input->>'evidenceAt' AS rating_evidence_at,
      (q.id IS NOT NULL) AS has_quality_snapshot,
      NULL::text AS decision_rationale,
      NULL::text AS partner_safe_reason,v.created_at,'accepted'::text AS review_state
      FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
      LEFT JOIN LATERAL (SELECT id,input FROM evidence_quality_snapshots
        WHERE profile_revision_id=v.id ORDER BY created_at DESC,id DESC LIMIT 1) q ON true
      WHERE r.workspace_id=$1 AND r.customer_id=$2
        AND ($4::uuid IS NULL OR r.workload_id IS NULL OR r.workload_id=$4)
        AND (NOT $5::boolean OR r.workload_id IS NULL)
        AND ($3::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
      ORDER BY r.kind,r.created_at,r.id`,
    [actor.workspaceId, customerId, allowInternal, selectedWorkloadId ?? null,
      customerWideOnly]);
    const revisionIds = accepted.rows.map((row) => row.id);
    const conflicts = revisionIds.length ? await client.query<{ id: string }>(`
      SELECT DISTINCT candidate.id FROM evidence_conflicts c
      CROSS JOIN LATERAL (VALUES (c.first_revision_id),(c.second_revision_id)) AS candidate(id)
      WHERE c.customer_id=$1 AND c.state='confirmed' AND candidate.id=ANY($2::uuid[])`,
    [customerId, revisionIds]) : { rows: [] as { id: string }[] };
    const conflicted = new Set(conflicts.rows.map((row) => row.id));
    const unsupportedIds = await unsupportedProfileRevisionIds(client, revisionIds);
    const artifactExcerpts = await approvedArtifactExcerpts(client, revisionIds, projectionKind);
    const support = await supportMetadata(client, {...actor,kind:projectionKind}, accepted.rows);
    const acceptedFacts = accepted.rows.map((row) => {
      const source = support.get(row.id);
      const projected = projectRevision({ ...projectionRow(row), ...source }, projectionKind, actor.membershipId);
      if (!projected) return null;
      const supportStatus = conflicted.has(row.id) ? "conflicted" :
        unsupportedIds.has(row.id) ? "unsupported" :
        source?.restrictedSupport ? "restricted_source" : "settled";
      return { ...projected, recordVersion: Number(row.record_version), supportStatus,
        ...(!unsupportedIds.has(row.id) && artifactExcerpts.has(row.id)
          ? { approvedArtifactExcerpt: artifactExcerpts.get(row.id) } : {}) };
    }).filter((row) => row !== null);
    const research = await client.query<{
      id: string; title: string; location: string; supported_claim: string;
      publication_at: Date | null; observation_at: Date | null; retrieval_at: Date;
      quality_input: Record<string, unknown>;
    }>(`SELECT v.id,v.title,v.location,v.supported_claim,v.publication_at,
      v.observation_at,v.retrieval_at,v.quality_input
      FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks c ON c.source_revision_id=v.id
      WHERE v.workspace_id=$1 AND v.customer_id=$2
        AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
        AND ($3::boolean OR v.audience='delivery')
        AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
          WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))
      ORDER BY v.created_at DESC,v.id DESC LIMIT 50`,
    [actor.workspaceId, customerId, allowInternal]);
    const attributedResearch = research.rows.map((row) => {
      const checked = qualityInputSchema.safeParse(row.quality_input);
      const input = checked.success ? checked.data : unknownQualityInput;
      const date = input.dateBasis === "publication" ? row.publication_at :
        input.dateBasis === "observation" ? row.observation_at : null;
      const rated = rateEvidence({ R: input.R, D: input.D, C: input.C,
        informationType: input.informationType, dateBasis: input.dateBasis,
        evidenceAt: date, asOf: new Date() });
      return { sourceRevisionId: row.id, state: "researched", title: row.title,
        location: row.location, supportedClaim: row.supported_claim,
        publicationAt: row.publication_at?.toISOString() ?? null,
        observationAt: row.observation_at?.toISOString() ?? null,
        retrievalAt: row.retrieval_at.toISOString(),
        quality: { rubricVersion: input.rubricVersion, ...rated,
          asOf: rated.asOf.toISOString(), validUntil: rated.validUntil.toISOString() } };
    });
    const state = await client.query<{ internal_generation: string; delivery_generation: string }>(
      "SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1",
      [customerId]);
    const canReview = actor.kind === "internal" && (actor.role === "admin" || Boolean((await client.query(
      "SELECT 1 FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 AND active",
      [customerId, actor.membershipId])).rowCount));
    const openConflicts = actor.kind === "internal" ? await client.query<{
      id: string; state: string; version: string; first_revision_id: string;
      second_revision_id: string; rationale: string }>(`
      SELECT id,state,version,first_revision_id,second_revision_id,rationale
      FROM evidence_conflicts WHERE workspace_id=$1 AND customer_id=$2
        AND state IN ('flagged','confirmed') ORDER BY created_at DESC,id DESC LIMIT 50`,
    [actor.workspaceId, customerId]) : null;
    return { customer: { id: customer.rows[0].id, displayName: customer.rows[0].display_name,
      synthetic: customer.rows[0].synthetic }, workloads: workloads.rows.map((row) => ({
      id: row.id, displayName: row.display_name, lifecycle: row.lifecycle })),
      acceptedFacts, attributedResearch, publicResearchCoverage: await readPublicCustomerCoverage(client,actor,customerId),
      canReview,
      ...(openConflicts ? { openConflicts: openConflicts.rows.map((row) => ({
        id: row.id, state: row.state, version: Number(row.version),
        firstRevisionId: row.first_revision_id, secondRevisionId: row.second_revision_id,
        rationale: row.rationale,
      })) } : {}),
      contextVersion: allowInternal ? state.rows[0]?.internal_generation : state.rows[0]?.delivery_generation };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function readProfileRecord(actor: ProfileActor, customerId: string, recordId: string,
  existingClient?: PoolClient): Promise<{ items: Record<string, unknown>[] }> {
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const review = actor.kind === "internal" && (actor.role === "admin" || Boolean((await client.query(
      "SELECT 1 FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 AND active",
      [customerId, actor.membershipId])).rowCount));
    const result = await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,d.rationale AS decision_rationale,
      d.partner_safe_reason,v.created_at,
      CASE WHEN r.current_accepted_revision_id=v.id THEN 'accepted'
           WHEN d.decision='reject' THEN 'rejected'
           WHEN d.decision='accept' AND EXISTS (SELECT 1 FROM profile_lifecycle_events e
             WHERE e.revision_id=v.id AND e.event_type='retract') THEN 'retracted'
           WHEN d.decision='accept' THEN 'superseded' ELSE 'pending' END AS review_state
      FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE r.id=$1 AND r.workspace_id=$2 AND r.customer_id=$3
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
        AND (r.current_accepted_revision_id=v.id OR
          (v.author_membership_id=$5 AND (d.decision='reject' OR d.revision_id IS NULL)) OR
          ($6::boolean AND $4::boolean))
      ORDER BY v.created_at DESC,v.id DESC LIMIT 50`,
    [recordId, actor.workspaceId, customerId, actor.kind === "internal",
      actor.membershipId, review]);
    const support = await supportMetadata(client, actor, result.rows);
    const items = result.rows.map((row) => projectRevision({ ...projectionRow(row), ...support.get(row.id) },
      actor.kind, actor.membershipId, review))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (!items.length) throw hiddenRecord();
    return { items };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function readProfileHistory(actor: ProfileActor, customerId: string, recordId: string,
  input: { limit?: number; cursor?: string } = {}, existingClient?: PoolClient): Promise<{
    items: Record<string, unknown>[]; events: Record<string, unknown>[]; nextCursor: string | null;
  }> {
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (input.cursor?.length ?? 0) > 500) {
    throw new HttpFailure(422, "invalid_query", "Invalid history query");
  }
  let cursor: { at: string; id: string } | null = null;
  if (input.cursor) cursor = decodeCursor(input.cursor, actor, customerId, `history:${recordId}`);
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const review = actor.kind === "internal" && (actor.role === "admin" || Boolean((await client.query(
      "SELECT 1 FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 AND active",
      [customerId, actor.membershipId])).rowCount));
    const result = await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,d.rationale AS decision_rationale,
      d.partner_safe_reason,v.created_at,
      CASE WHEN r.current_accepted_revision_id=v.id THEN 'accepted'
           WHEN d.decision='reject' THEN 'rejected'
           WHEN d.decision='accept' AND EXISTS (SELECT 1 FROM profile_lifecycle_events e
             WHERE e.revision_id=v.id AND e.event_type='retract') THEN 'retracted'
           WHEN d.decision='accept' THEN 'superseded' ELSE 'pending' END AS review_state
      FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE r.id=$1 AND r.workspace_id=$2 AND r.customer_id=$3
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
        AND (r.current_accepted_revision_id=v.id OR
          ($4::boolean AND (d.decision='accept' OR v.author_membership_id=$5 OR $6::boolean)) OR
          (v.author_membership_id=$5 AND (d.decision='reject' OR d.revision_id IS NULL)))
        AND ($7::timestamptz IS NULL OR (v.created_at,v.id)<($7::timestamptz,$8::uuid))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $9`,
    [recordId, actor.workspaceId, customerId, actor.kind === "internal", actor.membershipId,
      review, cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
    const page = result.rows.slice(0, limit);
    const support = await supportMetadata(client, actor, page);
    const pageIds = page.map((row) => row.id);
    const conflictedRows = pageIds.length ? await client.query<{ id: string }>(`
      SELECT DISTINCT candidate.id FROM evidence_conflicts c
      CROSS JOIN LATERAL (VALUES (c.first_revision_id),(c.second_revision_id)) AS candidate(id)
      WHERE c.customer_id=$1 AND c.state='confirmed' AND candidate.id=ANY($2::uuid[])`,
    [customerId, pageIds]) : null;
    const unsupportedRows = await unsupportedProfileRevisionIds(client, pageIds);
    const conflicted = new Set(conflictedRows?.rows.map((row) => row.id) ?? []);
    const unsupported = unsupportedRows;
    const items: Record<string, unknown>[] = page.flatMap((row) => {
      const source = support.get(row.id);
      const projected = projectRevision({ ...projectionRow(row), ...source },
        actor.kind, actor.membershipId, review);
      if (!projected) return [];
      return [{ ...projected, supportStatus: conflicted.has(row.id) ? "conflicted" :
        unsupported.has(row.id) ? "unsupported" :
        source?.restrictedSupport ? "restricted_source" : "settled" }];
    });
    if (!items.length && !cursor) throw hiddenRecord();
    const ids = items.map((item) => item.id as string);
    const events = actor.kind === "internal" && ids.length ? await client.query<{
      id: string; event_type: string; revision_id: string; actor_membership_id: string;
      rationale: string; created_at: Date }>(`
      SELECT e.id,e.event_type,e.revision_id,e.actor_membership_id,e.rationale,e.created_at
      FROM profile_lifecycle_events e WHERE e.record_id=$1 AND e.revision_id=ANY($2::uuid[])
      UNION ALL
      SELECT d.revision_id AS id,d.decision AS event_type,d.revision_id,
        d.reviewer_membership_id AS actor_membership_id,d.rationale,d.decided_at AS created_at
      FROM profile_review_decisions d WHERE d.revision_id=ANY($2::uuid[])
      ORDER BY created_at DESC,id DESC LIMIT 100`, [recordId, ids]) : null;
    const last = page.at(-1);
    return { items, events: events?.rows.map((event) => ({ id: event.id,
      revisionId: event.revision_id, eventType: event.event_type,
      actorMembershipId: event.actor_membership_id,
      rationale: event.rationale, createdAt: event.created_at.toISOString() })) ?? [],
      nextCursor: result.rows.length > limit && last ? Buffer.from(JSON.stringify({
      actor: actor.membershipId, customer: customerId, filter: `history:${recordId}`,
      at: last.created_at.toISOString(), id: last.id,
    })).toString("base64url") : null };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function readProfileSource(actor: ProfileActor, customerId: string,
  sourceRevisionId: string, existingClient?: PoolClient): Promise<unknown> {
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const found = await client.query<{
      id: string; title: string; location: string; passage: string; supported_claim: string;
      publication_at: Date | null; observation_at: Date | null; event_at: Date | null;
      retrieval_at: Date; rights: string; audience: string; quality_input: Record<string, unknown>;
      withdrawn: boolean; superseded: boolean; check_version: string; check_rationale: string;
      lifecycle_version: string;
    }>(`SELECT v.id,v.title,v.location,v.passage,v.supported_claim,v.publication_at,
      v.observation_at,v.event_at,v.retrieval_at,v.rights,v.audience,v.quality_input,
      c.check_version,c.rationale AS check_rationale,
      (SELECT coalesce(max(e.lifecycle_version),0)::text FROM evidence_source_events e
        WHERE e.source_revision_id=v.id) AS lifecycle_version,
      EXISTS (SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id
        AND e.event_type='withdraw') AS withdrawn,
      EXISTS (SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id
        AND e.event_type='supersede') AS superseded
      FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks c ON c.source_revision_id=v.id
      WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
        AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
        AND ($4::boolean OR v.audience='delivery')`,
    [sourceRevisionId, actor.workspaceId, customerId, actor.kind === "internal"]);
    const row = found.rows[0];
    if (!row || (actor.kind === "partner" && (row.withdrawn || row.superseded))) throw hiddenRecord();
    const checked = qualityInputSchema.safeParse(row.quality_input);
    const input = checked.success ? checked.data : unknownQualityInput;
    const date = input.dateBasis === "publication" ? row.publication_at :
      input.dateBasis === "observation" ? row.observation_at : null;
    const rated = rateEvidence({ R: input.R, D: input.D, C: input.C,
      informationType: input.informationType, dateBasis: input.dateBasis,
      evidenceAt: date, asOf: new Date() });
    return { sourceRevisionId: row.id, state: row.withdrawn ? "withdrawn" :
      row.superseded ? "superseded" : "researched",
      title: row.title, location: row.location, passage: row.passage,
      supportedClaim: row.supported_claim, publicationAt: row.publication_at?.toISOString() ?? null,
      observationAt: row.observation_at?.toISOString() ?? null,
      eventAt: row.event_at?.toISOString() ?? null, retrievalAt: row.retrieval_at.toISOString(),
      rights: row.rights, checks: { version: row.check_version,
        ...(actor.kind === "internal" ? { rationale: row.check_rationale } : {}) },
      ...(actor.kind === "internal" ? { lifecycleVersion: Number(row.lifecycle_version) } : {}),
      quality: { rubricVersion: input.rubricVersion, ...rated,
        asOf: rated.asOf.toISOString(), validUntil: rated.validUntil.toISOString(),
        ...(actor.kind === "internal" ? { input } : {}) } };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function listReviewQueue(actor: ProfileActor, customerId: string,
  input: { limit?: number; cursor?: string } = {}, existingClient?: PoolClient): Promise<unknown> {
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (input.cursor?.length ?? 0) > 500) {
    throw new HttpFailure(422, "invalid_query", "Invalid review query");
  }
  const cursor = decodeCursor(input.cursor, actor, customerId, "review");
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await requireSteward(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const pending = await client.query<RecordRow & { content_digest: string; record_version: string;
      current_accepted_revision_id: string | null; accepted_payload: unknown; author_kind: string;
      submission_channel: string; workload_name: string | null;
      confirmed_conflict: boolean }>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,v.content_digest,v.submission_channel,
      r.version AS record_version,
      r.current_accepted_revision_id,prior.payload AS accepted_payload,
      w.display_name AS workload_name,
      EXISTS (SELECT 1 FROM evidence_conflicts c WHERE c.state='confirmed'
        AND (c.first_revision_id=v.id OR c.second_revision_id=v.id)) AS confirmed_conflict,
      author.kind AS author_kind,NULL::text AS decision_rationale,
      NULL::text AS partner_safe_reason,v.created_at,'pending'::text AS review_state
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      LEFT JOIN profile_revisions prior ON prior.id=r.current_accepted_revision_id
      LEFT JOIN customer_workloads w ON w.id=r.workload_id
      JOIN memberships author ON author.id=v.author_membership_id
      WHERE v.workspace_id=$1 AND v.customer_id=$2 AND d.revision_id IS NULL
        AND ($3::timestamptz IS NULL OR (v.created_at,v.id)<($3::timestamptz,$4::uuid))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $5`,
    [actor.workspaceId, customerId, cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
    const page = pending.rows.slice(0, limit);
    const artifactSources = await pendingArtifactReviewSources(client, page.map((row) => row.id));
    const historyRows = page.length ? await client.query<{ record_id: string; decision: string;
      decided_at: Date }>(`SELECT record_id,decision,decided_at FROM (
        SELECT v.record_id,d.decision,d.decided_at,
          row_number() OVER (PARTITION BY v.record_id
            ORDER BY d.decided_at DESC,d.revision_id DESC) AS position
        FROM profile_review_decisions d JOIN profile_revisions v ON v.id=d.revision_id
        WHERE v.record_id=ANY($1::uuid[])) recent
      WHERE position<=3 ORDER BY decided_at DESC,record_id`,
    [[...new Set(page.map((row) => row.record_id))]]) : null;
    const recentHistory = new Map<string, { decision: string; decidedAt: string }[]>();
    for (const row of historyRows?.rows ?? []) {
      const decisions = recentHistory.get(row.record_id) ?? [];
      if (decisions.length < 3) decisions.push({ decision: row.decision,
        decidedAt: row.decided_at.toISOString() });
      recentHistory.set(row.record_id, decisions);
    }
    const openRetractions = await client.query<{ id: string; accepted_revision_id: string;
      requesting_membership_id: string; reason: string; created_at: Date;
      version: string; record_version: string; requester_kind: string }>(`
      SELECT q.id,q.accepted_revision_id,q.requesting_membership_id,q.reason,q.created_at,
        q.version,r.version AS record_version,requester.kind AS requester_kind
      FROM profile_retraction_requests q JOIN profile_revisions v ON v.id=q.accepted_revision_id
      JOIN profile_records r ON r.id=v.record_id
      JOIN memberships requester ON requester.id=q.requesting_membership_id
      WHERE v.workspace_id=$1 AND v.customer_id=$2 AND q.state='open'
      ORDER BY q.created_at DESC,q.id DESC LIMIT 50`, [actor.workspaceId, customerId]);
    const last = page.at(-1);
    return { pending: page.map((row) => ({
      ...projectRevision(projectionRow(row), "internal", actor.membershipId, true),
      contentDigest: row.content_digest, recordVersion: Number(row.record_version),
      currentAcceptedRevisionId: row.current_accepted_revision_id,
      acceptedPayload: stripPrivateLineage(row.accepted_payload), authorKind: row.author_kind,
      submissionChannel: row.submission_channel,
      ...(artifactSources.has(row.id) ? { artifactSource: artifactSources.get(row.id) } : {}),
      requestedAudience: row.audience, dataCategory: row.data_category,
      scopeLabel: row.workload_id ? row.workload_name ?? "Workload-specific" : "Customer-wide",
      confirmedConflict: row.confirmed_conflict,
      recentHistory: recentHistory.get(row.record_id) ?? [],
    })),
      openRetractions: openRetractions.rows.map((row) => ({ id: row.id,
        acceptedRevisionId: row.accepted_revision_id,
        requestingMembershipId: row.requesting_membership_id, reason: row.reason,
        requesterKind: row.requester_kind, version: Number(row.version),
        recordVersion: Number(row.record_version), createdAt: row.created_at.toISOString() })),
      nextCursor: pending.rows.length > limit && last ? Buffer.from(JSON.stringify({
        actor: actor.membershipId, customer: customerId, filter: "review",
        at: last.created_at.toISOString(), id: last.id,
      })).toString("base64url") : null };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function listOwnSubmissions(actor: ProfileActor, customerId: string,
  input: { limit?: number; cursor?: string } = {}, existingClient?: PoolClient): Promise<unknown> {
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (input.cursor?.length ?? 0) > 500) {
    throw new HttpFailure(422, "invalid_query", "Invalid submissions query");
  }
  const cursor = decodeCursor(input.cursor, actor, customerId, "submissions");
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    await enforceProfileRate(client, actor, customerId, "read");
    const found = await client.query<RecordRow>(`SELECT v.id,v.record_id,r.workload_id,r.kind,
      r.version AS record_version,
      v.audience,v.data_category,v.author_membership_id,v.payload,v.quality_input,
      v.source_references,v.revision_number,d.rationale AS decision_rationale,
      d.partner_safe_reason,v.created_at,
      CASE WHEN r.current_accepted_revision_id=v.id THEN 'accepted'
           WHEN d.decision='reject' THEN 'rejected'
           WHEN d.decision='accept' THEN 'superseded' ELSE 'pending' END AS review_state
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
      LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
      WHERE v.workspace_id=$1 AND v.customer_id=$2 AND v.author_membership_id=$3
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
        AND ($4::boolean OR r.current_accepted_revision_id=v.id OR
             d.decision='reject' OR d.revision_id IS NULL)
        AND ($5::timestamptz IS NULL OR (v.created_at,v.id)<($5::timestamptz,$6::uuid))
      ORDER BY v.created_at DESC,v.id DESC LIMIT $7`,
    [actor.workspaceId, customerId, actor.membershipId, actor.kind === "internal",
      cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
    const page = found.rows.slice(0, limit);
    const support = await supportMetadata(client, actor, page);
    const artifactSources = await pendingArtifactReviewSources(client, page.map((row) => row.id));
    const items = page.map((row) => {
      const projected = projectRevision({ ...projectionRow(row), ...support.get(row.id) },
        actor.kind, actor.membershipId);
      return projected ? { ...projected, recordVersion: Number(row.record_version),
        ...(artifactSources.has(row.id) ? { artifactSource: artifactSources.get(row.id) } : {}) } : null;
    })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const last = page.at(-1);
    return { items, nextCursor: found.rows.length > limit && last ? Buffer.from(JSON.stringify({
      actor: actor.membershipId, customer: customerId, filter: "submissions",
      at: last.created_at.toISOString(), id: last.id,
    })).toString("base64url") : null };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function listCustomerStewards(actor: ProfileActor, customerId: string,
  existingClient?: PoolClient): Promise<unknown> {
  const run = async (client: PoolClient) => {
    await lockProfileActor(client, actor, customerId);
    if (actor.kind !== "internal") throw new HttpFailure(403, "forbidden", "Action not allowed");
    await enforceProfileRate(client, actor, customerId, "read");
    const result = await client.query<{ membership_id: string; version: string; assigned_at: Date;
      display_name: string; active: boolean }>(`SELECT s.membership_id,s.version,s.assigned_at,p.display_name,s.active
      FROM customer_stewards s JOIN memberships m ON m.id=s.membership_id
      JOIN principals p ON p.id=m.principal_id
      WHERE s.customer_id=$1 AND s.workspace_id=$2 AND ($3::boolean OR s.active)
        AND m.active AND p.active ORDER BY p.display_name,s.membership_id`,
    [customerId, actor.workspaceId, actor.role === "admin"]);
    return { items: result.rows.map((row) => ({ membershipId: row.membership_id,
      displayName: row.display_name, active: row.active,
      version: Number(row.version), assignedAt: row.assigned_at.toISOString() })) };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

/** Execution's admitted identity path has no caller-controlled quota flag. It
 * validates the durable owned attempt before reading current customer identity;
 * accepted engagement evidence is selected by the execution domain separately. */
export async function readAdmittedExecutionIdentity(client: PoolClient, actor: ProfileActor, attemptId: string) {
  const row = (await client.query(`SELECT b.customer_id,c.context_generation,c.context_audience,c.context_login_session_id,
    c.context_membership_id FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id
    JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3
    AND a.owner_membership_id=$4 AND b.owner_membership_id=a.owner_membership_id AND b.conversation_id=c.id
    AND c.owner_principal_id=$5 AND a.state IN ('prepared','running','completed')`,
    [attemptId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.membershipId, actor.principalId])).rows[0];
  if (!row || actor.kind !== "internal" || row.context_login_session_id !== actor.sessionId || row.context_membership_id !== actor.membershipId || row.context_audience !== "internal") throw hiddenRecord();
  await lockProfileActor(client, actor, row.customer_id, undefined, true);
  const identity = (await client.query(`SELECT c.id,c.display_name,c.synthetic,s.internal_generation FROM customer_references c
    JOIN customer_profile_state s ON s.customer_id=c.id AND s.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 FOR SHARE OF c,s`, [row.customer_id, actor.workspaceId])).rows[0];
  if (!identity || identity.internal_generation !== row.context_generation) throw new HttpFailure(409, "source_changed", "Execution explanation inputs changed");
  return { customer: { id: identity.id as string, displayName: identity.display_name as string, synthetic: identity.synthetic as boolean },
    contextVersion: identity.internal_generation as string };
}
