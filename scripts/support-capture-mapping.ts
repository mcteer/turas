import { supportDigest } from "../lib/server/support/commands";
import { supportAdvicePrompt } from "../lib/support/advice";
import { supportEvaluationCases } from "../tests/fixtures/support/evaluation";
import { supportArtifactDigest } from "./verify-support-review";
import type { readSupportLiveEvidence } from "./support-live-evidence";

/** No defaults for missing provider measurements. Incomplete captures remain raw
 * failure evidence and cannot be turned into passing review candidates. */
export function mapSupportCapture(input: { caseId: string; sourceDigest: string; rootAgentDigest: string; model: string;
  latencyMs: number; domainUnchanged: boolean; staleSuggestionSaveDenied: boolean;
  evidence: Awaited<ReturnType<typeof readSupportLiveEvidence>> }) {
  const { evidence } = input;
  if (!evidence.usageComplete || evidence.costUsd === null || evidence.inputTokens === null || evidence.outputTokens === null)
    throw new Error("Actual provider measurements incomplete");
  const context = evidence.payloads.find(item => item.kind === "context"), sources = evidence.payloads.find(item => item.kind === "source_map");
  if (!context || !sources) throw new Error("Retained input/source map unavailable");
  const released = evidence.attempt.state === "completed";
  const output = evidence.payloads.find(item => item.kind === "output");
  if (released && !output) throw new Error("Completed output unavailable");
  return { version: "support-live-capture-v1", caseId: input.caseId, attemptId: evidence.attempt.id,
    sourceDigest: input.sourceDigest, rootAgentDigest: input.rootAgentDigest, model: input.model,
    promptDigest: supportArtifactDigest(supportAdvicePrompt), cohortDigest: supportDigest(supportEvaluationCases),
    actualConfiguredProvider: true, input: context.payload, sourceMap: sources.payload,
    output: released ? output!.payload : null, terminalState: evidence.attempt.state, released,
    initialDispatches: 1, automaticPaidRetries: 0, paidSteps: evidence.steps.length,
    inputTokens: evidence.inputTokens, outputTokens: evidence.outputTokens, costUsd: evidence.costUsd,
    latencyMs: input.latencyMs, providerMetadataComplete: true, domainUnchanged: input.domainUnchanged,
    staleSuggestionSaveDenied: input.staleSuggestionSaveDenied };
}
