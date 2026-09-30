import { createHash,randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { governedIdSchema,idempotencyKeySchema,sha256Schema } from "../../contracts/retrieval";
import { qualityInputSchema } from "../../contracts/profiles";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockProfileActor } from "../profiles/policy";
import { evidenceReviewDueAt } from "../profiles/quality";
import { assertRetrievalReady } from "../retrieval/policy";
import { retireRetrievalProjection } from "../retrieval/projections";
import { enqueuePlanCleanupForSource } from "../plans/cleanup";

const refreshInput = z.object({ idempotencyKey: idempotencyKeySchema,
  requestId: governedIdSchema,sourceRevisionId: governedIdSchema,
  expectedPassageDigest: sha256Schema }).strict();

type Source = { id: string; source_id: string; workspace_id: string;
  customer_id: string; version: string; location: string; passage_digest: string;
  observation_at: Date | null; publication_at: Date | null;
  quality_input: unknown };

/** The maintenance worker only marks dates. It never starts external research. */
export async function markDueResearch(existingClient?: PoolClient): Promise<number> {
  const run = async (client: PoolClient) => {
    const marker = await client.query<{ schema_version: number }>(`
      SELECT schema_version FROM turas_environment WHERE environment_id=$1`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    if ((marker.rows[0]?.schema_version ?? 0) < 26) return 0;
    const sources = await client.query<Source>(`
      SELECT v.id,v.source_id,v.workspace_id,v.customer_id,v.version,v.location,
        v.passage_digest,v.observation_at,v.publication_at,v.quality_input
      FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks check_result ON check_result.source_revision_id=v.id
      LEFT JOIN research_review_due due ON due.source_revision_id=v.id
      WHERE NOT EXISTS (SELECT 1 FROM evidence_source_events event
          WHERE event.source_revision_id=v.id AND event.event_type IN ('withdraw','supersede'))
        AND check_result.identity_result AND check_result.scope_result
        AND check_result.integrity_result AND check_result.content_result
        AND (due.source_revision_id IS NULL OR due.updated_at<now()-interval '1 hour')
      ORDER BY due.updated_at NULLS FIRST,v.id LIMIT 100`,[]);
    const now = new Date();
    for (const source of sources.rows) {
      const parsed = qualityInputSchema.safeParse(source.quality_input);
      const dueAt = parsed.success ? evidenceReviewDueAt({
        informationType: parsed.data.informationType,dateBasis: parsed.data.dateBasis,
        observationAt: source.observation_at,publicationAt: source.publication_at },now) : now;
      await client.query(`INSERT INTO research_review_due
        (source_revision_id,environment_id,due_at,state)
        VALUES($1,$2,$3,$4) ON CONFLICT (source_revision_id) DO UPDATE
        SET due_at=EXCLUDED.due_at,state=EXCLUDED.state,updated_at=now(),
          marked_at=CASE WHEN research_review_due.state<>EXCLUDED.state THEN now()
            ELSE research_review_due.marked_at END`,
      [source.id,getServerConfig().TURAS_ENVIRONMENT_ID,dueAt,
        dueAt.getTime() <= now.getTime() ? "due" : "current"]);
    }
    return sources.rows.length;
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function listDueResearch(client: PoolClient,actor: CurrentSession,
  customerId: string) {
  if (!governedIdSchema.safeParse(customerId).success) throw hiddenRecord();
  await assertRetrievalReady(client);
  await lockProfileActor(client,actor,customerId);
  const found = await client.query<{ source_revision_id: string; title: string;
    due_at: Date; state: string; location: string; passage_digest: string;
    mode: "recon" | "practices" | null; public_fields: Record<string,unknown> | null }>(`
    SELECT due.source_revision_id,v.title,due.due_at,due.state,v.location,v.passage_digest,
      admission.mode,admission.public_fields
    FROM research_review_due due JOIN evidence_source_revisions v
      ON v.id=due.source_revision_id
    LEFT JOIN LATERAL (
      SELECT req.mode,req.public_fields FROM research_evidence_links link
      JOIN research_observations observation ON observation.id=link.observation_id
      JOIN research_runs run ON run.id=observation.run_id
      JOIN research_requests req ON req.id=run.request_id
      WHERE link.source_revision_id=v.id AND link.linkage_state='attributed'
        AND req.mode IN ('recon','practices')
      ORDER BY observation.retrieval_at DESC,observation.id DESC LIMIT 1
    ) admission ON true
    WHERE due.environment_id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
      AND (v.audience='delivery' OR $4='internal')
      AND NOT EXISTS (SELECT 1 FROM evidence_source_events event
        WHERE event.source_revision_id=v.id AND event.event_type IN ('withdraw','supersede'))
    ORDER BY due.due_at,due.source_revision_id LIMIT 50`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.kind]);
  return found.rows.map((row) => ({ sourceRevisionId: row.source_revision_id,
    title: row.title,dueAt: row.due_at.toISOString(),state: row.state,
    publicUrl: row.location,passageDigest: row.passage_digest,
    mode: row.mode,publicFields: row.public_fields }));
}

export async function recordResearchRefresh(client: PoolClient,actor: CurrentSession,
  customerId: string,raw: unknown) {
  const parsed = refreshInput.safeParse(raw);
  if (!parsed.success || !governedIdSchema.safeParse(customerId).success) {
    throw new HttpFailure(422,"invalid_input","Invalid refresh request");
  }
  const input = parsed.data;
  await assertRetrievalReady(client);
  await lockProfileActor(client,actor,customerId);
  const requestDigest = createHash("sha256").update(JSON.stringify({ customerId,...input }))
    .digest("hex");
  const prior = await client.query<{ id: string; request_digest: string;
    outcome: string }>(`SELECT id,request_digest,outcome FROM research_refresh_observations
    WHERE actor_membership_id=$1 AND idempotency_key=$2`,
  [actor.membershipId,input.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Refresh key reused");
    }
    return { refreshId: prior.rows[0].id,outcome: prior.rows[0].outcome,replayed: true };
  }
  const source = await client.query<Source>(`
    SELECT v.id,v.source_id,v.workspace_id,v.customer_id,v.version,v.location,
      v.passage_digest,v.observation_at,v.publication_at,v.quality_input
    FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id
    WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
      AND s.origin='independent_research'
      AND (v.audience='delivery' OR $4='internal') FOR UPDATE OF v,s`,
  [input.sourceRevisionId,actor.workspaceId,customerId,actor.kind]);
  const head = source.rows[0];
  if (!head) throw hiddenRecord();
  const retired = await client.query(`SELECT 1 FROM evidence_source_events
    WHERE source_revision_id=$1 AND event_type='withdraw' LIMIT 1`,
  [head.id]);
  if (retired.rowCount) {
    throw new HttpFailure(409,"refresh_source_retired","Research source is no longer current");
  }
  if (head.passage_digest !== input.expectedPassageDigest) {
    throw new HttpFailure(409,"refresh_source_changed","Research source changed");
  }
  const run = await client.query<{ id: string; state: string; customer_id: string;
    conversation_id: string; actor_membership_id: string; submitted_urls: string[];
    refresh_source_revision_id: string | null }>(`
    SELECT run.id,run.state,run.customer_id,req.conversation_id,
      run.actor_membership_id,req.public_fields->'submittedUrls' AS submitted_urls,
      req.public_fields->>'refreshSourceRevisionId' AS refresh_source_revision_id
    FROM research_requests req JOIN research_runs run ON run.request_id=req.id
    WHERE req.id=$1 AND req.environment_id=$2 AND req.workspace_id=$3
      AND req.customer_id=$4 AND req.actor_principal_id=$5`,
  [input.requestId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,
    customerId,actor.principalId]);
  const admitted = run.rows[0];
  if (!admitted || admitted.actor_membership_id !== actor.membershipId ||
      !["completed","partial","failed","unconfirmed"].includes(admitted.state) ||
      admitted.refresh_source_revision_id !== head.id ||
      !Array.isArray(admitted.submitted_urls) ||
      !admitted.submitted_urls.includes(head.location)) throw hiddenRecord();
  const observation = await client.query<{ id: string; passage_digest: string;
    source_revision_id: string | null; source_id: string | null }>(`
    SELECT o.id,o.passage_digest,l.source_revision_id,v.source_id
    FROM research_observations o
    LEFT JOIN research_evidence_links l ON l.observation_id=o.id
      AND l.linkage_state='attributed'
    LEFT JOIN evidence_source_revisions v ON v.id=l.source_revision_id
    WHERE o.run_id=$1 AND o.canonical_url=$2 AND o.origin='independent_discovery'
      AND o.identity_checked AND o.scope_checked AND o.integrity_checked AND o.content_checked
    ORDER BY o.retrieval_at DESC,o.id DESC LIMIT 1`,[admitted.id,head.location]);
  const current = observation.rows[0];
  const outcome = !current ? admitted.state === "unconfirmed" ? "partial" : "failed" :
    current.passage_digest === head.passage_digest ? "unchanged" :
      current.source_id === head.source_id ? "changed" : "partial";
  const id = randomUUID();
  await client.query(`INSERT INTO research_refresh_observations
    (id,request_id,source_revision_id,observation_id,outcome,
     prior_content_digest,current_content_digest,retrieval_at,
     actor_membership_id,idempotency_key,request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10)`,
  [id,input.requestId,head.id,current?.id ?? null,outcome,
    head.passage_digest,current?.passage_digest ?? null,actor.membershipId,
    input.idempotencyKey,requestDigest]);
  if (outcome==="changed") {
    await retireRetrievalProjection(client,"verified_research",head.id);
    await enqueuePlanCleanupForSource(client,"verified_research",head.id);
  }
  return { refreshId: id,outcome,replayed: false };
}
