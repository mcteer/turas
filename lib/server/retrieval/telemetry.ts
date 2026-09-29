export const retrievalMetricNames = [
  "queue_age_ms", "index_duration_ms", "embedding_duration_ms",
  "ranking_duration_ms", "search_duration_ms", "cleanup_lag_ms",
  "retry_count", "lease_reclaim_count", "lexical_degraded_count",
  "unconfirmed_operation_count", "denied_count",
] as const;
export type RetrievalMetric = typeof retrievalMetricNames[number];
const allowed = new Set<string>(retrievalMetricNames);

/** Fixed label and bounded integer only: no query, passage, URL, customer or actor. */
export function retrievalMetricRecord(metric: RetrievalMetric, value: number) {
  if (!allowed.has(metric) || !Number.isFinite(value) || value < 0 ||
      value > 365 * 86_400_000) throw new RangeError("Invalid retrieval metric");
  return { kind: "turas_retrieval_metric" as const, metric, value: Math.round(value) };
}

export function recordRetrievalMetric(metric: RetrievalMetric, value: number): void {
  console.info(JSON.stringify(retrievalMetricRecord(metric,value)));
}
