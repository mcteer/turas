import {discoveryHypothesis} from "./index";
import {z} from "zod";
import {expansionAdviceResultSchema} from "../../../lib/expansion/advice";
import { mockModel } from "eve/evals";
import { wrapLanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { query } from "../../../lib/server/db/client";
import { expansionHash } from "../../../lib/server/expansion/commands";
import { assertDeterministicTestMode } from "../runtime";

function requireFixture() {
  assertDeterministicTestMode();
  const raw = process.env.DATABASE_URL;
  if (process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY !== "1" || !raw ||
    !process.env.TURAS_ENVIRONMENT_ID?.startsWith("test-") ||
    process.env.TURAS_ENVIRONMENT_ID !== process.env.TURAS_TEST_ENVIRONMENT_ID ||
    !/^\/turas_test_011_eval_[a-f0-9]{12}$/.test(new URL(raw).pathname) ||
    new URL(raw).pathname !== new URL(process.env.TURAS_TEST_DATABASE_URL ?? "http://invalid").pathname)
    throw new Error("Owned expansion native fixture required");
}

export function createExpansionNativeFixtureModel(principal: unknown,
  identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  requireFixture();
  if (!principal) throw new Error("Owned native principal required");
  let abortSignal: AbortSignal | undefined;
  const model = mockModel({ provider: "turas-owned-expansion-fixture", modelId: "spacexai/grok-4.7",
    respond: async ({ tools, toolResults }) => {
      const expected = ["load_skill", "expansion_hypotheses", "expansion_evidence", "expansion_summary"];
      if (tools.map(tool => tool.name).sort().join(",") !== expected.sort().join(",")) throw new Error("Expansion native catalog mismatch");
      if (toolResults.some(result => result.isError)) throw new Error("Synthetic expansion read denied");
      const barrier = async () => (await query(`SELECT b.released FROM expansion_native_fixture_barriers b
        JOIN conversations c ON c.customer_id=b.customer_id JOIN response_attempts a ON a.conversation_id=c.id
        WHERE a.id=$1`, [identity.responseAttemptId])).rows[0];
      const deadline = Date.now() + 90000;
      while ((await barrier())?.released === false) {
        abortSignal?.throwIfAborted();
        if (Date.now() >= deadline) throw new Error("Owned expansion barrier deadline");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      abortSignal?.throwIfAborted();
      if (identity.stepIndex === 0) return { toolCalls: [{ name: "expansion_summary", input: {} }], usage: { inputTokens: 11, outputTokens: 7 } };
      const mode=(await query(`SELECT m.mode FROM expansion_native_fixture_modes m JOIN conversations c ON c.customer_id=m.customer_id JOIN response_attempts r ON r.conversation_id=c.id WHERE r.id=$1`,[identity.responseAttemptId])).rows[0]?.mode;
      if(mode==='malformed')return {text:JSON.stringify({contractVersion:'expansion-advice-v1',summary:'Incomplete synthetic result'}),usage:{inputTokens:11,outputTokens:7}};
      return {text:JSON.stringify({contractVersion:'expansion-advice-v1',summary:'The selected evidence does not establish a customer need. Validate it with an operating owner.',
        facts:[],unknowns:[{text:'Operating owner',reason:'No reviewed owner observation selected'},{text:'Current use and measurable benefit',reason:'Not established by selected evidence'}],
        discoverySteps:[{action:'Ask the operating owner about the need',validationCriterion:'Record a reviewed operating need'}],
        proposals:mode==='zero'?[]:[{citationKeys:[],relatedHypothesisIds:[],content:discoveryHypothesis()}]}),usage:{inputTokens:11,outputTokens:7}};
    } });
  if (typeof model === "string") throw new Error("Fixture model unavailable");
  return wrapLanguageModel({ model, middleware: { transformParams: async ({ params, type }) => {
    requireFixture();
    abortSignal = params.abortSignal;
    if(expansionHash(params.responseFormat)!==expansionHash({type:'json',name:'expansion_advice_v1',schema:z.toJSONSchema(expansionAdviceResultSchema)}))throw new Error('Expansion native response schema mismatch');
    if(Buffer.byteLength(JSON.stringify(params.prompt),'utf8')>24576)throw new Error('Expansion native prompt budget mismatch');
    await query(`INSERT INTO expansion_native_fixture_calls(id,response_attempt_id,step_index,provider_path,max_output_tokens,tools,prompt_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), identity.responseAttemptId, identity.stepIndex, type,
      params.maxOutputTokens, JSON.stringify(params.tools?.map(tool => tool.type === "function" ? tool.name : tool.type) ?? []), expansionHash(params.prompt)]);
    return params;
  } } });
}
