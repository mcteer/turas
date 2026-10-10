import { spawn } from 'node:child_process';
import { withLearningDatabase } from '../tests/fixtures/learning/environment';
import { seedLearningPublicPractice } from '../tests/fixtures/learning/setup';
import { withLearningEnvironment } from './learning-environment';
await withLearningEnvironment(async environment => {
 await withLearningDatabase(seedLearningPublicPractice);
 await new Promise<void>((done,reject)=>{
  const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/contracts/learning-feedback.test.ts','tests/contracts/learning-evaluation.test.ts','tests/unit/learning-budget.test.ts','tests/unit/learning-model-budget.test.ts','tests/unit/learning-metrics.test.ts','tests/unit/learning-native-store.test.ts','tests/integration/learning-foundation.test.ts','tests/integration/learning-policy.test.ts','tests/integration/learning-sources.test.ts','tests/integration/learning-budget-guards.test.ts','tests/integration/learning-feedback.test.ts','tests/integration/learning-draft.test.ts','tests/integration/learning-publication.test.ts','tests/integration/learning-native-draft.test.ts','tests/integration/learning-native-evaluation.test.ts','tests/integration/learning-cohorts.test.ts','tests/integration/learning-maintenance.test.ts'],{env:process.env,stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');environment.signal.addEventListener('abort',stop,{once:true});
  child.once('error',reject);child.once('exit',code=>{environment.signal.removeEventListener('abort',stop);code===0?done():reject(Error('Learning foundation checks failed'));});
 });
});
