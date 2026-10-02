import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { requireOwnedStaffingClone, type StaffingEvalEnvironment } from "../../../scripts/staffing-eval-environment";
import { query } from "../../../lib/server/db/client";

/** Install observation into the disposable app copy only. The selected gateway
 * model, low reasoning and all production admission/filter/fence wrappers remain. */
export async function installStaffingLiveObservation(environment: StaffingEvalEnvironment) {
  requireOwnedStaffingClone();
  if (process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY) throw new Error("Owned live evaluation required");
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/007"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd()) ||
    new URL(process.env.DATABASE_URL!).pathname !== `/${environment.databaseName}`) throw new Error("Owned live app required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8");
  const target = "wrapStaffingModel(gateway(selectedModel), admitted.mode";
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "spacexai/grok-4.7";') ||
    !source.includes('reasoning: "low"') || source.includes("createStaffingNativeFixtureModel")) throw new Error("Live model observation shape changed");
  await query(`CREATE TABLE staffing_live_provider_observations(id uuid PRIMARY KEY,
    attempt_id uuid NOT NULL REFERENCES staffing_advisory_attempts(id),response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),
    step_receipt_id uuid NOT NULL UNIQUE REFERENCES staffing_model_step_receipts(id),turn_id text NOT NULL,
    step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),provider_path text NOT NULL CHECK(provider_path IN ('generate','stream')),
    max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),content_digest text NOT NULL,
    captured jsonb NOT NULL CHECK(octet_length(captured::text)<=262144),observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(response_attempt_id,step_index));
    CREATE TABLE staffing_live_provider_barriers(attempt_id uuid PRIMARY KEY REFERENCES staffing_advisory_attempts(id),
      step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),released boolean NOT NULL DEFAULT false)`);
  await writeFile(path, 'import { observeStaffingLiveProvider } from "../tests/fixtures/staffing/live-provider";\n' +
    source.replace(target, "wrapStaffingModel(observeStaffingLiveProvider(gateway(selectedModel), principal, identity), admitted.mode"), { mode: 0o600 });
  // The live case's paid allowance covers its explicit staffing turn. Keep
  // cleanup/watchdog/workforce maintenance real, but prevent queued lexical
  // fixture projections from starting unrelated paid background embeddings.
  // Only this disposable maintenance process loses its gateway key; the real
  // eve model process retains the selected gateway and its original settings.
  const workerPath = join(root, "scripts/maintenance-worker.ts");
  const worker = await readFile(workerPath, "utf8");
  if (worker.includes("delete process.env.AI_GATEWAY_API_KEY")) throw new Error("Owned live worker observation already installed");
  await writeFile(workerPath, "delete process.env.AI_GATEWAY_API_KEY;\n" + worker, { mode: 0o600 });
}
