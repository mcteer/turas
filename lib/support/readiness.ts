/** Versioned judgment precedence; factual eligibility is supplied by the server's
 * current source fence, never inferred from a status or model response. */
export const supportReadinessRubricVersion = "support-readiness-v1" as const;
export const supportReadinessKeys = ["operating_ownership", "support_escalation",
  "observability_triage", "change_recovery", "runbooks_knowledge", "handoff_obligations"] as const;
export type SupportReadinessStatus = "ready" | "gap" | "unknown" | "not_applicable";
export type EffectiveSupportReadiness = "not_assessed" | "review_required" | "gaps" |
  "unknown" | "ready" | "not_applicable";

export function effectiveSupportReadiness(
  assessment: { checks: readonly { status: SupportReadinessStatus }[]; nextReviewDate: string } | null,
  today: string, sourcesCurrent: boolean,
): EffectiveSupportReadiness {
  if (!assessment) return "not_assessed";
  if (!sourcesCurrent || assessment.nextReviewDate < today) return "review_required";
  if (assessment.checks.some(check => check.status === "gap")) return "gaps";
  if (!assessment.checks.length || assessment.checks.some(check => check.status === "unknown")) return "unknown";
  if (assessment.checks.some(check => check.status === "ready")) return "ready";
  return "not_applicable";
}
