import {readLearningNativeAssertion} from './learning-native-diagnostics';
import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {fixedBrowserPhases,pilotUiChildFailures} from './ci-browser-diagnostics';
import {pilotRegressionFailureMetadata} from './ci-process-diagnostics';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence,readBoundedEvidence} from './pilot-evidence';
import {capturePartnerProcess,runPartnerProcess,verifyPartnerTestReport} from './test-partners';
/** Complete predecessor gates retain their own isolation and acceptance checks.
 * Also exercise affected identity/retrieval surfaces at the actual 016 schema on
 * PostgreSQL 18. No filters, paid calls, selected database or hosted claims. */
const currentFiles=[
 'tests/integration/foundation.test.ts',
 'tests/integration/profile-partner-access.test.ts',
 'tests/integration/grant-concurrency.test.ts',
 'tests/integration/conversation-delivery.test.ts',
 'tests/contracts/conversations.test.ts',
 'tests/integration/mcp/profiles.test.ts',
 'tests/integration/mcp/evidence.test.ts',
 'tests/integration/mcp/knowledge.test.ts',
 'tests/integration/mcp/plans.test.ts',
 'tests/integration/mcp/reports.test.ts',
 'tests/integration/mcp/authority.test.ts',
] as const;
export async function checkPilotRegressions(){
 if(process.argv.length!==2)throw Error('Complete pilot regressions take no filters');
 process.umask(0o077);const source=await pilotSource(),runId=randomUUID();
 const root=resolve('local-artifacts/016/regressions-'+runId);await createEvidenceDirectory(root);
 const signal=AbortSignal.timeout(14400000),results:unknown[]=[];
 let stage='predecessor-process',lastProcess:unknown,currentReport:unknown;
 let uiFailures:ReturnType<typeof pilotUiChildFailures>=[];
 try{
  const predecessor=await capturePartnerProcess(['--import','tsx','scripts/test-mcp-regressions.ts'],10800000,signal);
  lastProcess=predecessor;
  await writeFile(join(root,'predecessor.log'),predecessor.stdout+'\n'+predecessor.stderr,{flag:'wx',mode:0o600});
  if(predecessor.status!==0||predecessor.error){
   const names=['014-domain-native','014-native','014-webkit','knowledge-retrieval-conversations-reports-support-expansion','012-domain','013-domain','private-conversations-earlier-authorities-and-webkit'];
   const phases=(predecessor.stdout+'\n'+predecessor.stderr).split('\n').flatMap(line=>{try{const row=JSON.parse(line);if(names.includes(row.regression))return [{name:row.regression,state:'failed',browser:Array.isArray(row.diagnostics)?row.diagnostics.slice(0,4).filter((d:any)=>/^webkit-(desktop|mobile)-(light|dark)$/.test(d.project)).map((d:any)=>({project:d.project,failedLocations:Array.isArray(d.failedLocations)?d.failedLocations.slice(0,20).map((f:any)=>({file:/^learning-[a-z-]+\.spec\.ts$/.test(f.file)?f.file:'unknown',line:Number.isInteger(f.line)&&f.line>=0&&f.line<100000?f.line:0,status:['failed','timedOut','interrupted'].includes(f.status)?f.status:'unknown',phases:fixedBrowserPhases(f.phases),signatures:Array.isArray(f.signatures)?f.signatures.filter((s:unknown)=>['Timeout','toBeFocused','toBeVisible','toEqual','toHaveCount','ECONNREFUSED','Execution context was destroyed','Fast Refresh','503','429'].includes(String(s))).slice(0,10):[]})):[]})):[]}];if(names.includes(row.gate)&&row.status==='passed')return [{name:row.gate,state:'passed'}];}catch{}return [];});
   const nativeDiagnostics=(predecessor.stdout+'\n'+predecessor.stderr).split('\n').flatMap(line=>{try{const row=JSON.parse(line);return Array.isArray(row.nativeDiagnostics)?row.nativeDiagnostics.map(readLearningNativeAssertion).filter(Boolean):[];}catch{return [];}}).slice(0,4);
   console.error(JSON.stringify({nativeDiagnostics,gate:'pilot-regression-predecessor',state:'failed',exitCode:predecessor.status,processError:predecessor.error,phases}));
   throw Error('Complete predecessor gates failed');
  }
  stage='predecessor-receipt';
  const receipts=predecessor.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}).filter(row=>row.paidCalls===0&&row.hostedProof===false&&Array.isArray(row.results)&&JSON.stringify(row.results.map((result:any)=>result.name))===JSON.stringify(['014-domain-native','014-native','014-webkit','knowledge-retrieval-conversations-reports-support-expansion','012-domain','013-domain','private-conversations-earlier-authorities-and-webkit','protected-hosted-watchdog']));
  if(receipts.length!==1||receipts[0].results.length!==8)throw Error('Exact predecessor completion receipt missing');
  results.push({gate:'complete-015-predecessors',receipt:receipts[0]});
  stage='current-schema-setup';lastProcess=undefined;
  await withPilotEnvironment(async environment=>{
   const owner=new URL(process.env.TURAS_TEST_DATABASE_URL!);owner.searchParams.set('application_name','pilot-regressions');process.env.TURAS_TEST_DATABASE_URL=owner.toString();
   process.env.TURAS_APP_ORIGIN='http://127.0.0.1:3000';
   const report=join(root,`schema-${String(CURRENT_SCHEMA_VERSION).padStart(3,'0')}-postgres18.json`);
   stage='current-schema-process';
   await runPartnerProcess(['node_modules/vitest/vitest.mjs','run',...currentFiles,'--reporter=json','--outputFile='+report],{cwd:environment.appRoot,timeoutMs:300000,signal:environment.signal});
   stage='current-schema-report';
   const parsed=JSON.parse(await readFile(report,'utf8'));currentReport=parsed;
   const passed=verifyPartnerTestReport(parsed,currentFiles);
   if(passed!==40||parsed.numTotalTests!==40||parsed.numPassedTests!==40||parsed.testResults.some((suite:any)=>suite.assertionResults.some((test:any)=>(test.retryReasons?.length??0)>0)))throw Error('Exact current-schema regressions incomplete or unstable');
   results.push({gate:`current-${String(CURRENT_SCHEMA_VERSION).padStart(3,'0')}-postgres18`,files:currentFiles,passed,failed:0,skipped:0,flaky:0});
   stage='current-schema-cleanup';
  },{postgresMajor:18,deadlineMs:360000});
  stage='fresh-ui-process';
  const ui=await capturePartnerProcess(['--import','tsx','scripts/check-pilot-ui.ts'],2400000,signal);
  lastProcess=ui;
  await writeFile(join(root,'webkit.log'),ui.stdout+'\n'+ui.stderr,{flag:'wx',mode:0o600});
  if(ui.status!==0||ui.error){
   const failure=Error('Fresh four-project pilot WebKit gate failed');
   try{uiFailures=pilotUiChildFailures(ui.stderr);}catch{/* Preserve the gate failure if diagnostics are unavailable. */}
   throw failure;
  }
  stage='fresh-ui-receipt';
  const uiReceipts=ui.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}).filter(row=>row.passed===40&&row.failed===0&&row.skipped===0&&row.projects===4&&row.acceptance===true);
  if(uiReceipts.length!==1)throw Error('Exact fresh WebKit completion receipt missing');
  results.push({gate:'fresh-pilot-webkit',receipt:uiReceipts[0]});
  stage='final-source';
  const current=await pilotSource();if(JSON.stringify(current)!==JSON.stringify(source))throw Error('Regression source changed');
  const receipt={version:'pilot-regressions-v1',runId,...source,results,paidCalls:0,hostedProof:false,state:'pass'};
  stage='final-evidence';
  await writeEvidence(root,'completed.json',receipt);console.info(JSON.stringify({gate:'pilot-regressions',state:'pass',groups:results.length,paidCalls:0,hostedProof:false}));return receipt;
 }catch(error){
  try{
   if(!currentReport&&stage.startsWith('current-schema-'))try{currentReport=await readBoundedEvidence(root,`schema-${String(CURRENT_SCHEMA_VERSION).padStart(3,'0')}-postgres18.json`,4194304);}catch{/* Best effort after owned cleanup. */}
   const diagnostics={...pilotRegressionFailureMetadata(stage,lastProcess,currentReport,currentFiles),uiFailures};
   await writeEvidence(root,'failure.json',{version:'pilot-regressions-v1',runId,...source,state:'fail',safeFailure:'incomplete_regression_composition',diagnostics}).catch(()=>undefined);
   console.error(JSON.stringify({kind:'pilot_regression_failure',...diagnostics}));
  }catch{/* Neither formatting, persistence nor logging may replace the original error. */}
  throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkPilotRegressions().catch(()=>{console.error('Pilot regression composition failed; inspect private evidence.');process.exitCode=1;});
