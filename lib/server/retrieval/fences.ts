import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { knowledgeLineageIsCurrent, unsupportedProfileRevisionIds } from "../profiles/eligibility";
import { authorizeRetrievalScope,retrievalIntakeEnabled } from "./policy";

async function schemaReady(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ schema_version: number }>(`
    SELECT schema_version FROM turas_environment WHERE environment_id=$1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID]);
  return (result.rows[0]?.schema_version ?? 0) >= 25;
}

type Dependency = { source_kind: string; source_revision_id: string;
  source_generation: string; source_digest: string };

/** A receipt minted before confirmation cannot be replayed as settled evidence. */
export async function confirmedConflictAfter(client: PoolClient,kind: string,
  revisionId: string,asOf: Date): Promise<boolean> {
  const typed = await client.query(`SELECT 1 FROM evidence_conflict_targets
    WHERE environment_id=$1 AND state='confirmed' AND updated_at>$2
      AND ((first_kind=$3 AND first_revision_id=$4)
        OR (second_kind=$3 AND second_revision_id=$4)) LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,asOf,kind,revisionId]);
  if (typed.rowCount) return true;
  if (kind !== "accepted_profile") return false;
  const legacy = await client.query(`SELECT 1 FROM evidence_conflicts conflict
    JOIN evidence_conflict_events event ON event.conflict_id=conflict.id
      AND event.event_type='confirm'
    WHERE conflict.state='confirmed' AND event.created_at>$2
      AND (conflict.first_revision_id=$1 OR conflict.second_revision_id=$1)
    LIMIT 1`,[revisionId,asOf]);
  return Boolean(legacy.rowCount);
}

async function originalCurrent(client: PoolClient, dependency: Dependency): Promise<boolean> {
  const values = [dependency.source_revision_id,dependency.source_generation,
    dependency.source_digest];
  if (dependency.source_kind === "accepted_profile") {
    const found = await client.query(`SELECT 1 FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      WHERE v.id=$1 AND v.revision_number=$2 AND v.content_digest=$3`,values);
    return Boolean(found.rowCount) && !(await unsupportedProfileRevisionIds(client,
      [dependency.source_revision_id],true)).has(dependency.source_revision_id);
  }
  if (dependency.source_kind === "approved_excerpt") {
    const found = await client.query(`SELECT 1 FROM artifact_evidence_selections s
      JOIN artifact_versions v ON v.id=s.version_id
        AND v.lifecycle_generation=s.lifecycle_generation
        AND v.sha256_digest=s.original_digest AND v.state IN ('ready','partial')
      JOIN artifact_extraction_runs r ON r.id=s.run_id AND r.state='published'
      JOIN artifact_evidence_payloads p ON p.selection_id=s.id
      JOIN profile_revisions pr ON pr.id=s.profile_revision_id
      JOIN profile_records record ON record.id=pr.record_id
        AND record.current_accepted_revision_id=pr.id
      WHERE s.id=$1 AND s.lifecycle_generation=$2 AND s.excerpt_digest=$3`,values);
    return Boolean(found.rowCount);
  }
  if (dependency.source_kind === "verified_research") {
    const found = await client.query(`SELECT 1 FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks c ON c.source_revision_id=v.id
        AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
      WHERE v.id=$1 AND v.version=$2 AND v.passage_digest=$3
        AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
          WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))`,values);
    return Boolean(found.rowCount);
  }
  if (dependency.source_kind === "published_shared") {
    const found = await client.query(`SELECT 1 FROM knowledge_publications p
      JOIN knowledge_revisions r ON r.id=p.revision_id
      JOIN knowledge_revision_payloads payload ON payload.revision_id=r.id
      WHERE p.revision_id=$1 AND p.head_generation=$2 AND r.content_digest=$3
        AND p.state='published'`,values);
    return Boolean(found.rowCount) && await knowledgeLineageIsCurrent(client,
      dependency.source_revision_id);
  }
  return false;
}

