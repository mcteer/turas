import { reconProvenanceSchema } from "./receipt";
import { evidenceFreshnessSchema } from "./freshness";
import { z } from "zod";
import { researchBriefSchema, customerContextSchema, sourceSchema } from "./schema";
import { judgmentsSchema } from "./decision-workflow";
import { processImpactEstimateSchema } from "./process-impact";
import { customerResearchCitationSchema } from "./citations";

export const decisionOutputSchema = z.object({
  status: z.enum(["evaluated", "denied", "stale", "unavailable"]),
  // Historical model identifiers remain accepted for tool-contract compatibility.
  model: z.enum(["typesafe-ai/jev", "openai/gpt-5.6-luna-fast"]),
  rubricVersion: z.union([z.literal(1), z.literal(2)]),
  judgments: judgmentsSchema.optional(),
  reviewRequired: z.boolean().optional(),
  uncertain: z.array(z.string()).optional(),
  processImpactEstimates: z.array(processImpactEstimateSchema).optional(),
  customerEvidenceCitations: z.array(customerResearchCitationSchema).optional(),
  telemetry: z.object({
    generationId: z.string().nullable(), stateHash: z.string(), durationMs: z.number(),
    costUsd: z.number().nullable(), marketCostUsd: z.number().nullable(),
    inputTokens: z.number().nullable(), outputTokens: z.number().nullable(),
    nativeConfidence: z.record(z.string(), z.number()).nullable(),
  }).optional(),
  recommendedAction: z
    .enum(["bounded_pilot", "research_more", "rework", "defer"])
    .nullable(),
  modelChoice: z
    .enum(["bounded_pilot", "research_more", "rework", "defer"])
    .nullable(),
  adoptionDifficulty: z.number().min(0).max(2).nullable(),
  customerFitProbability: z.number().min(0).max(1).nullable(),
  blockers: z.array(z.string()),
  reason: z.string(),
  research: z.object({
    context: customerContextSchema,
    brief: researchBriefSchema,
    sources: z.array(sourceSchema).max(20),
    customerRecon: reconProvenanceSchema.optional(),
    freshness: z.array(evidenceFreshnessSchema).max(60).optional(),
  }).optional(),
});
export function gatedAction(
  choice: "bounded_pilot" | "research_more" | "rework" | "defer",
  blockers: string[],
) {
  return blockers.length && choice === "bounded_pilot"
    ? ("research_more" as const)
    : choice;
}
