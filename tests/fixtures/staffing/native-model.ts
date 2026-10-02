import { mockModel } from "eve/evals";
import { wrapLanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { query } from "../../../lib/server/db/client";
import { staffingSha256 } from "../../../lib/server/staffing/commands";
import { assertDeterministicTestMode } from "../runtime";

/** Only installed into an owned disposable app copy. Production agent.ts never
 * imports this module. The normal admission/filter/fence wrappers stay intact. */
export function createStaffingNativeFixtureModel(principal: unknown, identity: {
  nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  requireOwnedStaffingClone(); assertDeterministicTestMode();
  if (!principal || process.env.TURAS_ENVIRONMENT_ID !== process.env.TURAS_TEST_ENVIRONMENT_ID) throw new Error("Owned native fixture required");
  let abortSignal: AbortSignal | undefined;
  const model = mockModel({ provider: "turas-owned-native-fixture", modelId: "spacexai/grok-4.7", respond: async ({ tools, toolResults }) => {
    await query("UPDATE staffing_native_fixture_calls SET responded_at=clock_timestamp() WHERE response_attempt_id=$1 AND step_index=$2",
      [identity.responseAttemptId, identity.stepIndex]);
    const barrier = () => query(`SELECT b.released FROM staffing_native_fixture_barriers b JOIN staffing_advisory_attempts a ON a.id=b.advisory_attempt_id
      WHERE a.response_attempt_id=$1`, [identity.responseAttemptId]);
    const waiting = (await barrier()).rows[0];
    if (waiting && identity.stepIndex === 1) {
      const started = Date.now();
      for (;;) {
        abortSignal?.throwIfAborted();
        if (Date.now() - started > 60_000) throw new Error("Synthetic native barrier timed out");
        const row = (await barrier()).rows[0];
        if (row?.released) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      abortSignal?.throwIfAborted();
    }
    if (toolResults.some(result => result.isError)) throw new Error("Synthetic staffing read was denied");
    if (!tools.some(tool => tool.name === "read_staffing_demand")) throw new Error("Synthetic staffing demand tool absent");
    if (toolResults.some(result => result.name === "read_staffing_demand") && tools.some(tool => tool.name === "read_staffing_scenario") &&
      !toolResults.some(result => result.name === "read_staffing_scenario")) {
      return { toolCalls: [{ name: "read_staffing_scenario", input: {} }], usage: { inputTokens: 11, outputTokens: 7 } };
    }
    return toolResults.some(result => result.name === "read_staffing_demand")
      ? { text: "Synthetic governed staffing explanation. Missing information remains unknown; human review is required for staffing and finance decisions.",
        usage: { inputTokens: 11, outputTokens: 0 } }
      : { toolCalls: [{ name: "read_staffing_demand", input: {} }], usage: { inputTokens: 11, outputTokens: 7 } };
  } });
  if (typeof model === "string") throw new Error("Native fixture requires an authored model");
  return wrapLanguageModel({ model, middleware: { transformParams: async ({ params, type }) => {
    requireOwnedStaffingClone();
    await query(`INSERT INTO staffing_native_fixture_calls(id,response_attempt_id,step_index,provider_path,max_output_tokens,tools,prompt_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), identity.responseAttemptId, identity.stepIndex, type, params.maxOutputTokens,
      JSON.stringify(params.tools?.map(tool => tool.type === "function" ? tool.name : tool.type) ?? []), staffingSha256(params.prompt)]);
    abortSignal = params.abortSignal;
    return params;
  } } });
}
