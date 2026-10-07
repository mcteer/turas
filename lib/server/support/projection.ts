import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient, QueryResultRow } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { supportAssessmentSchema, supportActionSchema } from "../../contracts/support";
import { effectiveSupportReadiness } from "../../support/readiness";
import { getServerConfig } from "../config";
import { lockSupportActor, isSupportReviewer, type SupportActor } from "./policy";
import { supportScope, type SupportScope } from "./repository";
import { supportSourcesSchema } from "./schema";
import { supportDigest, enforceSupportRate } from "./commands";
import { verifySupportSources } from "./sources";
import { supportTransaction } from "./service";
import { unavailableSupportMembershipOwners } from "./actions";
import { decodeSupportCursor, encodeSupportCursor } from "./cursor";
import { supportWorkspaceMetadata } from "./metadata";

type Audience = "internal" | "delivery";

export async function readSupportHistory(actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience, recordId: string, limit = 20, cursor?: string) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new HttpFailure(422, "invalid_limit", "Choose a history limit from 1 to 50");
  return supportTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "read", audience);
    await enforceSupportRate(db, actor, "read");
    const scope = await supportScope(db, actor, customerId, workloadId);
    if (!scope) throw hiddenRecord();
    const rows = (await db.query(`SELECT v.id FROM support_revisions v
      JOIN support_records r ON r.id=v.record_id
      WHERE r.id=$1 AND r.scope_id=$2 AND r.audience=$3
        AND (EXISTS(SELECT 1 FROM support_review_decisions d WHERE d.revision_id=v.id AND d.decision='accept')
          OR ($4 AND (v.author_membership_id=$5 OR $6)))
       ORDER BY v.ordinal DESC`, [recordId, scope.id, audience,
       actor.kind === "internal", actor.membershipId, isSupportReviewer(actor)])).rows;
    if (!rows.length) throw hiddenRecord();
    const binding = supportDigest({ environment: getServerConfig().TURAS_ENVIRONMENT_ID,
      member: actor.membershipId, customerId, workloadId, audience, recordId, limit });
    const generation = supportDigest(rows.map(row => row.id));
    const offset = cursor ? decodeSupportCursor(cursor, binding, generation) : 0;
    const page = rows.slice(offset, offset + limit);
    const views = await supportRevisionViews(db, actor, customerId, workloadId, audience, page.map(row => row.id));
    const revisions = page.map(row => views.get(row.id)!);
    return { recordId, revisions, nextCursor: rows.length > offset + limit ? encodeSupportCursor(binding, generation, offset + limit) : null };
  });
}

export async function readSupportWorkspace(actor: SupportActor, customerId: string, workloadId: string | null,
  audience: Audience, query: { limit: number; cursor?: string; disposition?: string; kind?: string }) {
  return supportTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "read", audience);
    await enforceSupportRate(db, actor, "read");
    const scope = await supportScope(db, actor, customerId, workloadId);
    const readiness = await projectSupportReadinessInScope(db, actor, customerId, workloadId, audience, scope);
    const metadata = await supportWorkspaceMetadata(db, actor, customerId, workloadId, audience);
    if (!scope) return { ...readiness, metadata, actions: [], nextCursor: null };
    const rows = (await db.query(`WITH visible AS (
      SELECT r.id,r.created_at,r.version,r.accepted_revision_id,
        CASE WHEN $3 AND (v.author_membership_id=$4 OR $5) THEN r.current_revision_id ELSE r.accepted_revision_id END AS revision_id
      FROM support_records r LEFT JOIN support_revisions v ON v.id=r.current_revision_id
      WHERE r.scope_id=$1 AND r.audience=$2 AND r.kind='action'
    ) SELECT x.*,v.disposition,
       (SELECT ${audience === "delivery" ? "delivery_generation" : "internal_generation"}
         FROM customer_profile_state WHERE customer_id=$7 AND workspace_id=$8) AS profile_generation
       FROM visible x JOIN support_revisions v ON v.id=x.revision_id
      LEFT JOIN support_payloads p ON p.revision_id=v.id WHERE ($6::text IS NULL OR v.disposition=$6)
      ORDER BY CASE WHEN p.content->>'nextReviewDate'<to_char(now() AT TIME ZONE COALESCE(p.content->>'timezone','UTC'),'YYYY-MM-DD') THEN 0 ELSE 1 END,
        CASE p.content->>'priority' WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,x.created_at,x.id`,
    [scope.id, audience, actor.kind === "internal", actor.membershipId, isSupportReviewer(actor), query.disposition ?? null,
      customerId, actor.workspaceId])).rows;
    const generation = supportDigest({ rows: rows.map(row => [row.id, row.revision_id, row.disposition]),
      profileGeneration: rows[0]?.profile_generation ?? undefined, date: Temporal.Now.plainDateISO("UTC").toString() });
    const binding = supportDigest({ environment: getServerConfig().TURAS_ENVIRONMENT_ID, membershipId: actor.membershipId,
      customerId, workloadId, audience, disposition: query.disposition ?? null, kind: query.kind ?? null, limit: query.limit });
    const offset = query.cursor ? decodeSupportCursor(query.cursor, binding, generation) : 0;
    const actions = [];
    const page = query.kind === "assessment" ? [] : rows.slice(offset, offset + query.limit);
    const views = await supportRevisionViews(db, actor, customerId, workloadId, audience,
      [...new Set(page.flatMap(row => [row.accepted_revision_id, row.revision_id].filter(Boolean)))]);
    for (const row of page) {
      const accepted = row.accepted_revision_id ? views.get(row.accepted_revision_id)! : null;
      const proposal = row.revision_id !== row.accepted_revision_id ? views.get(row.revision_id)! : null;
      actions.push({ recordId: row.id, expectedVersion: actor.kind === "internal" ? Number(row.version) : null,
        assessment: null, accepted, proposal, createdAt: row.created_at.toISOString() });
    }
    return { ...readiness, metadata, scope: readiness.scope ?? (rows.length ? { id: scope.id, workloadId: scope.workloadId, version: generation } : null),
      actions, nextCursor: query.kind !== "assessment" && rows.length > offset + query.limit
      ? encodeSupportCursor(binding, generation, offset + query.limit) : null };
  });
}

