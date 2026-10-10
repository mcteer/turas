import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {featureSourceDigest} from './execution-source-digest';
import {verifyLearningSuites} from './learning-suites';
const gate=process.argv[2],sourceDigest=await featureSourceDigest('014'),manifest=await verifyLearningSuites();
if(process.argv.length!==3||sourceDigest!==process.env.TURAS_014_EXPECTED_SOURCE_DIGEST)throw Error('Learning CI source identity mismatch');
const evidence:Record<string,any>[]=[];
async function scan(path:string){for(const e of await readdir(path,{withFileTypes:true})){if(e.name.startsWith('owned-'))continue;const file=join(path,e.name);if(e.isDirectory())await scan(file);else if(e.name==='summary.json'||e.name.endsWith('.summary.json')||e.name==='build.json'||e.name==='fixture-capture.json'){const d=JSON.parse(await readFile(file,'utf8'));if(d.sourceDigest===sourceDigest)evidence.push(d);}}}
await scan('local-artifacts/014');
const requireEvidence=(predicate:(d:Record<string,any>)=>boolean)=>{if(!evidence.some(predicate))throw Error('Incomplete learning CI evidence: '+gate);};
if(gate==='deterministic'){requireEvidence(d=>d.acceptance===true&&d.suites===manifest.domain.length+manifest.native.length&&d.passed>0&&d.failed===0&&d.skipped===0);requireEvidence(d=>d.web===true&&d.eve===true&&d.hostedProof===false);}
else if(gate==='native')requireEvidence(d=>d.checks===25&&d.paidCalls===0&&d.actualModelQuality===false);
else if(gate==='webkit')requireEvidence(d=>d.acceptance===true&&d.journeys===manifest.ui.length&&d.projects===4&&d.passed>=20&&d.failed===0&&d.skipped===0);
else if(gate==='benchmark')requireEvidence(d=>d.results?.length===7&&d.quotaResets===0&&d.externalProviderCalls===0&&manifest.performanceClasses.every(name=>d.results.some((r:any)=>r.class===name&&r.operations===100&&r.p95Ms<1000&&r.quotaResets===0)));
else if(gate==='regressions')requireEvidence(d=>d.results?.length===5&&d.paidCalls===0&&d.results.every((r:any)=>r.passed>0||r.receipt));
else if(gate==='recovery')requireEvidence(d=>d.results?.length===2&&d.paidCalls===0&&d.results.every((r:any)=>r.to===54&&r.activationSnapshot&&r.oldWriterDenied&&r.runtimeGrants&&r.workerCrashAndSigterm&&r.authenticatedNativeAppRestarts===2&&r.sameDatabaseAndWorkflow&&r.unknownCostHeld&&r.earliestDeadlinePreserved&&r.domainChecks>0));
else if(gate==='evaluation-fixture')requireEvidence(d=>d.complete===true&&d.actualConfiguredProvider===false&&d.arms?.length===16&&d.automaticPaidRetries===0);
else throw Error('Unknown learning CI gate');
console.info(JSON.stringify({gate,sourceDigest,complete:true,hostedProof:false}));
