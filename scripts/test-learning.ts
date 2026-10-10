import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyLearningSuites,verifyLearningTestReport} from './learning-suites';
import {featureSourceDigest} from './execution-source-digest';
import {withLearningEnvironment} from './learning-environment';
import {withLearningDatabase} from '../tests/fixtures/learning/environment';
import {seedLearningPublicPractice} from '../tests/fixtures/learning/setup';
import {capturePartnerProcess} from './test-partners';
export async function testLearning(){
 const development=process.argv[2]==='--development';if(process.argv.length!==2&&!development)throw Error('Learning acceptance takes no overrides');
 const manifest=verifyLearningSuites(!development),registered=[...manifest.domain,...manifest.native],files=development?process.argv.slice(3):registered;if(!files.length||new Set(files).size!==files.length||files.some(file=>!registered.includes(file)))throw Error('Only registered learning development checks are allowed');
 const sourceDigest=await featureSourceDigest('014');await mkdir(resolve('local-artifacts/014'),{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/014/tests-')),reportPath=join(directory,'report.json');
 await withLearningEnvironment(async environment=>{await withLearningDatabase(seedLearningPublicPractice);const run=await capturePartnerProcess(['node_modules/vitest/vitest.mjs','run',...files,'--reporter=json','--outputFile='+reportPath,'--testTimeout=120000','--hookTimeout=120000'],240000,environment.signal);await writeFile(join(directory,'stdout.log'),run.stdout,{mode:0o600});await writeFile(join(directory,'stderr.log'),run.stderr,{mode:0o600});if(run.status!==0||run.error)throw Error('Learning checks failed; inspect '+directory);});
 const passed=verifyLearningTestReport(JSON.parse(await readFile(reportPath,'utf8')),files);if(await featureSourceDigest('014')!==sourceDigest)throw Error('Learning source changed during acceptance');
 const summary={sourceDigest,suites:files.length,passed,failed:0,skipped:0,acceptance:!development};await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)testLearning().catch(error=>{console.error(error instanceof Error?error.message:'Learning acceptance failed');process.exitCode=1;});
