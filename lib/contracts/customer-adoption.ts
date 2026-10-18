import { z } from "zod";
import type { JourneyRecord } from "./customer-journey";

export const metricId = "weekly_active_admin_rate_v1" as const;
export const metricDefinition =
  "Percentage of eligible administrators completing at least one governed execution in a seven-day window, compared across 28–35 days for the same eligible population in one governed execution pilot.";
export const minimumCohortSize = 5;
export const quarterSchema = z.string().regex(/^20\d{2}-Q[1-4]$/);
export const interventionSchema = z.enum([
  "enablement_and_handoff",
  "no_recorded_intervention",
]);
const count = z.number().int().min(0).max(10000000);
export const contributionSchema = z
  .object({
    baselineActive: count,
    currentActive: count,
    eligibleAdministrators: count.min(1),
    intervention: interventionSchema,
    definitionAndSamePopulationConfirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      value.baselineActive <= value.eligibleAdministrators &&
      value.currentActive <= value.eligibleAdministrators,
    "Active administrators cannot exceed the eligible population.",
  );
const common = {
  requestId: z.string().uuid(),
  quarter: quarterSchema,
  expectedVersion: z.number().int().min(0),
  rationale: z.string().trim().min(1).max(1000),
};
export const learningCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("include"),
      sourceRecordId: z.string().uuid(),
      contribution: contributionSchema,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("revoke"),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type LearningCommand = z.infer<typeof learningCommandSchema>;
export const measurementSchema = z
  .object({
    metricId: z.literal(metricId),
    quarter: quarterSchema,
    baselinePercent: z.number().min(0).max(100),
    currentPercent: z.number().min(0).max(100),
    intervention: interventionSchema,
  })
  .strict();
export type Measurement = z.infer<typeof measurementSchema>;
export function quarterFor(date: string) {
  return `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}
export function closedQuarter(quarter: string, now = new Date()) {
  return (
    quarterSchema.parse(quarter) < quarterFor(now.toISOString().slice(0, 10))
  );
}
export function reviewedMeasurement(
  record: Pick<JourneyRecord,"state"|"context">,
  command: Extract<LearningCommand, { action: "include" }>,
): Measurement {
  const impact = record.context.impact;
  if (
    record.state !== "approved" ||
    !impact ||
    impact.basis !== "measured" ||
    impact.direction !== "increase" ||
    impact.metric !== "Weekly active administrators" ||
    !["%", "percent"].includes(impact.unit)
  )
    throw new Error(
      "Use a current approved, measured outcome named Weekly active administrators, with percent units and increase direction. Estimates and training attendance are not eligible.",
    );
  const days =
    (Date.parse(impact.periodEnd) - Date.parse(impact.periodStart)) / 86400000;
  if (
    days < 28 ||
    days > 35 ||
    quarterFor(impact.periodEnd) !== command.quarter
  )
    throw new Error(
      "Use comparable measurements 28–35 days apart, in the quarter containing the end date.",
    );
  const baseline =
    (100 * command.contribution.baselineActive) /
    command.contribution.eligibleAdministrators;
  const current =
    (100 * command.contribution.currentActive) /
    command.contribution.eligibleAdministrators;
  if (
    Math.abs(baseline - impact.baseline) > 0.011 ||
    Math.abs(current - impact.current) > 0.011
  )
    throw new Error(
      "The supplied counts do not match the reviewed source percentages.",
    );
  return measurementSchema.parse({
    metricId,
    quarter: command.quarter,
    baselinePercent: baseline,
    currentPercent: current,
    intervention: command.contribution.intervention,
  });
}
export const patternReportSchema = z.object({
  status: z.enum(["available", "insufficient_evidence"]),
  metricId: z.literal(metricId),
  definition: z.string(),
  quarter: quarterSchema,
  minimumAccountsPerGroup: z.literal(minimumCohortSize),
  groups: z.array(
    z.object({
      intervention: interventionSchema,
      accountCount: z.number().int(),
      meanBaselinePercent: z.number(),
      meanCurrentPercent: z.number(),
      meanChangePercentagePoints: z.number(),
    }),
  ),
  interpretation: z.string(),
});
// Repository supplies only current, authorized, explicitly approved sources.
// This function never emits account identifiers, individual measurements or text.
export function aggregatePatterns(
  quarter: string,
  contributions: Array<Measurement & { accountId: string }>,
) {
  quarterSchema.parse(quarter);
  const byAccount = new Map<string, Measurement[]>();
  for (const row of contributions) {
    const { accountId, ...values } = row;
    const measurement = measurementSchema.parse(values);
    if (measurement.quarter !== quarter) continue;
    const records = byAccount.get(accountId) ?? [];
    records.push(measurement);
    byAccount.set(accountId, records);
  }
  // Defensive: conflicting duplicates are excluded, not selected opportunistically.
  const unique = [...byAccount.values()].flatMap((rows) =>
    rows.every((row) => JSON.stringify(row) === JSON.stringify(rows[0]))
      ? [rows[0]]
      : [],
  );
  const groups = interventionSchema.options.map((intervention) => {
    const rows = unique.filter((row) => row.intervention === intervention);
    const average = (field: "baselinePercent" | "currentPercent") =>
      rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
    const baseline = average("baselinePercent"),
      current = average("currentPercent");
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      intervention,
      accountCount: rows.length,
      meanBaselinePercent: round(baseline),
      meanCurrentPercent: round(current),
      meanChangePercentagePoints: round(current - baseline),
    };
  });
  const enough = groups.every(
    (group) => group.accountCount >= minimumCohortSize,
  );
  return patternReportSchema.parse({
    status: enough ? "available" : "insufficient_evidence",
    metricId,
    definition: metricDefinition,
    quarter,
    minimumAccountsPerGroup: minimumCohortSize,
    groups: enough ? groups : [],
    interpretation:
      "Restricted internal observational report over explicitly contributed, currently authorized accounts only. Each account has equal weight; this is not pooled-user adoption, a representative customer benchmark, causal uplift or attributable revenue. No recorded intervention does not establish an untreated control. Missing and withdrawn contributions can bias results. Small groups are suppressed together. Repeated reports may permit inference; do not redistribute as anonymous data.",
  });
}
