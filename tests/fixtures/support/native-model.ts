import { mockModel } from "eve/evals";
import { wrapLanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { query } from "../../../lib/server/db/client";
import { supportDigest } from "../../../lib/server/support/commands";
import { assertDeterministicTestMode } from "../runtime";

function requireFixture() {
  assertDeterministicTestMode();
  const raw = process.env.DATABASE_URL;
  if (process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY !== "1" || !raw ||
    !process.env.TURAS_ENVIRONMENT_ID?.startsWith("test-") ||
    process.env.TURAS_ENVIRONMENT_ID !== process.env.TURAS_TEST_ENVIRONMENT_ID ||
    !/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(raw).pathname) ||
    new URL(raw).pathname !== new URL(process.env.TURAS_TEST_DATABASE_URL ?? "http://invalid").pathname)
    throw new Error("Owned support native fixture required");
}

export function createSupportNativeFixtureModel(principal: unknown,
  identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  requireFixture();
  if (!principal) throw new Error("Owned native principal required");
  let abortSignal: AbortSignal | undefined;
  const model = mockModel({ provider: "turas-owned-support-fixture", modelId: "spacexai/grok-4.7",
    respond: async ({ tools, toolResults }) => {
      const expected = ["load_skill", "support_actions", "support_evidence", "support_summary"];
      if (tools.map(tool => tool.name).sort().join(",") !== expected.join(",")) throw new Error("Support native catalog mismatch");
      if (toolResults.some(result => result.isError)) throw new Error("Synthetic support read denied");
      const barrier = async () => (await query(`SELECT b.released FROM support_native_fixture_barriers b
        JOIN conversations c ON c.customer_id=b.customer_id JOIN response_attempts a ON a.conversation_id=c.id
        WHERE a.id=$1`, [identity.responseAttemptId])).rows[0];
      const deadline = Date.now() + 90000;
      while ((await barrier())?.released === false) {
        abortSignal?.throwIfAborted();
        if (Date.now() >= deadline) throw new Error("Owned support barrier deadline");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      abortSignal?.throwIfAborted();
      if (identity.stepIndex === 0) return { toolCalls: [{ name: "support_summary", input: {} }], usage: { inputTokens: 11, outputTokens: 7 } };
      const observationDate = new Date().toISOString().slice(0, 10);
      const nextReviewDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      return { text: JSON.stringify({ contractVersion: "support-advice-v1", summary: "Operating evidence is unknown; verify it with a human owner.",
        facts: [], unknowns: ["Operating owner", "Readiness evidence"], actionSuggestions: [{ citationKeys: [], content: {
          contractVersion: "support-v1", title: "Verify synthetic operating ownership", observationDate, nextReviewDate, timezone: "UTC",
          desiredOutcome: "Confirm the accountable operating role", rationale: "Operating evidence remains unknown",
          validationCriterion: "Human reviews an accepted stakeholder record", priority: "normal",
          owner: { kind: "unassigned", reason: "Confirm operating ownership" }, disposition: "open", outcomeSourceKeys: [],
        } }] }), usage: { inputTokens: 11, outputTokens: 7 } };
    } });
  if (typeof model === "string") throw new Error("Fixture model unavailable");
  return wrapLanguageModel({ model, middleware: { transformParams: async ({ params, type }) => {
    requireFixture();
    abortSignal = params.abortSignal;
    await query(`INSERT INTO support_native_fixture_calls(id,response_attempt_id,step_index,provider_path,max_output_tokens,tools,prompt_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), identity.responseAttemptId, identity.stepIndex, type,
      params.maxOutputTokens, JSON.stringify(params.tools?.map(tool => tool.type === "function" ? tool.name : tool.type) ?? []), supportDigest(params.prompt)]);
    return params;
  } } });
}
