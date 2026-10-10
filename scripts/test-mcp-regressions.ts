import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withMcpEnvironment} from './mcp-environment';
import {featureSourceDigest} from './execution-source-digest';
import {capturePartnerProcess} from './test-partners';
import {verifyLearningTestReport} from './learning-suites';
/** Reuse the earlier features' complete, owned gates and their strict evidence
 * contracts. The outer environment provides only synthetic application config. */
const gates=[
 {name:'014-domain-native',file:'scripts/test-learning.ts',match:(row:Record<string,unknown>)=>row.acceptance===true&&row.failed===0&&row.skipped===0&&typeof row.suites==='number'},
 {name:'014-native',file:'scripts/check-learning-native.ts',match:(row:Record<string,unknown>)=>row.checks===25&&row.paidCalls===0},
 {name:'014-webkit',file:'scripts/check-learning-ui.ts',match:(row:Record<string,unknown>)=>row.acceptance===true&&row.projects===4&&row.failed===0&&row.skipped===0},
 {name:'knowledge-retrieval-conversations-reports-support-expansion',file:'scripts/gaps-regressions.ts',match:(row:Record<string,unknown>)=>row.gate==='gap-regressions'&&row.status==='passed'&&typeof row.suites==='number'},
 {name:'012-domain',file:'scripts/test-gaps.ts',match:(row:Record<string,unknown>)=>typeof row.suites==='number'&&row.failed===0&&row.skipped===0&&typeof row.sourceDigest==='string'},
 {name:'013-domain',file:'scripts/test-partners.ts',match:(row:Record<string,unknown>)=>typeof row.suites==='number'&&row.failed===0&&row.skipped===0&&typeof row.sourceDigest==='string'},
 {name:'private-conversations-earlier-authorities-and-webkit',file:'scripts/partners-regressions.ts',match:(row:Record<string,unknown>)=>Array.isArray(row.manifest)&&Array.isArray(row.results)&&typeof row.sourceDigest==='string'},
] as const;
async function main(){
 if(process.argv.length!==2)throw Error('Regression acceptance takes no overrides');const sourceDigest=await featureSourceDigest('015');await mkdir('local-artifacts/015',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/015/regressions-')),results:unknown[]=[];
 for(const gate of gates)await withMcpEnvironment(async environment=>{
  const run=await capturePartnerProcess(['--import','tsx',gate.file],2400000,environment.signal);await writeFile(join(directory,gate.name+'.log'),run.stdout+run.stderr,{mode:0o600});if(run.status!==0||run.error)throw Error('Earlier-feature regression failed: '+gate.name+'; inspect '+directory);
  const summaries=run.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line) as Record<string,unknown>];}catch{return [];}}).filter(gate.match);if(summaries.length!==1)throw Error('Missing or ambiguous earlier-feature completion receipt: '+gate.name);results.push({name:gate.name,receipt:summaries[0]});console.info(JSON.stringify({gate:gate.name,status:'passed'}));
 },{deadlineMs:2500000});
 const files=['tests/unit/hosted-watchdog.test.ts'],report=join(directory,'watchdog.json');const run=await capturePartnerProcess(['node_modules/vitest/vitest.mjs','run',...files,'--reporter=json','--outputFile='+report],60000,new AbortController().signal);await writeFile(report+'.log',run.stdout+run.stderr,{mode:0o600});if(run.status!==0||run.error)throw Error('Hosted watchdog regression failed');results.push({name:'protected-hosted-watchdog',passed:verifyLearningTestReport(JSON.parse(await readFile(report,'utf8')),files)});
 if(await featureSourceDigest('015')!==sourceDigest)throw Error('Regression source changed');const summary={sourceDigest,results,paidCalls:0,hostedProof:false};await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'MCP regression failed');process.exitCode=1;});
