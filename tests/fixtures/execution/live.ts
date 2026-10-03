import {readFile,writeFile,realpath} from "node:fs/promises";
import {resolve,join} from "node:path";
import {assertDeterministicTestMode} from "../runtime";
import {query} from "../../../lib/server/db/client";
import {requireOwnedExecutionClone,type ExecutionEvalEnvironment} from "../../../scripts/execution-eval-environment";
export async function installExecutionLiveObservation(environment:ExecutionEvalEnvironment){
  requireOwnedExecutionClone();
  const root=await realpath(environment.appRoot),owned=await realpath(resolve("local-artifacts/008"));
  if(!root.startsWith(owned+"/eval-")||!root.endsWith("/app")||root===await realpath(process.cwd()))throw new Error("Owned execution app copy required");
  const path=join(root,"agent/agent.ts"),source=await readFile(path,"utf8"),mocked=source.includes("createExecutionNativeFixtureModel");
  if(mocked)assertDeterministicTestMode();else if(process.env.TURAS_ALLOW_LIVE_MODEL_TESTS!=="1"||!process.env.AI_GATEWAY_API_KEY)throw new Error("Explicit live model evaluation required");
  const base=mocked?"createExecutionNativeFixtureModel(principal, identity)":"gateway(selectedModel)",target=`wrapStaffingModel(${base}, admitted.mode`;
  if(source.split(target).length!==2||!source.includes('const selectedModel = "spacexai/grok-4.7";')||!source.includes('reasoning: "low"'))throw new Error("Selected model shape changed");
  await query(`CREATE TABLE execution_live_provider_observations(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
    response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_id uuid NOT NULL UNIQUE REFERENCES execution_advice_steps(id),
    step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 5),provider_path text NOT NULL CHECK(provider_path IN('generate','stream')),
    max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),deadline_ms numeric NOT NULL CHECK(deadline_ms>0 AND deadline_ms<=120000),
    prompt_digest text NOT NULL,captured jsonb NOT NULL,io_started_at timestamptz,UNIQUE(response_attempt_id,step_index));
    CREATE TABLE execution_live_provider_barriers(attempt_id uuid PRIMARY KEY REFERENCES execution_advice_attempts(id),released boolean NOT NULL DEFAULT false);
    GRANT SELECT,INSERT,UPDATE ON execution_live_provider_observations,execution_live_provider_barriers TO turas_runtime;`);
  await writeFile(path,'import {observeExecutionLiveProvider} from "../tests/fixtures/execution/live-provider";\n'+source.replace(target,`wrapStaffingModel(observeExecutionLiveProvider(${base}, principal, identity), admitted.mode`),{mode:0o600});
  const worker=join(root,"scripts/maintenance-worker.ts");
  await writeFile(worker,"delete process.env.AI_GATEWAY_API_KEY;\n"+await readFile(worker,"utf8"),{mode:0o600});
}
