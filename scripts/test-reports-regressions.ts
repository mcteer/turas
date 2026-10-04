import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reportsSourceDigest} from './reports-source';
import {verifyExecutionTestReport} from './test-execution';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {withExecutionEvalEnvironment} from './execution-eval-environment';

/** The fast prior-feature regression layer; integration/recovery remain separate gates. */
export const REPORT_REGRESSION_SUITES=[
 'tests/unit/http.test.ts','tests/unit/auth.test.ts','tests/unit/access-policy.test.ts',
 'tests/unit/profile-projection.test.ts','tests/unit/profile-partner-projection.test.ts',
 'tests/unit/artifact-schemas.test.ts','tests/unit/artifact-container-policy.test.ts',
 'tests/unit/retrieval-projection.test.ts','tests/unit/knowledge-suspension.test.ts',
 'tests/unit/plan-diff.test.ts','tests/unit/plan-design.test.ts',
 'tests/unit/staffing-economics.test.ts','tests/unit/staffing-maintenance-scheduler.test.ts',
 'tests/unit/execution-calculations.test.ts','tests/unit/execution-client.test.ts',
] as const;
export const REPORT_INTEGRATION_REGRESSIONS=[
 'tests/integration/profile-review-state.test.ts',
 'tests/integration/profile-partner-access.test.ts',
 'tests/integration/retrieval-projections.test.ts',
 'tests/integration/execution-records.test.ts',
 'tests/integration/execution-milestones.test.ts',
 'tests/integration/execution-time.test.ts',
 'tests/integration/execution-reconciliation.test.ts',
] as const;
export function validateReportRegressionManifest(suites:readonly string[]=REPORT_REGRESSION_SUITES){
 if(new Set(suites).size!==suites.length||suites.length!==REPORT_REGRESSION_SUITES.length||REPORT_REGRESSION_SUITES.some(path=>!suites.includes(path)))throw new Error('Prior-feature regression manifest mismatch');
 return [...suites];
}
async function main(){
 if(process.argv.length!==2)throw new Error('Regression gate accepts no overrides');
 const suites=validateReportRegressionManifest(),sourceDigest=await reportsSourceDigest();
 await mkdir('local-artifacts/009',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/009/regressions-'));
 const report=resolve(directory,'tests.json');
 const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...suites,'--reporter=json',`--outputFile=${report}`],{env:{...process.env,AI_GATEWAY_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0'},encoding:'utf8',timeout:120000});
 await writeFile(resolve(directory,'tests.log'),result.stdout+result.stderr,{mode:0o600,flag:'wx'});
 if(result.error||result.status!==0)throw new Error('Prior-feature unit regressions failed');
 const counts=verifyExecutionTestReport(JSON.parse(await readFile(report,'utf8')),suites);
 if(sourceDigest!==await reportsSourceDigest())throw new Error('Regression source changed');
 let integrationPassed=0;
 for(const [index,suite]of REPORT_INTEGRATION_REGRESSIONS.entries())await withReportsLocalEnvironment(async()=>{
  const run=async()=>{
   const file=resolve(directory,`integration-${index}.json`);
   const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',suite,'--reporter=json',`--outputFile=${file}`,'--testTimeout=120000','--hookTimeout=120000'],{env:process.env,encoding:'utf8',timeout:360000});
   await writeFile(resolve(directory,`integration-${index}.log`),result.stdout+result.stderr,{mode:0o600,flag:'wx'});
   if(result.error||result.status!==0)throw new Error(`Prior-feature integration failed at ${suite}`);
   integrationPassed+=verifyExecutionTestReport(JSON.parse(await readFile(file,'utf8')),[suite]).passed;
  };
  if(suite.includes('/execution-'))await withExecutionEvalEnvironment(run);else await run();
 });
 if(sourceDigest!==await reportsSourceDigest())throw new Error('Regression source changed');
 const evidence={gate:'reports-prior-feature-regressions',sourceDigest,...counts,integrationSuites:REPORT_INTEGRATION_REGRESSIONS.length,integrationPassed,status:'passed'};
 await writeFile(resolve(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Reporting regression gate failed; inspect private evidence');process.exitCode=1;});
