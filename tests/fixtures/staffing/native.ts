import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { StaffingEvalEnvironment } from "../../../scripts/staffing-eval-environment";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { query } from "../../../lib/server/db/client";

export async function installStaffingNativeFixture(environment: StaffingEvalEnvironment) {
  requireOwnedStaffingClone();
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/007"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd()) ||
    new URL(process.env.DATABASE_URL!).pathname !== `/${environment.databaseName}`) throw new Error("Owned app fixture required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8");
  const target = "wrapStaffingModel(parityBudgetModel(gateway(selectedModel),selectedModel), admitted.mode";
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "anthropic/claude-sonnet-5.5";') || !source.includes('reasoning: "low"')) throw new Error("Native fixture model shape changed");
 if(!source.includes('beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),'))throw Error('Fixture model metadata changed');
  const fixture = source.replace(target, "wrapStaffingModel(createStaffingNativeFixtureModel(principal, identity), admitted.mode")
    .replace("return selectTurasGatewayModel(deferModelAdmission(", "return { ...selectTurasGatewayModel(deferModelAdmission(")
    .replace("        }));", "        })), modelContextWindowTokens: 128_000 };");
  if (!fixture.includes("modelContextWindowTokens: 128_000")) throw new Error("Native fixture metadata shape changed");
  await writeFile(path, 'import { createStaffingNativeFixtureModel } from "../tests/fixtures/staffing/native-model";\n' + fixture, { mode: 0o600 });
  await query(`CREATE TABLE staffing_native_fixture_calls(id uuid PRIMARY KEY,response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),
    step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),provider_path text NOT NULL CHECK(provider_path IN ('generate','stream')),
    max_output_tokens integer NOT NULL,tools jsonb NOT NULL,prompt_digest text NOT NULL,responded_at timestamptz,UNIQUE(response_attempt_id,step_index));
    CREATE TABLE staffing_native_fixture_barriers(advisory_attempt_id uuid PRIMARY KEY REFERENCES staffing_advisory_attempts(id),released boolean NOT NULL DEFAULT false)`);
}
