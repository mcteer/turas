import { readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { query } from "../../../lib/server/db/client";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { assertDeterministicTestMode } from "../runtime";

/** Replace the provider only in the owned app copy, not the authored root agent. */
export async function installSupportNativeFixture(environment: { appRoot: string }) {
  requireOwnedSupportClone();
  assertDeterministicTestMode();
  const root = await realpath(environment.appRoot), owned = await realpath(resolve("local-artifacts/010"));
  if (!root.startsWith(`${owned}/eval-`) || !root.endsWith("/app") || root === await realpath(process.cwd()))
    throw new Error("Owned support native app copy required");
  const path = join(root, "agent/agent.ts"), source = await readFile(path, "utf8");
  const target = "wrapStaffingModel(gateway(selectedModel), admitted.mode";
  if (source.split(target).length !== 2 || !source.includes('const selectedModel = "spacexai/grok-4.7";') || !source.includes('reasoning: "low"'))
    throw new Error("Fixture model shape changed");
  const replacement = source.replace(target, "wrapStaffingModel(createSupportNativeFixtureModel(principal, identity), admitted.mode")
    .replace("return wrapStaffingModel(createSupportNativeFixtureModel(principal, identity), admitted.mode, {", "return { model: wrapStaffingModel(createSupportNativeFixtureModel(principal, identity), admitted.mode, {")
    .replace("beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        });", "beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        }), modelContextWindowTokens: 128_000 };");
  if (!replacement.includes("modelContextWindowTokens: 128_000")) throw new Error("Fixture model metadata changed");
  await writeFile(path, 'import { createSupportNativeFixtureModel } from "../tests/fixtures/support/native-model";\n' + replacement, { mode: 0o600 });
  await query(`CREATE TABLE support_native_fixture_calls(id uuid PRIMARY KEY,
    response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_index integer NOT NULL,
    provider_path text NOT NULL,max_output_tokens integer NOT NULL,tools jsonb NOT NULL,prompt_digest text NOT NULL,
    UNIQUE(response_attempt_id,step_index));
    GRANT SELECT,INSERT ON support_native_fixture_calls TO turas_runtime;`);
  await query(`CREATE TABLE support_native_fixture_barriers(customer_id uuid PRIMARY KEY REFERENCES customer_references(id),released boolean NOT NULL DEFAULT false);
    GRANT SELECT ON support_native_fixture_barriers TO turas_runtime;`);
}
