import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { supportReadinessKeys, supportReadinessRubricVersion } from "../support/readiness";

export const supportContractVersion = "support-v1" as const;
export const supportId = z.uuid();
export const supportVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const supportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { Temporal.PlainDate.from(value, { overflow: "reject" }); return true; } catch { return false; }
}, "Invalid date");
export const supportTimezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return !/^[+-]/.test(value); } catch { return false; }
}, "Invalid IANA timezone");
const title = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(2000);
const reason = z.string().trim().min(1).max(500);
const sourceKeys = z.array(supportId).max(20).refine(values => new Set(values).size === values.length, "Duplicate source");
export const supportOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("membership"), membershipId: supportId }).strict(),
  z.object({ kind: z.literal("customer_role"), label: title, sourceKey: supportId }).strict(),
  z.object({ kind: z.literal("unassigned"), reason }).strict(),
]);
export const supportExternalReference = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash && !value.includes("?") && !value.includes("#");
  } catch { return false; }
}, "Use an HTTPS reference without credentials, query or fragment");
export const supportEscalationSchema = z.object({ trigger: text, observedImpact: text,
  accountableRole: title, routeKnown: z.boolean(), route: text.optional(), unknownRouteReason: reason.optional(),
  evidenceChecklist: text, nextCheckpointDate: supportDate,
}).strict().superRefine((value, ctx) => {
  if (value.routeKnown ? !value.route || value.unknownRouteReason !== undefined : !value.unknownRouteReason || value.route !== undefined)
    ctx.addIssue({ code: "custom", message: "Provide exactly one known route or unknown-route reason" });
});
const common = { contractVersion: z.literal(supportContractVersion), title,
  observationDate: supportDate, nextReviewDate: supportDate, timezone: supportTimezone };
export const supportAssessmentSchema = z.object({ ...common,
  rubricVersion: z.literal(supportReadinessRubricVersion),
  checks: z.array(z.object({ key: z.enum(supportReadinessKeys),
    status: z.enum(["ready", "gap", "unknown", "not_applicable"]), rationale: text,
    sourceKeys, discoveryNeed: reason.optional(),
  }).strict()).length(6),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.checks.map(check => check.key)).size !== 6)
    ctx.addIssue({ code: "custom", message: "Six distinct readiness areas required" });
  for (const [index, check] of value.checks.entries()) {
    if ((check.status === "ready" || check.status === "gap") && !check.sourceKeys.length)
      ctx.addIssue({ code: "custom", path: ["checks", index, "sourceKeys"], message: "Evidence required" });
    if (check.status === "unknown" && !check.discoveryNeed)
      ctx.addIssue({ code: "custom", path: ["checks", index, "discoveryNeed"], message: "Discovery need required" });
  }
  if (value.nextReviewDate <= value.observationDate)
    ctx.addIssue({ code: "custom", path: ["nextReviewDate"], message: "Review must follow observation" });
});
export const supportActionSchema = z.object({ ...common, desiredOutcome: text, rationale: text,
  validationCriterion: text, priority: z.enum(["high", "normal", "low"]), owner: supportOwnerSchema,
  disposition: z.enum(["open", "in_progress", "blocked", "deferred", "completed", "dismissed"]),
  dispositionRationale: text.optional(), revisitDate: supportDate.optional(), completedDate: supportDate.optional(),
  outcomeSourceKeys: sourceKeys, basedOnAssessmentRevisionId: supportId.optional(), escalation: supportEscalationSchema.optional(),
  handoff: z.object({ kind: z.literal("human_reported"), occurredAt: z.iso.datetime({ offset: true }),
    externalReference: supportExternalReference, supportingSourceKeys: sourceKeys }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.nextReviewDate <= value.observationDate)
    ctx.addIssue({ code: "custom", path: ["nextReviewDate"], message: "Review must follow observation" });
  if (value.disposition === "deferred" && (!value.revisitDate || value.revisitDate <= value.observationDate))
    ctx.addIssue({ code: "custom", path: ["revisitDate"], message: "Future revisit required" });
  if (["blocked", "dismissed"].includes(value.disposition) && !value.dispositionRationale)
    ctx.addIssue({ code: "custom", path: ["dispositionRationale"], message: "Rationale required" });
  if (value.disposition === "completed" && (!value.completedDate || !value.outcomeSourceKeys.length))
    ctx.addIssue({ code: "custom", message: "Dated outcome evidence required" });
});
export type SupportAssessment = z.infer<typeof supportAssessmentSchema>;
export type SupportAction = z.infer<typeof supportActionSchema>;

/** Clock-dependent constraints are explicit so tests and commands share one rule. */
export function supportTemporalIssues(value: SupportAssessment | SupportAction, now: Temporal.Instant): string[] {
  const today = now.toZonedDateTimeISO(value.timezone).toPlainDate().toString();
  const issues: string[] = [];
  if (value.observationDate > today) issues.push("future_observation");
  if ("completedDate" in value && value.completedDate && value.completedDate > today) issues.push("future_completion");
  if ("handoff" in value && value.handoff && Temporal.Instant.compare(Temporal.Instant.from(value.handoff.occurredAt), now) > 0)
    issues.push("future_handoff");
  return issues;
}
