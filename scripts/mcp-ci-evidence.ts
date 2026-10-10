import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {featureSourceDigest} from './execution-source-digest';
import {verifyMcpSuites} from './test-mcp';
const gate=process.argv[2],sourceDigest=await featureSourceDigest('015'),manifest=verifyMcpSuites();
if(process.argv.length!==3||sourceDigest!==process.env.TURAS_015_EXPECTED_SOURCE_DIGEST)throw Error('MCP CI source identity mismatch');
const evidence:Record<string,any>[]=[];
async function scan(path:string){for(const entry of await readdir(path,{withFileTypes:true})){if(entry.name.startsWith('owned-'))continue;const file=join(path,entry.name);if(entry.isDirectory())await scan(file);else if(entry.name==='summary.json'||entry.name==='build.json'){const data=JSON.parse(await readFile(file,'utf8'));if(data.sourceDigest===sourceDigest)evidence.push(data);}}}
await scan('local-artifacts/015');
const requireEvidence=(predicate:(data:Record<string,any>)=>boolean)=>{if(!evidence.some(predicate))throw Error('Incomplete MCP CI evidence: '+gate);};
if(gate==='deterministic'||gate==='consumer')requireEvidence(d=>d.acceptance===true&&d.suites===manifest.domain.length&&d.passed>0&&d.failed===0&&d.skipped===0&&d.productionRuntime===true&&d.actualSdkConsumer===true&&d.consumerSuites===3&&d.paidCalls===0&&d.hostedProof===false);
else if(gate==='build')requireEvidence(d=>d.web===true&&d.eve===true&&d.productionRuntime===true&&d.paidCalls===0&&d.hostedProof===false);
else if(gate==='webkit')requireEvidence(d=>d.acceptance===true&&d.journeys===manifest.ui.length&&d.projects===4&&d.passed>=32&&d.failed===0&&d.skipped===0);
else if(gate==='recovery')requireEvidence(d=>JSON.stringify(d.from)===JSON.stringify(['empty',54])&&d.to===55&&d.backupRestore===true&&d.unchangedCustomerTruth===true&&d.persistentRevocation===true&&d.restart===true&&d.interruptedOwnedCleanup===true&&JSON.stringify(d.learningCompatibility)===JSON.stringify([54,55])&&d.paidCalls===0&&d.hostedProof===false);
else if(gate==='benchmark')requireEvidence(d=>d.results?.length===5&&d.quotaResets===0&&d.paidCalls===0&&['profiles','evidence','knowledge','plans','reports'].every(name=>d.results.some((r:any)=>r.class===name&&r.operations===100&&r.p95Ms<1000&&r.quotaResets===0&&r.overLimitDenied===true)));
else if(gate==='regressions')requireEvidence(d=>d.results?.length===8&&d.paidCalls===0&&d.results.every((r:any)=>r.passed>0||r.receipt));
else throw Error('Unknown MCP CI gate');
console.info(JSON.stringify({gate,sourceDigest,complete:true,hostedProof:false}));
