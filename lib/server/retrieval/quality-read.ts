import type { PoolClient } from "pg";
import { evidenceQualitySchema } from "../../contracts/retrieval";
import { retrievalQuality } from "./context";

export async function readRetrievalQuality(client: PoolClient, row: {source_kind:string;source_revision_id:string}, asOf: Date) {
  if (row.source_kind === "published_shared") {
    const shared = await client.query<{ public_quality: unknown }>(
      "SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",
      [row.source_revision_id]);
    return evidenceQualitySchema.safeParse(shared.rows[0]?.public_quality).data ??
      retrievalQuality(null,{},asOf);
  }
  if (row.source_kind === "verified_research") {
    const found = await client.query<{ quality_input: unknown; observation_at: Date | null;
      publication_at: Date | null }>(`SELECT quality_input,observation_at,publication_at
      FROM evidence_source_revisions WHERE id=$1`,[row.source_revision_id]);
    return retrievalQuality(found.rows[0]?.quality_input,{
      observationAt: found.rows[0]?.observation_at,
      publicationAt: found.rows[0]?.publication_at },asOf);
  }
  const found = await client.query<{ quality_input: unknown; payload: Record<string, unknown> }>(`
    SELECT v.quality_input,v.payload FROM profile_revisions v
    WHERE v.id=${row.source_kind === "approved_excerpt" ?
      "(SELECT s.profile_revision_id FROM artifact_evidence_selections s WHERE s.id=$1)" : "$1"}`,
  [row.source_revision_id]);
  const payload = found.rows[0]?.payload ?? {};
  const observed = payload.observedAt ?? payload.observationEnd;
  return retrievalQuality(found.rows[0]?.quality_input,{
    observationAt: typeof observed === "string" ? new Date(observed) : null,
    reviewAt: typeof payload.reviewAt === "string" ? new Date(payload.reviewAt) : null },asOf);
}