/** Revalidate the append-only union before every model/output/history release. */
export async function assertRetrievalDependenciesCurrent(client: PoolClient,
  conversationId: string): Promise<void> {
  if (!await schemaReady(client)) return;
  const dependencies = await client.query<Dependency & { valid_until: Date;
    receipt_as_of: Date | null }>(`
    SELECT dependency.source_kind,dependency.source_revision_id,
      dependency.source_generation,dependency.source_digest,dependency.valid_until,
      receipt.as_of AS receipt_as_of
    FROM session_evidence_dependencies dependency
    LEFT JOIN retrieval_receipts receipt ON receipt.id=dependency.receipt_id
    WHERE dependency.conversation_id=$1
    ORDER BY dependency.consumed_at,dependency.id`,
  [conversationId]);
  if (dependencies.rows.length && !retrievalIntakeEnabled()) {
    throw new HttpFailure(409,"retrieval_context_changed",
      "Start a new conversation for current evidence");
  }
  for (const dependency of dependencies.rows) {
    if (!dependency.receipt_as_of || dependency.valid_until.getTime() <= Date.now() ||
        await confirmedConflictAfter(client,dependency.source_kind,
          dependency.source_revision_id,dependency.receipt_as_of) ||
        !await originalCurrent(client,dependency)) {
      throw new HttpFailure(409,"retrieval_context_changed",
        "Start a new conversation for current evidence");
    }
  }
}

async function originalDependency(client: PoolClient, kind: string,
  revisionId: string): Promise<Dependency | null> {
  const sql = kind === "accepted_profile" ?
    "SELECT revision_number AS generation,content_digest AS digest FROM profile_revisions WHERE id=$1" :
    kind === "approved_excerpt" ?
      "SELECT lifecycle_generation AS generation,excerpt_digest AS digest FROM artifact_evidence_selections WHERE id=$1" :
      kind === "verified_research" ?
        "SELECT version AS generation,passage_digest AS digest FROM evidence_source_revisions WHERE id=$1" :
        kind === "published_shared" ?
          `SELECT p.head_generation AS generation,r.content_digest AS digest
           FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id
           WHERE p.revision_id=$1` : null;
  if (!sql) return null;
  const found = await client.query<{ generation: string; digest: string }>(sql,[revisionId]);
  return found.rows[0] ? { source_kind: kind,source_revision_id: revisionId,
    source_generation: found.rows[0].generation,source_digest: found.rows[0].digest } : null;
}

export async function exactRetrievalOriginalCurrent(client: PoolClient,kind: string,
  revisionId: string,generation: string): Promise<boolean> {
  const original = await originalDependency(client,kind,revisionId);
  return Boolean(original && original.source_generation === generation &&
    await originalCurrent(client,original));
}

