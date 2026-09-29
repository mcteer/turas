import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { qualityInputSchema, unknownQualityInput } from "../../contracts/profiles";
import { HttpFailure } from "../../contracts/http";
import { rateEvidence } from "./quality";

export async function persistApprovedQuality(client: PoolClient, input: {
  revisionId: string; customerId: string; proposerMembershipId: string;
  reviewerMembershipId: string; payload: Record<string, unknown>; qualityInput: unknown;
}): Promise<void> {
  const parsed = qualityInputSchema.safeParse(input.qualityInput);
  const rating = qualityInputSchema.parse(parsed.success ? parsed.data : unknownQualityInput);
  let evidenceAt: Date | null = null;
  if (rating.dateSourceRevisionId) {
    const source = await client.query<{ publication_at: Date | null; observation_at: Date | null }>(`
      SELECT s.publication_at,s.observation_at FROM evidence_source_revisions s
      JOIN profile_evidence_links l ON l.source_revision_id=s.id
      WHERE l.profile_revision_id=$1 AND l.source_revision_id=$2 AND s.customer_id=$3`,
    [input.revisionId, rating.dateSourceRevisionId, input.customerId]);
    if (!source.rows[0]) throw new HttpFailure(422, "invalid_date_source", "Rating date source is unavailable");
    evidenceAt = rating.dateBasis === "publication" ? source.rows[0].publication_at :
      rating.dateBasis === "observation" ? source.rows[0].observation_at : null;
  } else {
    const marker = await client.query<{ schema_version: number }>(
      "SELECT schema_version FROM turas_environment LIMIT 1");
    const artifact = (marker.rows[0]?.schema_version ?? 0) >= 15 ? await client.query<{ source_published_on: Date | string | null;
      source_observed_on: Date | string | null }>(`
      SELECT v.source_published_on,v.source_observed_on FROM profile_evidence_links l
      JOIN artifact_evidence_selections s ON s.id=l.artifact_selection_id
      JOIN artifact_versions v ON v.id=s.version_id
      WHERE l.profile_revision_id=$1 AND v.customer_id=$2 AND l.artifact_selection_id IS NOT NULL
      LIMIT 1`, [input.revisionId,input.customerId]) : null;
    if (artifact?.rows[0]) {
      const dated = rating.dateBasis === "publication" ? artifact.rows[0].source_published_on :
        rating.dateBasis === "observation" ? artifact.rows[0].source_observed_on : null;
      // PostgreSQL date values arrive as local-midnight Date objects. Preserve
      // their calendar day when rating evidence against the UTC clock.
      evidenceAt = dated ? dated instanceof Date ?
        new Date(Date.UTC(dated.getFullYear(),dated.getMonth(),dated.getDate())) :
        new Date(`${dated}T00:00:00Z`) : null;
    } else if (rating.dateBasis === "observation") {
      const observed = input.payload.observedAt ?? input.payload.observationEnd;
      evidenceAt = typeof observed === "string" && Number.isFinite(Date.parse(observed))
        ? new Date(observed) : null;
    }
  }
  const reviewValue = input.payload.reviewAt;
  const reviewAt = typeof reviewValue === "string" && Number.isFinite(Date.parse(reviewValue))
    ? new Date(reviewValue) : null;
  const rated = rateEvidence({ R: rating.R, D: rating.D, C: rating.C,
    informationType: rating.informationType, dateBasis: rating.dateBasis,
    evidenceAt, reviewAt, asOf: new Date() });
  await client.query(`INSERT INTO evidence_quality_snapshots
    (id,profile_revision_id,rubric_version,rating_actor,input,information_type,date_basis,
     as_of,freshness,score,band)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [randomUUID(), input.revisionId, rating.rubricVersion, input.reviewerMembershipId,
    JSON.stringify({ qualityInput: rating, proposalRevisionId: input.revisionId,
      proposerMembershipId: input.proposerMembershipId,
      confirmedByMembershipId: input.reviewerMembershipId,
      evidenceAt: evidenceAt?.toISOString() ?? null }),
    rating.informationType, rating.dateBasis, rated.asOf, rated.F, rated.Q, rated.band]);
}
