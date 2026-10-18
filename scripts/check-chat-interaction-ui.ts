import {spawn,spawnSync} from 'node:child_process';
import {copyFile,cp,mkdir,mkdtemp,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Interaction UI requires empty provider credentials');
const preparationRace=process.argv.includes('--preparation-race');
const directory=await mkdtemp(resolve('local-artifacts/019-ui-'));
await withPlanEvalEnvironment(async environment=>{
 const boot=spawnSync(process.execPath,['--experimental-strip-types','scripts/bootstrap-demo.ts'],{cwd:environment.appRoot,env:process.env,encoding:'utf8'});
 if(boot.status!==0)throw Error('Owned interaction fixture bootstrap failed');
 await environment.start();
 const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((done,reject)=>{
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/ui/chat-interaction-parity.spec.ts','tests/ui/legacy-chat-shell-contracts.spec.ts','tests/ui/legacy-retired-history.spec.ts','--reporter=json','--forbid-only','--retries=0',...(preparationRace?['--grep=an older failed delivery']:[])],{
   cwd:environment.appRoot,env:{...process.env,CI:'true',TURAS_UI_BASE_URL:environment.origin,TURAS_UI_FIXTURE_DATABASE_URL:process.env.DATABASE_URL_UNPOOLED,TURAS_EXECUTION_FIXTURE_READY:'1'},stdio:['ignore','pipe','pipe'],timeout:900000});
  let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.once('error',reject);child.once('close',code=>done({code,stdout,stderr}));
 });
 await writeFile(join(directory,'report-private.json'),result.stdout,{mode:0o600});await writeFile(join(directory,'stderr-private.log'),result.stderr,{mode:0o600});await writeFile(join(directory,'app-private.log'),environment.privateLogTail(),{mode:0o600});
 await cp(join(environment.appRoot,'test-results'),join(directory,'test-results'),{recursive:true}).catch(()=>{});
 const captures=join(environment.appRoot,'local-artifacts/019');await mkdir(join(directory,'captures'),{mode:0o700});
 for(const name of await readdir(captures).catch(()=>[]))if(/^[a-z-]+-webkit-(desktop|mobile)-(light|dark)\.png$/.test(name))await copyFile(join(captures,name),join(directory,'captures',name));
 const report=JSON.parse(result.stdout);console.log(JSON.stringify({gate:'019-chat-interaction',...report.stats,privateResults:directory,modelCalls:0}));
 if(result.code!==0||report.errors.length||report.stats.expected!==(preparationRace?4:64)||report.stats.unexpected||report.stats.flaky||report.stats.skipped)throw Error('Interaction UI requires all selected cases acrossfour WebKit projects');
},{feature:'010',production:true,deadlineAt:Date.now()+1800000,prepare:async({appRoot})=>{await copyFile('playwright.config.ts',join(appRoot,'playwright.config.ts'));return {};}});