async function expandDependencies(client: PoolClient,
  direct: readonly Dependency[]): Promise<Dependency[]> {
  const queued = [...direct];
  const seen = new Set<string>();
  const expanded: Dependency[] = [];
  while (queued.length) {
    if (expanded.length > 100) throw new HttpFailure(503,"unavailable","Evidence dependency limit exceeded");
    const current = queued.shift()!;
    const key = `${current.source_kind}:${current.source_revision_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    expanded.push(current);
    const linked: Array<{ kind: string; id: string }> = [];
    if (current.source_kind === "published_shared") {
      const rows = await client.query<{ source_kind: string; source_revision_id: string }>(`
        SELECT source_kind,source_revision_id FROM knowledge_lineage
        WHERE revision_id=$1 ORDER BY ordinal`,[current.source_revision_id]);
      linked.push(...rows.rows.map((row) => ({ kind: row.source_kind,id: row.source_revision_id })));
    } else if (current.source_kind === "approved_excerpt") {
      const rows = await client.query<{ profile_revision_id: string | null }>(`
        SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1`,
      [current.source_revision_id]);
      if (rows.rows[0]?.profile_revision_id) linked.push({ kind: "accepted_profile",
        id: rows.rows[0].profile_revision_id });
    } else if (current.source_kind === "accepted_profile") {
      const rows = await client.query<{ source_revision_id: string | null;
        supporting_profile_revision_id: string | null; artifact_selection_id: string | null }>(`
        SELECT source_revision_id,supporting_profile_revision_id,artifact_selection_id
        FROM profile_evidence_links WHERE profile_revision_id=$1`,[current.source_revision_id]);
      for (const row of rows.rows) {
        if (row.source_revision_id) linked.push({ kind: "verified_research",id: row.source_revision_id });
        if (row.supporting_profile_revision_id) linked.push({ kind: "accepted_profile",
          id: row.supporting_profile_revision_id });
        if (row.artifact_selection_id) linked.push({ kind: "approved_excerpt",
          id: row.artifact_selection_id });
      }
    }
    for (const link of linked) {
      const dependency = await originalDependency(client,link.kind,link.id);
      if (!dependency) throw new HttpFailure(409,"retrieval_context_changed","Evidence changed before use");
      queued.push(dependency);
    }
  }
  return expanded;
}

export async function recordRetrievalConsumption(client: PoolClient, actor: CurrentSession,
  receiptId: string, conversationId: string): Promise<void> {
  const conversation = await client.query<{ eve_session_id: string; customer_id: string;
    owner_principal_id: string; workspace_id: string }>(`
    SELECT eve_session_id,customer_id,owner_principal_id,workspace_id
    FROM conversations WHERE id=$1 AND environment_id=$2 FOR UPDATE`,
  [conversationId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const bound = conversation.rows[0];
  if (!bound || bound.owner_principal_id !== actor.principalId ||
      bound.workspace_id !== actor.workspaceId) throw hiddenRecord();
  const receipt = await client.query<{ scope: "customer" | "shared" | "combined";
    customer_id: string | null; valid_until: Date; as_of: Date }>(`SELECT scope,customer_id,valid_until,as_of FROM retrieval_receipts
    WHERE id=$1 AND actor_membership_id=$2 AND environment_id=$3
      AND valid_until>now()`,
  [receiptId,actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const selected = receipt.rows[0];
  if (!selected || (selected.customer_id && selected.customer_id !== bound.customer_id)) {
    throw hiddenRecord();
  }
  await authorizeRetrievalScope(client,actor,selected.scope,bound.customer_id);
  const sources = await client.query<Omit<Dependency,"source_digest">>(`
    SELECT s.source_kind,s.source_revision_id,s.source_generation
    FROM retrieval_receipt_sources rs
    JOIN retrieval_sources s ON s.id=rs.source_id
      AND s.source_kind=rs.source_kind AND s.source_revision_id=rs.source_revision_id
      AND s.source_generation=rs.source_generation
      AND s.projection_contract=rs.projection_contract
    JOIN retrieval_passages p ON p.id=rs.passage_id AND p.source_id=s.id
      AND p.passage_digest=rs.passage_digest
    WHERE rs.receipt_id=$1 AND s.lifecycle_state='current'
    ORDER BY rs.ordinal`,[receiptId]);
  const receiptSourceCount = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM retrieval_receipt_sources WHERE receipt_id=$1`,[receiptId]);
  if (sources.rows.length !== Number(receiptSourceCount.rows[0]?.count ?? 0)) {
    throw new HttpFailure(409,"retrieval_context_changed","Evidence changed before use");
  }
  const direct: Dependency[] = [];
  for (const source of sources.rows) {
    const original = await originalDependency(client,source.source_kind,
      source.source_revision_id);
    if (!original || original.source_generation !== source.source_generation) {
      throw new HttpFailure(409,"retrieval_context_changed","Evidence changed before use");
    }
    direct.push(original);
  }
  for (const source of await expandDependencies(client,direct)) {
    if (await confirmedConflictAfter(client,source.source_kind,
      source.source_revision_id,selected.as_of) || !await originalCurrent(client,source)) {
      throw new HttpFailure(409,"retrieval_context_changed","Evidence changed before use");
    }
    await client.query(`INSERT INTO session_evidence_dependencies
      (id,environment_id,conversation_id,session_id,receipt_id,source_kind,
       source_revision_id,source_generation,source_digest,valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (session_id,source_kind,source_revision_id,source_generation)
      DO NOTHING`,
    [randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,conversationId,
      bound.eve_session_id,receiptId,source.source_kind,source.source_revision_id,
      source.source_generation,source.source_digest,selected.valid_until]);
  }
}
