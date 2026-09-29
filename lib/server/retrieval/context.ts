import { qualityInputSchema, unknownQualityInput } from "../../contracts/profiles";
import { rateEvidence } from "../profiles/quality";

export function retrievalQuality(input: unknown, dates: {
  observationAt?: Date | null; publicationAt?: Date | null; reviewAt?: Date | null;
}, asOf = new Date()) {
  const parsed = qualityInputSchema.safeParse(input);
  const quality = parsed.success ? parsed.data : unknownQualityInput;
  const evidenceAt = quality.dateBasis === "observation" ? dates.observationAt ?? null :
    quality.dateBasis === "publication" ? dates.publicationAt ?? null : null;
  const result = rateEvidence({ R: quality.R,D: quality.D,C: quality.C,
    informationType: quality.informationType,dateBasis: quality.dateBasis,
    evidenceAt,reviewAt: dates.reviewAt,asOf });
  return { rubricVersion: "evidence-quality-v1" as const,
    ...result,asOf: result.asOf.toISOString(),validUntil: result.validUntil.toISOString(),
    rationale: parsed.success ? [quality.reliabilityRationale,quality.directnessRationale,
      quality.corroborationRationale].join("; ").slice(0,2_000) : "Quality not verified" };
}

export function currentFactEligible(quality: ReturnType<typeof retrievalQuality>,
  materialConflict = false, at = new Date()): boolean {
  return !materialConflict && quality.R >= 2 &&
    ["strong","usable"].includes(quality.band) &&
    ["Recent","Aging"].includes(quality.freshness) &&
    Date.parse(quality.validUntil) > at.getTime();
}

export function retrievalCoverageWarnings(query: string, degraded: boolean): string[] {
  const warnings = ["English-language retrieval coverage; other languages may have reduced recall"];
  if (degraded) warnings.push("Semantic ranking unavailable; lexical results only");
  if (/[^\x00-\x7F]/.test(query)) warnings.push("Query contains characters outside ASCII; relevance may vary");
  return warnings;
}

export function corroborationScore(primaryAuthoritative: boolean,
  additional: readonly { origin: "independent_discovery" | "user_submission";
    contentDigest: string; syndicationGroup?: string | null; independentlyVerified: boolean }[]): number {
  const groups = new Set<string>();
  for (const source of additional) {
    if (source.origin !== "independent_discovery" || !source.independentlyVerified) continue;
    groups.add(source.syndicationGroup || source.contentDigest);
  }
  return groups.size >= 2 ? 4 : groups.size === 1 ? 3 : primaryAuthoritative ? 2 : 1;
}
