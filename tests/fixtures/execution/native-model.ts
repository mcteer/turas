import { mockModel } from "eve/evals";
import { wrapLanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { query } from "../../../lib/server/db/client";
import { executionDigest } from "../../../lib/server/execution/commands";
import { assertDeterministicTestMode } from "../runtime";
export function assertExecutionNativeFixture() {
  assertDeterministicTestMode();
  if (process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY !== "1" || !process.env.TURAS_ENVIRONMENT_ID?.startsWith("test-") ||
    process.env.TURAS_ENVIRONMENT_ID !== process.env.TURAS_TEST_ENVIRONMENT_ID ||
    !/^\/turas_test_008_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname) ||
    new URL(process.env.DATABASE_URL!).pathname !== new URL(process.env.TURAS_TEST_DATABASE_URL!).pathname)
    throw new Error("Owned execution native fixture required");
}
export function createExecutionNativeFixtureModel(principal: unknown, identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  assertExecutionNativeFixture(); if (!principal) throw new Error("Owned native principal required");
  let abortSignal: AbortSignal | undefined;
  const model = mockModel({ provider: "turas-owned-execution-fixture", modelId: "spacexai/grok-4.7", respond: async ({ tools, toolResults }) => {
    const row = (await query(`SELECT b.scenario,b.released FROM execution_native_fixture_barriers b JOIN execution_advice_attempts a ON a.id=b.advice_attempt_id
      WHERE a.response_attempt_id=$1`, [identity.responseAttemptId])).rows[0];
    if (!row) throw new Error("Missing owned native case");
    await query("UPDATE execution_native_fixture_calls SET responded_at=clock_timestamp() WHERE response_attempt_id=$1 AND step_index=$2", [identity.responseAttemptId, identity.stepIndex]);
    if (["barrier", "unknown"].includes(row.scenario) && identity.stepIndex === 0) {
      const started = Date.now();
      for (;;) {
        abortSignal?.throwIfAborted(); if (Date.now() - started > 90000) throw new Error("Owned native barrier deadline");
        const current = (await query(`SELECT b.released FROM execution_native_fixture_barriers b JOIN execution_advice_attempts a ON a.id=b.advice_attempt_id WHERE a.response_attempt_id=$1`, [identity.responseAttemptId])).rows[0];
        if (current?.released) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    abortSignal?.throwIfAborted();
    if (toolResults.some(r => r.isError)) throw new Error("Synthetic execution read was denied");
    if (tools.map(t => t.name).sort().join(",") !== ["execution_effort", "execution_records", "execution_summary", "load_skill"].join(",")) throw new Error("Execution native catalog mismatch");
    if (identity.stepIndex === 0) return { toolCalls: row.scenario === "limits"
      ? Array.from({ length: 7 }, () => ({ name: "load_skill", input: { skill: "execution-explanation" } }))
      : [{ name: "load_skill", input: { skill: "execution-explanation" } }, { name: "execution_summary", input: {} }, { name: "execution_records", input: { limit: 20 } }, { name: "execution_effort", input: {} }],
      usage: { inputTokens: 11, outputTokens: 7 } };
    return { text: "Synthetic reviewed execution explanation. Reviewed effort does not prove completion; missing inputs remain unknown and human review is required.", usage: { inputTokens: 11, outputTokens: 7 } };
  } });
  if (typeof model === "string") throw new Error("Fixture model unavailable");
  return wrapLanguageModel({ model, middleware: { transformParams: async ({ params, type }) => {
    assertExecutionNativeFixture();
    const deadline = (await query("SELECT EXTRACT(EPOCH FROM(deadline_at-clock_timestamp()))*1000 AS ms FROM execution_advice_attempts WHERE response_attempt_id=$1", [identity.responseAttemptId])).rows[0];
    await query(`INSERT INTO execution_native_fixture_calls(id,response_attempt_id,step_index,provider_path,max_output_tokens,tools,prompt_digest,deadline_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), identity.responseAttemptId, identity.stepIndex, type, params.maxOutputTokens,
      JSON.stringify(params.tools?.map(t => t.type === "function" ? t.name : t.type) ?? []), executionDigest(params.prompt), Number(deadline?.ms)]);
    abortSignal = params.abortSignal; return params;
  } } });
}
