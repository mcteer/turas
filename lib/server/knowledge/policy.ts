import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { lockProfileActor } from "../profiles/policy";
import { unsupportedProfileRevisionIds } from "../profiles/eligibility";
import { assertRetrievalReady } from "../retrieval/policy";
import type { z } from "zod";
import type { knowledgeLineageSchema, sanitizedKnowledgeSchema } from "../../contracts/knowledge";

type Lineage = z.infer<typeof knowledgeLineageSchema>;
type Payload = z.infer<typeof sanitizedKnowledgeSchema>;

/** Source authority is required again for every private candidate operation. */
export async function lockKnowledgeAuthor(client: PoolClient, actor: CurrentSession,
  customerId: string): Promise<void> {
  await assertRetrievalReady(client);
  await lockProfileActor(client,actor,customerId);
}

export function requireKnowledgePublisher(actor: CurrentSession): void {
  if (actor.kind !== "internal" || actor.role !== "admin") {
    throw new HttpFailure(403,"forbidden","Action not allowed");
  }
}

export async function assertExactKnowledgeLineage(client: PoolClient,
  actor: CurrentSession, customerId: string, lineage: readonly Lineage[]): Promise<void> {
  await lockKnowledgeAuthor(client,actor,customerId);
  for (const source of [...lineage].sort((a,b) =>
    `${a.sourceKind}:${a.sourceRevisionId}`.localeCompare(`${b.sourceKind}:${b.sourceRevisionId}`))) {
    if (source.sourceKind === "accepted_profile") {
      const found = await client.query(`SELECT 1 FROM profile_revisions v
        JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
        LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
        WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
          AND v.revision_number=$4 AND v.content_digest=$5
          AND ($6='internal' OR (v.audience='delivery' AND
            v.data_category='delivery_context' AND
            (d.partner_safe_attestation IS NOT NULL OR NOT EXISTS (
              SELECT 1 FROM profile_evidence_links l
              LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id
              LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id
              LEFT JOIN artifact_evidence_selections selection ON selection.id=l.artifact_selection_id
              WHERE l.profile_revision_id=v.id AND
                ((source.id IS NOT NULL AND source.audience<>'delivery') OR
                 (support.id IS NOT NULL AND
                   (support.audience<>'delivery' OR support.data_category<>'delivery_context')) OR
                 (selection.id IS NOT NULL AND
                   (selection.audience<>'delivery' OR selection.data_category<>'delivery_context')))))))
        FOR UPDATE OF v,r`,
      [source.sourceRevisionId,actor.workspaceId,customerId,source.sourceGeneration,
        source.sourceDigest,actor.kind]);
      if (!found.rowCount || (await unsupportedProfileRevisionIds(client,
        [source.sourceRevisionId],true)).has(source.sourceRevisionId)) throw hiddenRecord();
    } else {
      const found = await client.query(`SELECT 1 FROM evidence_source_revisions v
        JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
        JOIN research_checks c ON c.source_revision_id=v.id
        WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
          AND v.version=$4 AND v.passage_digest=$5
          AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
          AND (v.audience='delivery' OR $6='internal')
          AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
            WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))
        FOR UPDATE OF v,s`,
      [source.sourceRevisionId,actor.workspaceId,customerId,source.sourceGeneration,
        source.sourceDigest,actor.kind]);
      if (!found.rowCount) throw hiddenRecord();
    }
  }
}

/** Obvious strings are blockers; the reviewer checklist covers indirect inference. */
export async function assertNoDirectIdentifiers(client: PoolClient,
  customerId: string,payload: Payload): Promise<void> {
  const customer = await client.query<{ display_name: string }>(
    "SELECT display_name FROM customer_references WHERE id=$1",[customerId]);
  if (!customer.rows[0]) throw hiddenRecord();
  const text = Object.values(payload).join("\n");
  const name = customer.rows[0].display_name.trim();
  if ((name.length >= 3 && text.toLocaleLowerCase("en").includes(name.toLocaleLowerCase("en"))) ||
      /\bhttps?:\/\/|\bwww\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
    throw new HttpFailure(422,"private_identifier","Remove customer identifiers and links");
  }
}
