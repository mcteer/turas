import { qualityInputSchema, unknownQualityInput } from "../../contracts/profiles";
import { rateEvidence, type InformationType, type DateBasis } from "./quality";

export type ReviewState = "pending" | "accepted" | "rejected" | "superseded" | "retracted";
export type ProjectionRow = {
  id: string; recordId: string; workloadId: string | null; kind: string;
  reviewState: ReviewState; audience: "internal" | "delivery";
  dataCategory: "delivery_context" | "internal_operations" | "commercial" | "personnel" | "other_internal";
  authorMembershipId: string; payload: unknown; qualityInput: Record<string, unknown>;
  sourceReferences: string[]; candidateSequence: number;
  decisionRationale: string | null; partnerSafeReason: string | null;
  restrictedSupport?: boolean; safeAttestation?: string | null;
  ratingEvidenceAt?: string | null;
  createdAt?: string;
  visibleEvidenceIds?: string[];
};

export function stripPrivateLineage(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivateLineage);
  if (!value || typeof value !== "object") return value;
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "sourceMessageId" || key === "sourceSpanDigest") continue;
    projected[key] = stripPrivateLineage(entry);
  }
  return projected;
}

function partnerPayload(value: unknown, visibleEvidenceIds: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => partnerPayload(entry, visibleEvidenceIds));
  if (!value || typeof value !== "object") return value;
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (["sourceMessageId", "sourceSpanDigest", "ownerReferenceId", "recordReferenceId",
      "referenceId", "sourceUrl", "sourceExcerpt"].includes(key)) continue;
    if (key === "evidenceRevisionIds") {
      projected[key] = Array.isArray(entry) ? entry.filter((id) =>
        typeof id === "string" && visibleEvidenceIds.has(id)) : [];
    } else projected[key] = partnerPayload(entry, visibleEvidenceIds);
  }
  return projected;
}

function qualityForRow(row: ProjectionRow, partner = false) {
  const input = qualityInputSchema.safeParse(row.qualityInput);
  const rated = input.success ? input.data : unknownQualityInput;
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  const observed = payload.observedAt ?? payload.observationEnd;
  const review = payload.reviewAt;
  const date = row.ratingEvidenceAt !== undefined ?
    (row.ratingEvidenceAt ? new Date(row.ratingEvidenceAt) : null) :
    rated.dateBasis === "observation" && typeof observed === "string" ? new Date(observed) : null;
  const reviewDate = typeof review === "string" ? new Date(review) : null;
  const restricted = partner && row.restrictedSupport;
  const result = rateEvidence({ R: restricted ? 0 : rated.R,
    D: restricted ? 0 : rated.D, C: restricted ? 0 : rated.C,
    informationType: rated.informationType as InformationType,
    dateBasis: rated.dateBasis as DateBasis,
    evidenceAt: restricted ? null : date, reviewAt: reviewDate, asOf: new Date() });
  return { rubricVersion: rated.rubricVersion, ...result,
    asOf: result.asOf.toISOString(), validUntil: result.validUntil.toISOString() };
}

export function projectRevision(row: ProjectionRow, actorKind: "internal" | "partner",
  actorMembershipId: string, canReview = false): Record<string, unknown> | null {
  const own = row.authorMembershipId === actorMembershipId;
  if (actorKind === "partner") {
    const acceptedDelivery = row.reviewState === "accepted" && row.audience === "delivery" &&
      row.dataCategory === "delivery_context";
    const ownUnaccepted = own && (row.reviewState === "pending" || row.reviewState === "rejected") &&
      row.audience === "delivery" && row.dataCategory === "delivery_context";
    if (!acceptedDelivery && !ownUnaccepted) return null;
    if (row.kind === "stakeholder" && row.payload && typeof row.payload === "object" &&
        (row.payload as Record<string, unknown>).classification === "internal") return null;
    if (acceptedDelivery && row.restrictedSupport && !row.safeAttestation) return null;
    const quality = qualityForRow(row, true);
    return { id: row.id, recordId: row.recordId, workloadId: row.workloadId,
      kind: row.kind, reviewState: row.reviewState,
      payload: partnerPayload(row.payload, new Set(row.visibleEvidenceIds ?? [])),
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      quality,
      ...(row.restrictedSupport ? { sourceStatus: "restricted", sourceAttestation: row.safeAttestation } : {}),
      ...(ownUnaccepted ? { partnerSafeReason: row.partnerSafeReason } : {}) };
  }
  if ((row.reviewState === "pending" || row.reviewState === "rejected") && !own && !canReview) return null;
  return { id: row.id, recordId: row.recordId, workloadId: row.workloadId,
    kind: row.kind, reviewState: row.reviewState,
    audience: row.audience, dataCategory: row.dataCategory,
    payload: stripPrivateLineage(row.payload),
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    qualityInput: row.qualityInput, quality: qualityForRow(row), sourceReferences: row.sourceReferences,
    authorMembershipId: row.authorMembershipId,
    decisionRationale: row.decisionRationale,
    candidateSequence: row.candidateSequence };
}
