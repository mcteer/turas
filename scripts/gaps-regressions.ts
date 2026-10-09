import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withGapEnvironment} from './gaps-eval-environment';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {withExecutionEvalEnvironment} from './execution-eval-environment';
import {withSupportEvalEnvironment} from './support-eval-environment';
import {withReportsTestEnvironment} from './reports-test-environment';
import {withExpansionEvalEnvironment} from './expansion-eval-environment';
import {featureSourceDigest} from './execution-source-digest';
import {verifyGapTestReport} from './test-gaps';
import {REPORT_REGRESSION_SUITES,REPORT_INTEGRATION_REGRESSIONS} from './test-reports-regressions';
export const GAP_REGRESSION_COHORTS={
 unit:[...REPORT_REGRESSION_SUITES,'tests/unit/research-evidence.test.ts','tests/unit/research-fetch.test.ts','tests/unit/research-public-dossier.test.ts','tests/unit/expansion-content.test.ts','tests/unit/expansion-ranking.test.ts','tests/unit/expansion-cursor.test.ts','tests/contracts/support-http.test.ts'],
 original:[...REPORT_INTEGRATION_REGRESSIONS.filter(p=>!p.includes('/execution-')),'tests/integration/profile-research.test.ts','tests/integration/research-public-persistence.test.ts','tests/integration/knowledge-publication.test.ts','tests/integration/report-store.test.ts'],
 conversations:['tests/contracts/conversations.test.ts'],
 reports:['tests/contracts/report-publication-api.test.ts'],
 support:['tests/integration/support-policy.test.ts','tests/integration/support-http.test.ts'],
 execution:REPORT_INTEGRATION_REGRESSIONS.filter(p=>p.includes('/execution-')),
 expansion:['tests/integration/expansion-foundation.test.ts','tests/integration/expansion-owner-decisions.test.ts','tests/integration/expansion-decision-races.test.ts'],
} as const;
export async function runGapRegressions(){
 if(process.argv.length!==2)throw Error('Gap regression gate accepts no overrides');
 const all=Object.values(GAP_REGRESSION_COHORTS).flat();if(new Set(all).size!==all.length)throw Error('Duplicate regression suite');
 const sourceDigest=await featureSourceDigest('012');await mkdir('local-artifacts/012',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/012/regressions-'));const results:unknown[]=[];
 async function cohort(name:string,suites:readonly string[]){for(const suite of suites)await readFile(suite);const file=resolve(directory,name+'.json'),run=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...suites,'--reporter=json',`--outputFile=${file}`,'--testTimeout=120000','--hookTimeout=120000'],{env:{...process.env,TURAS_GAPS_OWNED:'0',TURAS_GAPS_REGRESSION_KIND:name.startsWith('execution-')?'execution':name.startsWith('expansion-')?'expansion':name.startsWith('support-')?'support':''},encoding:'utf8',timeout:360000});await writeFile(resolve(directory,name+'.log'),run.stdout+run.stderr,{mode:0o600,flag:'wx'});if(run.error||run.status!==0)throw Error('Regression cohort failed: '+name);const passed=verifyGapTestReport(JSON.parse(await readFile(file,'utf8')),suites);results.push({name,suites:suites.length,passed,failed:0,skipped:0});console.log(JSON.stringify({gate:'gap-regressions',name,suites:suites.length,passed}));}
 await withGapEnvironment(async()=>{await mkdir('local-artifacts/009',{recursive:true,mode:0o700});await cohort('unit',GAP_REGRESSION_COHORTS.unit);const prior=process.env.TURAS_TEST_DATABASE_URL;try{const url=new URL(prior!);url.searchParams.set('application_name','gap-regressions');process.env.TURAS_TEST_DATABASE_URL=url.toString();await cohort('original',GAP_REGRESSION_COHORTS.original);}finally{process.env.TURAS_TEST_DATABASE_URL=prior;}await cohort('conversations',GAP_REGRESSION_COHORTS.conversations);
 await withReportsLocalEnvironment(async()=>{for(const [index,suite] of GAP_REGRESSION_COHORTS.reports.entries())await withReportsTestEnvironment(async()=>cohort('reports-'+index,[suite]));for(const [index,suite] of GAP_REGRESSION_COHORTS.support.entries())await withSupportEvalEnvironment(async()=>cohort('support-'+index,[suite]));for(const [index,suite] of GAP_REGRESSION_COHORTS.execution.entries())await withExecutionEvalEnvironment(async()=>cohort('execution-'+index,[suite]));for(const [index,suite] of GAP_REGRESSION_COHORTS.expansion.entries())await withExpansionEvalEnvironment(async()=>cohort('expansion-'+index,[suite]));});},{deadlineMs:900000});
 if(sourceDigest!==await featureSourceDigest('012'))throw Error('Regression source changed');const evidence={gate:'gap-regressions',sourceDigest,suites:all.length,results,hostedProof:false,status:'passed'};await writeFile(resolve(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runGapRegressions().catch(error=>{console.error(error instanceof Error?error.message:'Gap regressions failed; inspect private evidence');process.exitCode=1;});
