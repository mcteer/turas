import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { supportEvaluationCases } from "../fixtures/support/evaluation";
import { verifySupportActualReview } from "../../scripts/support-review-contract";
import { verifySupportCapture } from "../../scripts/verify-support-review";
import { supportDigest } from "../../lib/server/support/commands";
import { mapSupportCapture } from "../../scripts/support-capture-mapping";

const hash = "a".repeat(64);
function evidence() {
  return { version: "support-review-v1", sourceDigest: hash, rootAgentDigest: hash, promptDigest: hash, cohortDigest: hash,
    model: "configured-model", actualConfiguredProvider: true, reviewer: "Synthetic contract test reviewer", reviewedAt: new Date().toISOString(),
    cases: supportEvaluationCases.map(item => ({ id: item.id, attemptId: randomUUID(), capturePath: `${item.id}.json`, captureDigest: hash,
      inputDigest: hash, outputDigest: item.id === "S08" ? null : hash, sourceMapDigest: hash,
      terminalState: item.id === "S08" ? "invalidated" : "completed", released: item.id !== "S08", initialDispatches: 1, automaticPaidRetries: 0,
      paidSteps: 1, inputTokens: 10, outputTokens: 10, costUsd: .001, latencyMs: 1000, providerMetadataComplete: true,
      domainUnchanged: true, staleSuggestionSaveDenied: item.id === "S08", review: item.review.map(criterion => ({ criterion, passed: true, rationale: "Synthetic structural-test rationale, not a live output review" })) })) };
}
describe("support actual-output review contract", () => {
  it("cannot map missing actual provider measurements into review evidence", () => {
    const raw = { caseId: "S02", sourceDigest: hash, rootAgentDigest: hash, model: "configured-model",
      latencyMs: 1000, domainUnchanged: true, staleSuggestionSaveDenied: false,
      evidence: { usageComplete: false, costUsd: null, inputTokens: null, outputTokens: null } };
    expect(() => mapSupportCapture(raw as Parameters<typeof mapSupportCapture>[0])).toThrow("Actual provider measurements incomplete");
  });
  it("accepts complete structural evidence but rejects fixture providers and selective cohorts", () => {
    expect(verifySupportActualReview(evidence()).cases).toHaveLength(8);
    const mock = evidence(); mock.actualConfiguredProvider = false;
    expect(() => verifySupportActualReview(mock)).toThrow();
    const partial = evidence(); partial.cases.pop();
    expect(() => verifySupportActualReview(partial)).toThrow();
  });
  it("rejects missing review criteria, paid retries and stale released output", () => {
    const missing = evidence(); missing.cases[0].review.pop();
    expect(() => verifySupportActualReview(missing)).toThrow();
    const retry = evidence(); retry.cases[0].automaticPaidRetries = 1;
    expect(() => verifySupportActualReview(retry)).toThrow();
    const stale = evidence(); stale.cases[7].released = true;
    expect(() => verifySupportActualReview(stale)).toThrow();
  });
  it("binds retained capture content and measured usage to the review", () => {
    const raw = evidence(), item = raw.cases[0];
    const input = { synthetic: true }, sourceMap: [] = [], output = { contractVersion: "support-advice-v1",
      summary: "Synthetic structural test only", facts: [], unknowns: ["Operating owner"], actionSuggestions: [] };
    item.inputDigest = supportDigest(input); item.sourceMapDigest = supportDigest(sourceMap); item.outputDigest = supportDigest(output);
    const review = verifySupportActualReview(raw);
    const capture = { version: "support-live-capture-v1", caseId: item.id, attemptId: item.attemptId,
      sourceDigest: hash, rootAgentDigest: hash, promptDigest: hash, cohortDigest: hash, model: raw.model,
      actualConfiguredProvider: true, input, sourceMap, output, terminalState: item.terminalState, released: true,
      initialDispatches: 1, automaticPaidRetries: 0, paidSteps: 1, inputTokens: 10, outputTokens: 10, costUsd: .001,
      latencyMs: 1000, providerMetadataComplete: true, domainUnchanged: true, staleSuggestionSaveDenied: false };
    expect(() => verifySupportCapture(capture, review, 0)).not.toThrow();
    expect(() => verifySupportCapture({ ...capture, output: { ...output, summary: "Tampered" } }, review, 0)).toThrow();
    expect(() => verifySupportCapture({ ...capture, paidSteps: 2 }, review, 0)).toThrow();
    expect(() => verifySupportCapture({ ...capture, actualConfiguredProvider: false }, review, 0)).toThrow();
  });
});
