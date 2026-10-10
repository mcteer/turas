import {withExpansionEvalEnvironment} from './expansion-eval-environment';
import {createExpansionActors} from '../tests/fixtures/expansion/seed';
import {closeRuntimePool} from '../lib/server/db/client';
import {spawnSync} from 'node:child_process';
import {openSync,closeSync,readdirSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
import {featureSourceDigest} from './execution-source-digest';
import {verifySupportSuiteCoverage} from './test-support';
import {verifyExecutionSuiteCoverage} from './test-execution';
if(process.argv.length!==2)throw Error('Expansion regression gate takes no overrides');assertDeterministicTestMode();
const fixtures=spawnSync(process.execPath,['--import','tsx','tests/fixtures/artifacts/generate.ts'],{env:process.env,stdio:'ignore',timeout:120000});if(fixtures.error||fixtures.status!==0)throw Error('Synthetic artifact fixture generation failed');
const sourceDigest=await featureSourceDigest('011'),support=verifySupportSuiteCoverage(),execution=verifyExecutionSuiteCoverage();
const earlier=['unit','contracts','integration'].flatMap(group=>readdirSync(resolve('tests',group)).filter(name=>name.endsWith('.test.ts')&&!/^(staffing|execution|report|support|expansion|gap|partner|learning)-/.test(name)&&name!=='runtime-restart.test.ts').map(name=>`tests/${group}/${name}`));
if(!earlier.some(name=>/conversation/.test(name))||!earlier.some(name=>/research/.test(name))||!earlier.some(name=>/plan-/.test(name)))throw Error('Earlier privacy/research/plan coverage is missing');
for(const file of ['scripts/test-staffing-regressions.ts','scripts/test-execution-regressions.ts']){const source=await readFile(file,'utf8');if(!source.includes('expansion'))throw Error('Older regression discovery must exclude expansion');}
await mkdir('local-artifacts/011',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/011/regressions-'));await writeFile(resolve(directory,'manifest.json'),JSON.stringify({sourceDigest,earlier,execution,support}),{mode:0o600});const cohorts:unknown[]=[];
const applicationPlaceholders={DATABASE_URL:process.env.DATABASE_URL,DATABASE_URL_UNPOOLED:process.env.DATABASE_URL_UNPOOLED};
await withExpansionEvalEnvironment(async environment=>{await createExpansionActors(environment.appRoot);await closeRuntimePool();
for(const [name,file,gate,count] of [['002-007','scripts/test-execution-regressions.ts','owned-execution-regressions',null],['008','scripts/test-execution.ts','owned-execution',execution.length],['010','scripts/test-support.ts',null,support.length]] as const){const path=resolve(directory,`${name}.log`),fd=openSync(path,'wx',0o600);let result;try{result=spawnSync(process.execPath,['--import','tsx',file],{env:{...process.env,...applicationPlaceholders,TURAS_TEST_ARTIFACT_STORE_ROOT:undefined,AI_GATEWAY_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0'},stdio:['ignore',fd,fd],timeout:3600000});}finally{closeSync(fd);}if(result.error||result.status!==0)throw Error(`Owned expansion regression cohort ${name} failed; inspect private evidence`);const lines=(await readFile(path,'utf8')).split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});const summaries=lines.filter(value=>gate?value.gate===gate:value.suites===count&&value.failed===0&&value.skipped===0&&typeof value.sourceDigest==='string');if(summaries.length!==1||count&&summaries[0].suites!==count)throw Error('Regression completion evidence is missing or duplicated');cohorts.push({name,summary:summaries[0]});}
},{empty:true,deadlineAt:Date.now()+7200000});
if(await featureSourceDigest('011')!==sourceDigest)throw Error('Regression source changed');const receipt={gate:'owned-expansion-regressions',sourceDigest,cohorts,paidCalls:0,hostedProof:false};await writeFile(resolve(directory,'completed.json'),JSON.stringify(receipt),{mode:0o600});console.log(JSON.stringify(receipt));