export async function supportRevisionView(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience, revisionId: string) {
  return (await supportRevisionViews(db, actor, customerId, workloadId, audience, [revisionId])).get(revisionId)!;
}

/** Domain-internal batch path: identical authorization predicate to single-revision reads.
 * No caller-supplied hydrated rows or cross-request eligibility cache. */
export async function supportRevisionViews(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience, revisionIds: string[]) {
  const views = new Map<string, Awaited<ReturnType<typeof projectSupportRevision>>>();
  if (!revisionIds.length) return views;
  const rows = (await db.query(`SELECT v.id,v.ordinal,v.content_digest,v.source_state_digest,v.disposition,v.created_at,v.selected_engagement_ids,p.content,
    r.kind,r.current_revision_id,r.accepted_revision_id,v.author_membership_id,r.audience,
    EXISTS(SELECT 1 FROM support_invalidations i WHERE i.revision_id=v.id) AS invalidated,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.source_key,'kind',d.source_kind,
      'sourceRevisionId',d.source_revision_id,'generation',d.generation,'contentDigest',d.content_digest)
      || CASE WHEN d.locator IS NOT NULL THEN jsonb_build_object('locator',d.locator)
        ELSE jsonb_build_object('engagementId',d.engagement_id) END ORDER BY d.source_kind,d.source_revision_id)
      FROM support_source_dependencies d WHERE d.revision_id=v.id),'[]'::jsonb) AS sources
    FROM support_revisions v
    JOIN support_records r ON r.id=v.record_id JOIN support_scopes s ON s.id=r.scope_id
    LEFT JOIN support_payloads p ON p.revision_id=v.id WHERE v.id=ANY($1::uuid[]) AND r.environment_id=$2
      AND r.workspace_id=$3 AND r.customer_id=$4 AND s.workload_id IS NOT DISTINCT FROM $5::uuid AND r.audience=$6
       AND (r.accepted_revision_id=v.id OR EXISTS(SELECT 1 FROM support_review_decisions d
         WHERE d.revision_id=v.id AND d.decision='accept') OR ($7 AND (v.author_membership_id=$8 OR $9)))`,
  [revisionIds, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, workloadId, audience,
    actor.kind === "internal", actor.membershipId, isSupportReviewer(actor)])).rows;
  if (rows.length !== new Set(revisionIds).size) throw hiddenRecord();
  for (const row of rows) views.set(row.id, await projectSupportRevision(db, actor, customerId, workloadId, audience, row));
  // Only source-qualified content contributes owner IDs to the batched lookup.
  const ownerIds = [...views.values()].flatMap(view => view.content && "owner" in view.content &&
    view.content.owner.kind === "membership" ? [view.content.owner.membershipId] : []);
  const unavailable = await unavailableSupportMembershipOwners(db, actor, customerId, ownerIds);
  for (const view of views.values()) {
    view.ownerUnavailable = Boolean(view.content && "owner" in view.content &&
      view.content.owner.kind === "membership" && unavailable.has(view.content.owner.membershipId));
    view.reviewRequired ||= view.ownerUnavailable;
  }
  return views;
}

