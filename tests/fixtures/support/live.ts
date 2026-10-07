import { readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { query } from "../../../lib/server/db/client";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { assertDeterministicTestMode } from "../runtime";

export async function installSupportLiveObservation(environment: { appRoot: string }) {
  requireOwnedSupportClone();
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/010"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd())) throw new Error("Owned support app copy required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8");
  const mocked = source.includes("createSupportNativeFixtureModel");
  if (mocked) assertDeterministicTestMode();
  else if (process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY) throw new Error("Explicit live opt-in required");
  const base = mocked ? "createSupportNativeFixtureModel(principal, identity)" : "gateway(selectedModel)";
  const target = `wrapStaffingModel(${base}, admitted.mode`;
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "spacexai/grok-4.7";') || !source.includes('reasoning: "low"'))
    throw new Error("Support selected model shape changed");
  await query(`CREATE TABLE support_live_provider_observations(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES support_advice_attempts(id),
    response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_id uuid NOT NULL UNIQUE REFERENCES support_model_step_receipts(id),
    step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),provider_path text NOT NULL CHECK(provider_path IN('generate','stream')),
    max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),prompt_digest text NOT NULL,captured jsonb NOT NULL,io_started_at timestamptz,
    cost_usd numeric CHECK(cost_usd>=0), generation_id text, provider_finished_at timestamptz,
    UNIQUE(response_attempt_id,step_index));
    CREATE TABLE support_live_provider_barriers(attempt_id uuid PRIMARY KEY REFERENCES support_advice_attempts(id),released boolean NOT NULL DEFAULT false);
    GRANT SELECT,INSERT,UPDATE ON support_live_provider_observations,support_live_provider_barriers TO turas_runtime;`);
  await writeFile(path, 'import { observeSupportLiveProvider } from "../tests/fixtures/support/live-provider";\n' +
    source.replace(target, `wrapStaffingModel(observeSupportLiveProvider(${base}, principal, identity), admitted.mode`), { mode: 0o600 });
  const worker = join(root, "scripts/maintenance-worker.ts");
  await writeFile(worker, "delete process.env.AI_GATEWAY_API_KEY;\n" + await readFile(worker, "utf8"), { mode: 0o600 });
}
