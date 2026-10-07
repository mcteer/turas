import { z } from "zod";
import { supportEvaluationCases, validateSupportEvaluationCohort } from "../tests/fixtures/support/evaluation";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reviewCriterion = z.object({ criterion: z.string().min(1).max(500), passed: z.boolean(),
  rationale: z.string().trim().min(1).max(2000) }).strict();
const capturedCase = z.object({ id: z.enum(["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"]),
  attemptId: z.string().uuid(), capturePath: z.string().min(1).max(500), captureDigest: digest,
  inputDigest: digest, outputDigest: digest.nullable(), sourceMapDigest: digest,
  terminalState: z.enum(["completed", "failed", "cancelled", "unconfirmed", "invalidated", "expired"]),
  released: z.boolean(), initialDispatches: z.literal(1), automaticPaidRetries: z.literal(0),
  paidSteps: z.number().int().min(0).max(6), inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().min(0).max(24576), costUsd: z.number().finite().nonnegative(),
  latencyMs: z.number().finite().nonnegative().max(120000),
  providerMetadataComplete: z.literal(true), domainUnchanged: z.literal(true),
  staleSuggestionSaveDenied: z.boolean(), review: z.array(reviewCriterion).min(3).max(10),
}).strict();

export const supportActualReviewSchema = z.object({ version: z.literal("support-review-v1"),
  sourceDigest: digest, rootAgentDigest: digest, promptDigest: digest, cohortDigest: digest,
  model: z.string().min(1).max(200), actualConfiguredProvider: z.literal(true),
  reviewer: z.string().trim().min(1).max(200), reviewedAt: z.string().datetime(),
  cases: z.array(capturedCase).length(8),
}).strict();

/** Structural evidence gate only; captures must also be hash-checked and read by
 * the reviewer. Never infer semantic fidelity from a schema-valid model output. */
export function verifySupportActualReview(raw: unknown) {
  const review = supportActualReviewSchema.parse(raw);
  validateSupportEvaluationCohort(review.cases.map(item => item.id));
  if (new Set(review.cases.map(item => item.attemptId)).size !== 8) throw new Error("Live cases must have distinct admitted attempts");
  for (const [index, captured] of review.cases.entries()) {
    const expected = supportEvaluationCases[index];
    if (captured.review.length !== expected.review.length || captured.review.some((item, i) => item.criterion !== expected.review[i]))
      throw new Error("Required semantic review criteria missing or reordered");
    if (captured.review.some(item => !item.passed)) throw new Error("Support actual-output review contains a failing criterion");
    if (expected.expectedRelease === "completed") {
      if (captured.terminalState !== "completed" || !captured.released || !captured.outputDigest || captured.paidSteps === 0)
        throw new Error("Required configured-provider output missing");
    } else if (captured.released || captured.outputDigest || !captured.staleSuggestionSaveDenied || captured.terminalState === "completed") {
      throw new Error("Material-change case did not prove withholding and stale-save denial");
    }
  }
  return review;
}
