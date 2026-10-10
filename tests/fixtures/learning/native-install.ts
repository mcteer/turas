import {readFile,realpath,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {requireOwnedLearningDatabase} from '../../../scripts/learning-environment';
import {withLearningDatabase} from './environment';
/** Replace only the provider in the disposable owned copy. Root model bytes stay unchanged. */
export async function installLearningNativeFixture(environment:{appRoot:string}){
 requireOwnedLearningDatabase(process.env,true);
 const root=await realpath(environment.appRoot),owned=await realpath(resolve('local-artifacts/014'));
 if(!root.startsWith(`${owned}/owned-`)||!root.endsWith('/app')||root===await realpath(process.cwd()))throw Error('Owned learning app copy required');
 const path=join(root,'agent/agent.ts'),source=await readFile(path,'utf8'),target='wrapStaffingModel(gateway(selectedModel), admitted.mode';
 if(source.split(target).length!==2||!source.includes('const selectedModel = "spacexai/grok-4.7";')||!source.includes('reasoning: "low"'))throw Error('Learning fixture model shape changed');
 const replaced=source.replace(target,'wrapStaffingModel(createLearningNativeFixtureModel(principal, identity), admitted.mode').replace('return wrapStaffingModel(createLearningNativeFixtureModel(principal, identity), admitted.mode, {','return {model: wrapStaffingModel(createLearningNativeFixtureModel(principal, identity), admitted.mode, {').replace('beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        });','beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),\n        }), modelContextWindowTokens:128_000};');
 if(!replaced.includes('modelContextWindowTokens:128_000'))throw Error('Owned learning model metadata changed');
 await writeFile(path,'import {createLearningNativeFixtureModel} from "../tests/fixtures/learning/native-model";\n'+replaced,{mode:0o600});
 await withLearningDatabase(async db=>{await db.query(`CREATE TABLE learning_native_fixture_modes(customer_id uuid PRIMARY KEY REFERENCES customer_references(id),mode text NOT NULL CHECK(mode IN('normal','malformed','unknown','overrun','forbidden','all_reads')));CREATE TABLE learning_native_fixture_retirement_hold(attempt_id uuid PRIMARY KEY REFERENCES learning_attempts(id));CREATE FUNCTION learning_native_fixture_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM learning_native_fixture_retirement_hold WHERE attempt_id=NEW.owner_id) THEN NEW.next_attempt_at=clock_timestamp()+interval '1 hour';END IF;RETURN NEW;END $$;CREATE TRIGGER learning_native_fixture_hold BEFORE INSERT OR UPDATE ON learning_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION learning_native_fixture_hold();GRANT SELECT ON learning_native_fixture_retirement_hold TO turas_runtime;CREATE TABLE learning_native_fixture_calls(id uuid PRIMARY KEY,response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),step_index integer NOT NULL,provider_path text NOT NULL,max_output_tokens integer NOT NULL,tools jsonb NOT NULL,prompt_digest text NOT NULL,UNIQUE(response_attempt_id,step_index));GRANT SELECT ON learning_native_fixture_modes TO turas_runtime;GRANT SELECT,INSERT ON learning_native_fixture_calls TO turas_runtime;`);});
 process.env.TURAS_LEARNING_NATIVE_FIXTURE_READY='1';process.env.CRON_SECRET='synthetic-learning-watchdog-'.repeat(3);
}
