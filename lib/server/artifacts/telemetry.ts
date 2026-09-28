export type ArtifactMetric = "queue_age_ms" | "scan_signature_age_ms" |
  "scan_duration_ms" | "parse_duration_ms" | "retry_count" |
  "lease_reclaim_count" | "cleanup_lag_ms";

const allowed = new Set<ArtifactMetric>([
  "queue_age_ms","scan_signature_age_ms","scan_duration_ms","parse_duration_ms",
  "retry_count","lease_reclaim_count","cleanup_lag_ms",
]);

/** Emit only bounded numeric measures and a fixed metric name. */
export function artifactMetricRecord(metric: ArtifactMetric, value: number): {
  kind: "turas_artifact_metric"; metric: ArtifactMetric; value: number } {
  if (!allowed.has(metric) || !Number.isFinite(value) || value < 0 || value > 365 * 86_400_000) {
    throw new RangeError("Invalid artifact metric");
  }
  return { kind: "turas_artifact_metric",metric,value: Math.round(value) };
}

export function recordArtifactMetric(metric: ArtifactMetric, value: number): void {
  console.info(JSON.stringify(artifactMetricRecord(metric,value)));
}
