import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {featureSourceDigest} from './execution-source-digest';
const gate=process.argv[2],expected=process.env.TURAS_012_EXPECTED_SOURCE_DIGEST;
if(process.argv.length!==3||!['deterministic','webkit','recovery','benchmark','regressions'].includes(gate)||!expected||!/^[a-f0-9]{64}$/.test(expected))throw Error('Owned CI evidence gate identity required');
if(await featureSourceDigest('012')!==expected)throw Error('CI source changed');
const records:Array<{path:string;data:Record<string,unknown>}>=[];
async function visit(path:string){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await visit(file);else if(/(?:completed|summary|build)\.json$/.test(entry.name)){const data=JSON.parse(await readFile(file,'utf8'));if(data.sourceDigest){if(data.sourceDigest!==expected)throw Error('CI acceptance source digests differ');records.push({path:file,data});}}}}
await visit('local-artifacts/012');
const match=records.filter(({data})=>gate==='deterministic'?data.suites===15&&Number(data.passed)>0&&data.skipped===0:gate==='webkit'?data.journeys===6&&data.projects===4&&Number(data.passed)>0&&data.skipped===0:gate==='recovery'?Array.isArray(data.results)&&data.results.length===2&&data.results.every(r=>r.path&&r.schema===49):gate==='benchmark'?!!data.dataset&&Array.isArray(data.results)&&data.results.length===4: data.gate==='gap-regressions'&&data.suites===40&&data.status==='passed');
if(match.length!==1)throw Error('Missing or duplicate complete CI acceptance result');
if(gate==='deterministic'&&!records.some(({data})=>data.gate==='gap-build'&&data.web===true&&data.eve===true))throw Error('Owned web/eve build evidence missing');
console.log(JSON.stringify({gate,sourceDigest:expected,matchingAcceptance:true}));