async function projectSupportRevision(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience, row: QueryResultRow) {
  const revisionId = row.id as string;
  let current = Boolean(row.content && supportDigest(row.content) === row.content_digest);
  const refs = supportSourcesSchema.parse(row.sources);
  if (row.invalidated) current = false;
  if (current) try {
    if (await verifySupportSources(db, actor, customerId, workloadId, audience, row.selected_engagement_ids, refs, true) !== row.source_state_digest)
      current = false;
  } catch (error) {
    if (!(error instanceof HttpFailure) || ![403, 404, 409].includes(error.status)) throw error;
    current = false;
  }
  const content = current ? (row.kind === "assessment" ? supportAssessmentSchema.parse(row.content) : supportActionSchema.parse(row.content)) : null;
  const today = content ? Temporal.Now.plainDateISO(content.timezone).toString() : null;
  const ownerUnavailable = false; // Filled by the scoped batch after source qualification.
  return { revisionId, ordinal: Number(row.ordinal), accepted: row.accepted_revision_id === revisionId,
    selectedEngagementIds: current ? row.selected_engagement_ids as string[] : [],
    content, sources: current ? refs : [], contentUnavailable: !current,
    disposition: row.disposition, ownerUnavailable,
    overdue: Boolean(content && today && content.nextReviewDate < today),
    reviewRequired: !current || ownerUnavailable || Boolean(content && today && content.nextReviewDate < today),
    effectiveReadiness: row.kind === "assessment" ? effectiveSupportReadiness(content && "checks" in content ? content : null,
      today ?? Temporal.Now.plainDateISO("UTC").toString(), current) : null };
}

export async function readSupportReadiness(actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience) {
  return supportTransaction(async db => {
    await lockSupportActor(db, actor, customerId, "read", audience);
    await enforceSupportRate(db, actor, "read");
    return projectSupportReadiness(db, actor, customerId, workloadId, audience);
  });
}

export async function projectSupportReadiness(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience) {
    return projectSupportReadinessInScope(db, actor, customerId, workloadId, audience,
      await supportScope(db, actor, customerId, workloadId));
}

/** Scope is resolved under this transaction's live authority, never supplied by
 * an external caller. Reuse avoids repeating workload and scope reads. */
async function projectSupportReadinessInScope(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, audience: Audience, scope: SupportScope | null) {
    if (!scope) return { scope: null, recordId: null, expectedVersion: null, assessment: null, proposal: null, effectiveReadiness: "not_assessed" as const };
    const row = (await db.query(`SELECT r.id,r.version,r.accepted_revision_id,r.current_revision_id,v.author_membership_id
      FROM support_records r LEFT JOIN support_revisions v ON v.id=r.current_revision_id
      WHERE r.scope_id=$1 AND r.audience=$2 AND r.kind='assessment'
        AND (r.accepted_revision_id IS NOT NULL OR ($3 AND (v.author_membership_id=$4 OR $5)))`,
    [scope.id, audience, actor.kind === "internal", actor.membershipId, isSupportReviewer(actor)])).rows[0];
    if (!row && actor.kind === "partner")
      return { scope: null, recordId: null, expectedVersion: null, assessment: null, proposal: null, effectiveReadiness: "not_assessed" as const };
    const accepted = row?.accepted_revision_id ? await supportRevisionView(db, actor, customerId, workloadId, audience, row.accepted_revision_id) : null;
    const canReadProposal = actor.kind === "internal" && (isSupportReviewer(actor) || row?.author_membership_id === actor.membershipId);
    const proposed = canReadProposal && row?.current_revision_id && row.current_revision_id !== row.accepted_revision_id ?
      await supportRevisionView(db, actor, customerId, workloadId, audience, row.current_revision_id) : null;
    return { scope: { id: scope.id, workloadId: scope.workloadId,
      version: actor.kind === "internal" ? scope.generation : supportDigest({ scopeId: scope.id, audience, acceptedRevisionId: row?.accepted_revision_id ?? null }) },
      recordId: row?.id ?? null, expectedVersion: actor.kind === "internal" && row ? Number(row.version) : null,
      assessment: accepted, proposal: proposed,
      effectiveReadiness: accepted?.contentUnavailable ? "review_required" : accepted?.effectiveReadiness ?? "not_assessed" };
}
