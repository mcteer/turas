import { z } from "zod";
const accountIdSchema=z.uuid();

const text = z.string().trim().min(10).max(1200);
export const patternSchema = z.object({
  title: z.string().trim().min(5).max(160),
  problem: text,
  prerequisites: text,
  approach: text,
  delivery: text,
  processAndAdoption: text,
  limitations: text,
  alternatives: text,
  lessons: text,
  outcome: z.object({ basis: z.enum(["approved_design", "implemented", "measured"]), description: text, measurementLimits: text }).strict(),
  reviewAfter: z.iso.date(),
}).strict();
export type SolutionPattern = z.infer<typeof patternSchema>;
const command = {
  patternId: z.uuid(), expectedVersion: z.number().int().min(0), requestId: z.uuid(), rationale: text,
};
export const patternCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...command, action: z.literal("publish"), sourceRecordId: z.uuid(), pattern: patternSchema,
    attestation: z.object({ generalizedContentReviewed: z.literal(true), workspaceReuseApproved: z.literal(true), outcomeBasisVerified: z.literal(true) }).strict(),
  }).strict(),
  z.object({ ...command, action: z.literal("withdraw") }).strict(),
]);
export type PatternCommand = z.infer<typeof patternCommandSchema>;
export const patternReferenceSchema = z.object({ patternId: z.uuid(), version: z.number().int().positive() }).strict();
export const publishedPatternSchema = patternReferenceSchema.extend({ pattern: patternSchema });
export const fitDimensions = ["technology", "security", "delivery", "process", "adoption", "economics"] as const;
export const fitSchema = z.array(z.object({ dimension: z.enum(fitDimensions),
  status: z.enum(["compatible", "adaptation_required", "unknown", "incompatible"]), evidence: text, adaptation: text,
}).strict()).length(fitDimensions.length).refine(items => new Set(items.map(item => item.dimension)).size === fitDimensions.length,
  "Assess every fit dimension exactly once.");
export const applicationCommandSchema = z.object({
  applicationId: z.uuid(), requestId: z.uuid(), expectedVersion: z.number().int().min(0),
  action: z.enum(["approve", "withdraw"]), pattern: patternReferenceSchema,
  targetContextHash: z.string().regex(/^[a-f0-9]{64}$/), fit: fitSchema,
  validationPlan: text, rationale: text,
  targetApprovalConfirmed: z.literal(true),
}).strict();
export type ApplicationCommand = z.infer<typeof applicationCommandSchema>;
export const searchInputSchema = z.object({ accountId: accountIdSchema, query: z.string().trim().min(3).max(600) }).strict();
export function patternText(pattern: SolutionPattern) {
  return [pattern.title, pattern.problem, pattern.prerequisites, pattern.approach, pattern.delivery,
    pattern.processAndAdoption, pattern.limitations, pattern.alternatives, pattern.lessons,
    pattern.outcome.basis, pattern.outcome.description, pattern.outcome.measurementLimits].join("\n");
}
export function validatePublication(pattern: SolutionPattern, sourceName: string, now = Date.now()) {
  if (Date.parse(pattern.reviewAfter + "T00:00:00Z") <= now) throw new Error("The pattern review deadline must be in the future.");
  // Defense in depth only. Human review of the exact derivative is mandatory.
  const content = patternText(pattern);
  if (sourceName && content.toLowerCase().includes(sourceName.toLowerCase())) throw new Error("Remove the source customer name from the generalized pattern.");
  if (/https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:api[_ -]?key|password|secret)\s*[:=]\s*\S+/i.test(content))
    throw new Error("Remove URLs, email addresses and credential assignments from the generalized pattern.");
}
export function validateApplication(command: ApplicationCommand) {
  if (command.action === "approve" && command.fit.some(item => item.status === "unknown" || item.status === "incompatible"))
    throw new Error("Resolve unknown or incompatible prerequisites before approving a target adaptation.");
}
export const knowledgeInspectionSchema = z.object({
  targetContextHash: z.string(),
  contributions: z.array(z.object({ pattern_id: z.uuid(), version: z.number().int(), action: z.enum(["publish", "withdraw"]), source_record_id: z.uuid().nullable(), pattern: patternSchema.nullable() }).strict()),
  applications: z.array(z.object({ application_id: z.uuid(), version: z.number().int(), action: z.enum(["approve", "withdraw"]), pattern_id: z.uuid(), pattern_version: z.number().int(), context_hash: z.string(),
    assessment: z.object({ fit: fitSchema, validationPlan: text }).strict(), eligibility: z.enum(["withdrawn", "pattern_unavailable", "context_changed", "current"]) }).strict()),
}).strict();
