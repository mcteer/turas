import {spawn,spawnSync} from 'node:child_process';
import {copyFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Unpaid UI fixture requires empty provider credentials');
await withPlanEvalEnvironment(async environment=>{
 await copyFile('playwright.config.ts',join(environment.appRoot,'playwright.config.ts'));
 const generated=spawnSync(process.execPath,['--import','tsx','tests/fixtures/artifacts/generate.ts'],{cwd:environment.appRoot,env:process.env,encoding:'utf8'});
 if(generated.status!==0)throw Error('Synthetic document corpus preparation failed');
 await environment.start();
 const files=process.argv.includes('--documents-only')?['tests/ui/ordinary-documents.spec.ts']:['tests/ui/ordinary-documents.spec.ts','tests/ui/chat.spec.ts','tests/ui/chat-states.spec.ts','tests/ui/artifact-context.spec.ts','tests/ui/artifact-lifecycle.spec.ts'];
 const status=await new Promise<number|null>((resolve,reject)=>{
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...files],{
   cwd:environment.appRoot,env:{...process.env,TURAS_UI_BASE_URL:environment.origin,TURAS_EXECUTION_FIXTURE_READY:'1'},stdio:'inherit'});
  child.once('error',reject);child.once('exit',resolve);
 });
 const output='local-artifacts/legacy-parity-documents';await mkdir(output,{recursive:true,mode:0o700});
 for(const name of await readdir(join(environment.appRoot,'local-artifacts')))if(/^ordinary-documents-webkit-[a-z-]+\.png$/.test(name))await copyFile(join(environment.appRoot,'local-artifacts',name),join(output,name));
 if(status!==0)throw Error('Ordinary chat headless WebKit checks failed');
},{feature:'010'});
