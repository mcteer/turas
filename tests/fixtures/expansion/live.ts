import { readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { query } from "../../../lib/server/db/client";
import { requireOwnedExpansionClone } from "../../../scripts/expansion-eval-environment";
import {expansionLiveBudgetSchema} from "../../../scripts/expansion-live-budget";
import { assertDeterministicTestMode } from "../runtime";

export async function installExpansionLiveObservation(environment: { appRoot: string }) {
  requireOwnedExpansionClone();
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/011"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd())) throw new Error("Owned expansion app copy required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8");
  const mocked = source.includes("createExpansionNativeFixtureModel");
  if (mocked) assertDeterministicTestMode();
  else if (process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY) throw new Error("Explicit live opt-in required");
  expansionLiveBudgetSchema.parse(Number(process.env.TURAS_EXPANSION_LIVE_BUDGET_USD));
  const base = mocked ? "createExpansionNativeFixtureModel(principal, identity)" : "gateway(selectedModel)";
  const target = `wrapStaffingModel(${base}, admitted.mode`;
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "spacexai/grok-4.7";') || !source.includes('reasoning: "low"'))
    throw new Error("Expansion selected model shape changed");
  await query(`CREATE TABLE expansion_live_provider_observations(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id),
    response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_id uuid NOT NULL UNIQUE REFERENCES expansion_model_step_receipts(id),
    step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),provider_path text NOT NULL CHECK(provider_path IN('generate','stream')),
    max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),prompt_digest text NOT NULL,captured jsonb NOT NULL,io_started_at timestamptz,
    cost_usd numeric CHECK(cost_usd>=0), generation_id text, provider_finished_at timestamptz,
    output_text text CHECK(octet_length(output_text)<=131072), output_digest text,
    finish_reason text CHECK(finish_reason IN('stop','length','tool-calls','content-filter','error','other','unknown')),
    UNIQUE(response_attempt_id,step_index));
    CREATE TABLE expansion_live_provider_barriers(attempt_id uuid PRIMARY KEY REFERENCES expansion_advice_attempts(id),released boolean NOT NULL DEFAULT false);
    GRANT SELECT,INSERT,UPDATE ON expansion_live_provider_observations,expansion_live_provider_barriers TO turas_runtime;`);
  await writeFile(path, 'import { observeExpansionLiveProvider } from "../tests/fixtures/expansion/live-provider";\n' +
    source.replace(target, `wrapStaffingModel(observeExpansionLiveProvider(${base}, principal, identity), admitted.mode`), { mode: 0o600 });
  const worker = join(root, "scripts/maintenance-worker.ts");
  await writeFile(worker, "delete process.env.AI_GATEWAY_API_KEY;\n" + await readFile(worker, "utf8"), { mode: 0o600 });
}
