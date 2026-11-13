import {withLearningEnvironment} from './learning-environment';
import {withMcpEnvironment} from './mcp-environment';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {runPartnerProcess} from './test-partners';
import {checkGuidanceMigration} from './check-guidance-migration';

if(process.argv.length!==2)throw Error('Guidance checks take no database or test-path overrides');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Guidance checks require Node 24');
const run=(files:string[],signal:AbortSignal)=>runPartnerProcess(
 ['node_modules/vitest/vitest.mjs','run',...files,'--testTimeout=120000','--hookTimeout=120000'],
 {signal,timeoutMs:180000});

await run(['tests/unit/retrieval-guidance-freshness.test.ts','tests/contracts/retrieval-guidance-tool.test.ts'],new AbortController().signal);
await withLearningEnvironment(async environment=>{
 // Distinct URL string satisfies the legacy test guard; the target is this
 // harness's disposable loopback database, never selected application data.
 const testUrl=new URL(process.env.DATABASE_URL_UNPOOLED!);
 testUrl.searchParams.set('application_name','fresh-guidance-regressions');
 process.env.TURAS_TEST_DATABASE_URL=testUrl.href;
 for(const name of ['retrieval-retention','retrieval-service','specialist-profile-persistence',
  'legacy-research-cache-lifecycle','retrieval-fences','retrieval-jobs','knowledge-publication'])
  await run([`tests/integration/${name}.test.ts`],environment.signal);
 await withPlanEvalEnvironment(async()=>{
  await run(['tests/integration/plan-context.test.ts','tests/integration/plan-lifecycle.test.ts'],environment.signal);
 },{deadlineAt:Date.now()+180000});
},{deadlineMs:600000});
await withMcpEnvironment(async environment=>{
 await run(['tests/integration/mcp/evidence.test.ts','tests/integration/mcp/knowledge.test.ts'],environment.signal);
});
await checkGuidanceMigration();
