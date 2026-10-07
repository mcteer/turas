import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {reportsSourceDigest} from './reports-source';
import { withReportsTestEnvironment } from './reports-test-environment';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {verifyExecutionTestReport} from './test-execution';

export const REPORT_SUITES = [
  'tests/unit/report-test-manifest.test.ts',
  'tests/unit/report-regression-manifest.test.ts',
  'tests/unit/report-corrections.test.ts',
  'tests/unit/report-controlled-delivery.test.ts',
  'tests/unit/report-release-evidence.test.ts',
  'tests/unit/report-retention.test.ts',
  'tests/unit/report-periods.test.ts',
  'tests/unit/report-schema.test.ts',
  'tests/unit/report-calculations.test.ts',
  'tests/unit/report-measurements.test.ts',
  'tests/unit/report-document.test.ts',
  'tests/unit/report-executive.test.ts',
  'tests/unit/report-fonts.test.ts',
  'tests/unit/report-brand-bindings.test.ts',
  'tests/unit/report-render-layout.test.ts',
  'tests/unit/report-recipients.test.ts',
  'tests/unit/report-schedule-calendar.test.ts',
  'tests/unit/report-delivery-state.test.ts',
  'tests/unit/report-delivery-identity.test.ts',
  'tests/contracts/report-policy.test.ts',
  'tests/contracts/report-audience.test.ts',
  'tests/contracts/report-api.test.ts',
  'tests/contracts/report-limits.test.ts',
  'tests/contracts/report-provider.test.ts',
  'tests/contracts/report-webhook.test.ts',
  'tests/contracts/report-publication-api.test.ts',
  'tests/integration/report-artifacts.test.ts',
  'tests/integration/report-missing-artifacts.test.ts',
  'tests/integration/report-render-jobs.test.ts',
  'tests/integration/report-brand-review.test.ts',
  'tests/integration/report-send-outbox.test.ts',
  'tests/integration/report-dispatch-recovery.test.ts',
  'tests/integration/report-cleanup.test.ts',
  'tests/integration/report-history.test.ts',
  'tests/integration/report-audit-replay.test.ts',
  'tests/integration/report-lifecycle.test.ts',
  'tests/integration/report-schema.test.ts',
  'tests/integration/report-store.test.ts',
  'tests/integration/report-jobs.test.ts',
  'tests/integration/report-recipient-policy.test.ts',
  'tests/integration/report-schedules.test.ts',
  'tests/integration/report-commands.test.ts',
  'tests/integration/report-snapshots.test.ts',
  'tests/integration/report-scope.test.ts',
  'tests/integration/report-profile-inputs.test.ts',
  'tests/integration/report-milestones.test.ts',
  'tests/integration/report-weekly.test.ts',
  'tests/integration/report-publication-prerequisites.test.ts',
] as const;
export function verifyReportSuiteCoverage(manifest: readonly string[]=REPORT_SUITES): string[] {
  const discovered=['unit','contracts','integration'].flatMap(kind=>readdirSync(`tests/${kind}`)
    .filter(name=>/^report-.*\.test\.ts$/.test(name)).map(name=>`tests/${kind}/${name}`)).sort();
  if (new Set(manifest).size!==manifest.length || discovered.length!==manifest.length ||
      discovered.some(name=>!manifest.includes(name))) throw new Error('Report suite manifest mismatch');
  return [...manifest];
}
export function verifyReportTestResult(result:any,suites:readonly string[]):void {
  verifyExecutionTestReport(result,suites);
  if (result.success!==true || result.numFailedTests!==0 || result.numPendingTests!==0 ||
      result.numTotalTests<=0 || result.numPassedTests!==result.numTotalTests ||
      result.testResults?.length!==suites.length || result.testResults.some((suite:any)=>
        suite.status!=='passed' || !suites.some(name=>suite.name.endsWith(name)) ||
        !suite.assertionResults?.length || suite.assertionResults.some((test:any)=>test.status!=='passed'))) {
    throw new Error('Report test result incomplete');
  }
}
async function main() {
  const allSuites=verifyReportSuiteCoverage(),args=process.argv.slice(2);
  if(args.length && (args[0]!=='--suite' || args.length!==2 || !allSuites.includes(args[1])))throw new Error('Use --suite with an exact registered report suite');
  const suites=args.length?[args[1]]:allSuites,sourceDigest=await reportsSourceDigest();
  const directory=await mkdtemp(resolve('local-artifacts/009/tests-'));
  const digest=createHash('sha256');
  for (const file of suites) digest.update(file).update(readFileSync(file));
  await writeFile(resolve(directory,'source.json'),JSON.stringify({sourceDigest,suiteDigest:digest.digest('hex'),suites}),{mode:0o600,flag:'wx'});
   let passed=0;
   for (const [index,suite] of suites.entries()) {
    const run=async()=>{
      const report=resolve(directory,`${index}.json`);
      const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',suite,'--testTimeout=120000','--hookTimeout=120000','--reporter=json',`--outputFile=${report}`],{encoding:'utf8',timeout:360000,env:process.env});
      await writeFile(resolve(directory,`${index}.log`),result.stdout+result.stderr,{mode:0o600,flag:'wx'});
      if(result.error || result.status!==0)throw new Error(`Report suite failed: ${suite}`);
       const resultReport=JSON.parse(await readFile(report,'utf8'));
       verifyReportTestResult(resultReport,[suite]);passed+=verifyExecutionTestReport(resultReport,[suite]).passed;
    };
    try{
       if (!suite.startsWith('tests/integration/') && !['tests/contracts/report-publication-api.test.ts','tests/contracts/report-audience.test.ts'].includes(suite)) await run(); else await withReportsTestEnvironment(run);
    }catch(error){
      await writeFile(resolve(directory,'failure.json'),JSON.stringify({suite,stage:'suite-or-owned-environment',error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error)}),{mode:0o600,flag:'wx'});
      console.error(JSON.stringify({gate:'reports-deterministic',suite,stage:'suite-or-owned-environment',status:'failed'}));
      throw new Error(`Report check failed at ${suite}; inspect private failure.json`);
    }
  }
  if(await reportsSourceDigest()!==sourceDigest)throw new Error('Report source changed during test evidence run');
   const evidence={gate:args.length?'reports-focused':'reports-deterministic',sourceDigest,suites:suites.length,passed,failed:0,skipped:0,status:'passed'};
   await writeFile(resolve(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  mkdir(resolve('local-artifacts/009'),{recursive:true,mode:0o700}).then(()=>withReportsLocalEnvironment(main)).catch(()=>{console.error('Report test gate failed; inspect private 009 test evidence including failure.json');process.exitCode=1;});
}
