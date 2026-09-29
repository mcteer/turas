export type InformationType = "account_status" | "product_availability" | "product_capability" |
  "adoption_process" | "architecture" | "unknown";
export type DateBasis = "observation" | "publication" | "unknown";
export type QualityInput = {
  R: number; D: number; C: number;
  informationType: InformationType;
  dateBasis: DateBasis;
  evidenceAt: Date | null;
  reviewAt?: Date | null;
  asOf: Date;
};
export type QualityResult = {
  R: number; F: number; D: number; C: number; Q: number;
  band: "strong" | "usable" | "weak" | "insufficient";
  freshness: "Recent" | "Aging" | "Stale" | "Unknown";
  asOf: Date; validUntil: Date;
};
const day = 86_400_000;
const windows: Record<InformationType, number> = {
  account_status: 7, product_availability: 14, product_capability: 30,
  adoption_process: 90, architecture: 180, unknown: 0,
};

export function evidenceReviewDueAt(input: {
  informationType: InformationType; dateBasis: DateBasis;
  observationAt?: Date | null; publicationAt?: Date | null;
}, asOf = new Date()): Date {
  const evidenceAt = input.dateBasis === "observation" ? input.observationAt :
    input.dateBasis === "publication" ? input.publicationAt : null;
  const window = windows[input.informationType];
  if (!evidenceAt || !Number.isFinite(evidenceAt.getTime()) || !window ||
      evidenceAt.getTime() > asOf.getTime()) return asOf;
  return new Date(evidenceAt.getTime()+window*day);
}

export function rateEvidence(input: QualityInput): QualityResult {
  for (const score of [input.R, input.D, input.C]) {
    if (!Number.isInteger(score) || score < 0 || score > 4) throw new RangeError("Quality components must be integers from 0 to 4");
  }
  const asOfMs = input.asOf.getTime();
  if (!Number.isFinite(asOfMs)) throw new RangeError("Invalid assessment time");
  const evidenceMs = input.evidenceAt?.getTime();
  const windowMs = windows[input.informationType] * day;
  const validDate = input.dateBasis !== "unknown" && windowMs > 0 && evidenceMs !== undefined &&
    Number.isFinite(evidenceMs) && evidenceMs <= asOfMs;
  const age = validDate ? asOfMs - evidenceMs : null;
  let F = age === null ? 0 : age <= windowMs ? 4 : age <= 1.5 * windowMs ? 3 :
    age <= 2 * windowMs ? 2 : 1;
  let freshness: QualityResult["freshness"] = age === null ? "Unknown" :
    age <= windowMs ? "Recent" : age <= 2 * windowMs ? "Aging" : "Stale";
  const reviewMs = input.reviewAt?.getTime();
  if (reviewMs !== undefined && Number.isFinite(reviewMs) && reviewMs <= asOfMs) {
    F = Math.min(F, 1);
    freshness = "Stale";
  }
  const Q = Math.round(25 * (0.4 * input.R + 0.3 * F + 0.2 * input.D + 0.1 * input.C));
  const band: QualityResult["band"] = Q >= 80 ? "strong" : Q >= 60 ? "usable" : Q >= 40 ? "weak" : "insufficient";
  const future = [asOfMs + day];
  if (age !== null && evidenceMs !== undefined) {
    for (const multiplier of [1, 1.5, 2]) {
      const boundary = evidenceMs + multiplier * windowMs + 1;
      if (boundary > asOfMs) future.push(boundary);
    }
  }
  if (reviewMs !== undefined && Number.isFinite(reviewMs) && reviewMs > asOfMs) future.push(reviewMs);
  return { R: input.R, F, D: input.D, C: input.C, Q, band, freshness,
    asOf: input.asOf, validUntil: new Date(Math.min(...future)) };
}
