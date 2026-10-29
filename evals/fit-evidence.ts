export type FitEvidenceSource = {
  citationId: string; sourceKind: string; sourceRevisionId: string;
};

/** Verify fixture coverage before spending on the model comparison. */
export function assertFitEvidenceCoverage(sources: readonly FitEvidenceSource[],
  requiredRevisionIds: readonly string[] = []) {
  const kinds = new Set(sources.map(source => source.sourceKind));
  if (!kinds.has("accepted_profile") || !kinds.has("verified_research")) {
    throw new Error("fit evidence classes missing");
  }
  const selected = new Set(sources.map(source => source.sourceRevisionId));
  if (requiredRevisionIds.some(id => !selected.has(id))) {
    throw new Error("fit evidence omits an exact required source revision");
  }
}
