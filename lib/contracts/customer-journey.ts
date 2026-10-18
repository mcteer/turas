import { z } from "zod";

export const accountIdSchema = z.uuid();
export const stages = [
  "Discover",
  "Align",
  "Build",
  "Prove",
  "Adopt",
  "Expand",
  "Renew",
] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();
export const impactSchema = z
  .object({
    metric: text(120),
    unit: text(40),
    baseline: z.number().finite().min(-1e15).max(1e15),
    current: z.number().finite().min(-1e15).max(1e15),
    target: z.number().finite().min(-1e15).max(1e15).nullable(),
    direction: z.enum(["increase", "decrease"]),
    periodStart: date,
    periodEnd: date,
    basis: z.enum(["measured", "customer_reported", "estimated"]),
    attribution: text(1000),
  })
  .strict()
  .refine(
    (value) => value.periodEnd >= value.periodStart,
    "Measurement end must follow its start.",
  );
export const contextSchema = z
  .object({
    title: text(160),
    summary: text(4000),
    scope: text(200),
    kind: z.enum(["note", "milestone", "risk", "decision", "outcome"]),
    stage: z.enum(stages).nullable(),
    observedAt: date,
    reviewAfter: date,
    confidence: z.enum(["low", "medium", "high"]),
    source: z
      .object({
        kind: z.enum(["note", "document", "conversation", "image", "attachment"]),
        reference: text(500),
        url: z.union([
          z.literal(""),
          z
            .url()
            .max(2000)
            .refine(
              (v) =>
                new URL(v).protocol === "https:" &&
                !new URL(v).username &&
                !new URL(v).password,
              "Use an HTTPS source URL.",
            ),
        ]),
        excerpt: text(12000),
      })
      .strict(),
    impact: impactSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.observedAt > new Date().toISOString().slice(0, 10))
      ctx.addIssue({
        code: "custom",
        path: ["observedAt"],
        message: "Observed date cannot be in the future.",
      });
    if (value.reviewAfter < value.observedAt)
      ctx.addIssue({
        code: "custom",
        path: ["reviewAfter"],
        message: "Review date must follow the observation.",
      });
    if (value.impact && value.impact.periodEnd > value.observedAt)
      ctx.addIssue({
        code: "custom",
        path: ["impact"],
        message: "Measurement window must end by the observation date.",
      });
  });
export const recordSchema = z.object({
  id: z.string().uuid(),
  rootId: z.string().uuid(),
  revision: z.number().int().positive(),
  state: z.enum(["draft", "approved", "retracted"]),
  context: contextSchema,
  recordedAt: z.string(),
  actor: z.string(),
  rationale: z.string(),
  indexState: z.enum(["pending", "synced", "failed", "processing"]),
  attempts: z.number().int(),
});
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      requestId: z.string().uuid(),
      context: contextSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("revise"),
      requestId: z.string().uuid(),
      rootId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      context: contextSchema,
      rationale: text(1000),
    })
    .strict(),
  z
    .object({
      action: z.enum(["approve", "retract", "resubmit"]),
      requestId: z.string().uuid(),
      rootId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      rationale: text(1000),
    })
    .strict(),
]);
export type CustomerContext = z.infer<typeof contextSchema>;
export type JourneyRecord = z.infer<typeof recordSchema>;
export type JourneyCommand = z.infer<typeof commandSchema>;
export function impactDelta(impact: NonNullable<CustomerContext["impact"]>) {
  const absolute = impact.current - impact.baseline;
  return {
    absolute,
    percent:
      impact.baseline === 0 ||
      !Number.isFinite((absolute / Math.abs(impact.baseline)) * 100)
        ? null
        : (absolute / Math.abs(impact.baseline)) * 100,
    improving: impact.direction === "increase" ? absolute > 0 : absolute < 0,
    targetReached:
      impact.target === null
        ? null
        : impact.direction === "increase"
          ? impact.current >= impact.target
          : impact.current <= impact.target,
  };
}
export function latestRecords(records: JourneyRecord[]) {
  const latest = new Map<string, JourneyRecord>();
  for (const record of records)
    if ((latest.get(record.rootId)?.revision ?? 0) < record.revision)
      latest.set(record.rootId, record);
  return [...latest.values()].sort(
    (a, b) =>
      b.context.observedAt.localeCompare(a.context.observedAt) ||
      b.recordedAt.localeCompare(a.recordedAt),
  );
}
