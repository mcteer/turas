import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
export type LearningSuites={version:string;feature:string;domain:string[];native:string[];ui:string[];acceptance:Record<string,string>;performanceClasses:string[];uiConfigurations:string[]};
export function verifyLearningSuites(requireAcceptance=true,root=process.cwd()):LearningSuites{
 const manifest=JSON.parse(readFileSync(resolve(root,'scripts/learning-suites.json'),'utf8')) as LearningSuites;
 if(manifest.version!=='learning-suites-v1'||manifest.feature!=='014-governed-adaptive-learning')throw Error('Exact learning suite contract required');
 const files=[...manifest.domain,...manifest.native,...manifest.ui],actual=['unit','contracts','integration','ui'].flatMap(group=>readdirSync(resolve(root,'tests',group)).filter(name=>/^learning-.*\.(test|spec)\.ts$/.test(name)).map(name=>`tests/${group}/${name}`));
 if(!files.length||new Set(files).size!==files.length||files.length!==actual.length||actual.some(file=>!files.includes(file))||manifest.ui.length!==5||manifest.uiConfigurations.length!==4||new Set(manifest.uiConfigurations).size!==4||manifest.performanceClasses.length!==7||new Set(manifest.performanceClasses).size!==7)throw Error('Learning suite inventory is missing, duplicate or incomplete');
 for(const file of files)readFileSync(resolve(root,file));
 const configurations=['desktop-light','desktop-dark','mobile-light','mobile-dark'],classes=['feedback-read','feedback-write','candidate-review','evaluation-admission','publication','cohort-read','dashboard-read'];
 if(JSON.stringify(manifest.uiConfigurations)!==JSON.stringify(configurations)||JSON.stringify(manifest.performanceClasses)!==JSON.stringify(classes))throw Error('Exact learning UI configurations and performance classes required');
 const required={native:'scripts/check-learning-native.ts',ui:'scripts/check-learning-ui.ts',recovery:'scripts/learning-recovery-check.ts',regressions:'scripts/check-learning-regression.ts',performance:'scripts/benchmark-learning.ts',actualModel:'scripts/eval-learning.ts',independentReview:'scripts/verify-learning-review.ts'};
 if(JSON.stringify(manifest.acceptance)!==JSON.stringify(required))throw Error('Exact learning acceptance inventory required');
 if(requireAcceptance)for(const file of Object.values(required))readFileSync(resolve(root,file));return manifest;
}
export type LearningTestReport={success?:boolean;numFailedTests?:number;numPendingTests?:number;testResults?:Array<{name:string;assertionResults?:Array<{status:string}>}>};
export function verifyLearningTestReport(report:LearningTestReport,expected:readonly string[]){
 if(!expected.length||new Set(expected).size!==expected.length||!report.success||report.numFailedTests||report.numPendingTests||report.testResults?.length!==expected.length)throw Error('Learning acceptance has failed, skipped or missing suites');
 let passed=0;for(const file of expected){const suite=report.testResults.find(result=>result.name.endsWith(file));if(!suite?.assertionResults?.length||suite.assertionResults.some(assertion=>assertion.status!=='passed'))throw Error('Learning acceptance has missing or skipped assertions');passed+=suite.assertionResults.length;}return passed;
}
