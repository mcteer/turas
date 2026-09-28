import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { approvedArtifactExcerptSchema, artifactLocatorSchema,
  type ApprovedArtifactExcerpt, type ArtifactLocator } from "../../contracts/artifacts";
import { getServerConfig } from "../config";

async function evidenceSchemaReady(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  return (result.rows[0]?.schema_version ?? 0) >= 15;
}

function citation(locator: ArtifactLocator): ApprovedArtifactExcerpt["citation"] {
  switch (locator.kind) {
    case "pdf": return { kind: "pdf", page: locator.page };
    case "docx": return { kind: "docx", section: locator.section, paragraph: locator.paragraph };
    case "pptx": return { kind: "pptx", slide: locator.slide, shape: locator.shape };
    case "xlsx": return { kind: "xlsx", sheetOrdinal: locator.sheetOrdinal,
      row: locator.row, column: locator.column };
    case "csv": return { kind: "csv", record: locator.record, column: locator.column };
    case "txt": case "md": return { kind: locator.kind,
      lineStart: locator.lineStart, lineEnd: locator.lineEnd };
    case "image": return { kind: "image", regionNumber: 1 };
  }
}

/** Return only currently supported, accepted excerpts with numeric citations. */
export async function approvedArtifactExcerpts(client: PoolClient, revisionIds: readonly string[],
  actorKind: "internal" | "partner"): Promise<Map<string, ApprovedArtifactExcerpt>> {
  const result = new Map<string, ApprovedArtifactExcerpt>();
  if (!revisionIds.length || !await evidenceSchemaReady(client)) return result;
  const rows = await client.query<{ revision_id: string; excerpt: string; excerpt_digest: string;
    source_presentation: { units?: Array<{ locator?: unknown }> } }>(`
    SELECT l.profile_revision_id AS revision_id,p.excerpt,s.excerpt_digest,p.source_presentation
    FROM profile_evidence_links l JOIN artifact_evidence_selections s ON s.id=l.artifact_selection_id
    JOIN artifact_evidence_payloads p ON p.selection_id=s.id
    JOIN artifact_versions v ON v.id=s.version_id
    JOIN artifact_extraction_runs r ON r.id=s.run_id AND r.version_id=v.id
    JOIN profile_revisions pr ON pr.id=l.profile_revision_id
    JOIN profile_records record ON record.id=pr.record_id
    JOIN profile_review_decisions decision ON decision.revision_id=pr.id AND decision.decision='accept'
    WHERE l.profile_revision_id=ANY($1::uuid[])
      AND record.current_accepted_revision_id=pr.id
      AND v.state IN ('ready','partial') AND v.lifecycle_generation=s.lifecycle_generation
      AND v.sha256_digest=s.original_digest AND r.state='published'
      AND s.profile_revision_id=pr.id
      AND ($2::boolean OR (pr.audience='delivery' AND pr.data_category='delivery_context'
        AND s.audience='delivery' AND s.data_category='delivery_context'))
  `, [revisionIds,actorKind === "internal"]);
  for (const row of rows.rows) {
    if (createHash("sha256").update(row.excerpt).digest("hex") !== row.excerpt_digest) continue;
    const parsed = artifactLocatorSchema.safeParse(row.source_presentation?.units?.[0]?.locator);
    if (!parsed.success) continue;
    const excerpt = approvedArtifactExcerptSchema.safeParse({
      sourceLabel: "Customer source", citation: citation(parsed.data),
      excerpt: row.excerpt, attestation: "Reviewed customer source excerpt",
    });
    if (excerpt.success) result.set(row.revision_id, excerpt.data);
  }
  return result;
}

export async function pendingArtifactReviewSources(client: PoolClient,
  revisionIds: readonly string[]): Promise<Map<string, { versionId: string; selectionId: string;
    excerpt: string; excerptDigest: string; citation: ApprovedArtifactExcerpt["citation"] }>> {
  const result = new Map();
  if (!revisionIds.length || !await evidenceSchemaReady(client)) return result;
  const rows = await client.query<{ revision_id: string; version_id: string; selection_id: string;
    excerpt: string; excerpt_digest: string; source_presentation: { units?: Array<{ locator?: unknown }> } }>(`
    SELECT l.profile_revision_id AS revision_id,s.version_id,s.id AS selection_id,
      p.excerpt,s.excerpt_digest,p.source_presentation
    FROM profile_evidence_links l JOIN artifact_evidence_selections s ON s.id=l.artifact_selection_id
    JOIN artifact_evidence_payloads p ON p.selection_id=s.id
    JOIN artifact_versions v ON v.id=s.version_id
    JOIN artifact_extraction_runs r ON r.id=s.run_id AND r.version_id=v.id
    WHERE l.profile_revision_id=ANY($1::uuid[])
      AND s.profile_revision_id=l.profile_revision_id AND s.submitted_at IS NOT NULL
      AND v.submitted_at IS NOT NULL AND v.state IN ('ready','partial')
      AND v.lifecycle_generation=s.lifecycle_generation
      AND v.sha256_digest=s.original_digest AND r.state='published'
  `, [revisionIds]);
  for (const row of rows.rows) {
    if (createHash("sha256").update(row.excerpt).digest("hex") !== row.excerpt_digest) continue;
    const parsed = artifactLocatorSchema.safeParse(row.source_presentation?.units?.[0]?.locator);
    if (!parsed.success) continue;
    result.set(row.revision_id, { versionId: row.version_id, selectionId: row.selection_id,
      excerpt: row.excerpt, excerptDigest: row.excerpt_digest, citation: citation(parsed.data) });
  }
  return result;
}
