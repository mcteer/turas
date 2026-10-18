import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withMcpEnvironment } from './mcp-environment';
await mkdir('local-artifacts/customer-profile-fixes',{recursive:true,mode:0o700});
const root=await mkdtemp(resolve('local-artifacts/customer-profile-fixes/ui-'));
await mkdir(join(root,'captures'),{mode:0o700});
await withMcpEnvironment(async environment=>{
 await environment.startProduction();
 const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((done,reject)=>{
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=playwright.customer-profiles.config.ts','--reporter=json','--forbid-only','--retries=0'],{
   env:{...process.env,CI:'true',TURAS_UI_BASE_URL:environment.origin,TURAS_UI_FIXTURE_DATABASE_URL:process.env.DATABASE_URL_UNPOOLED,TURAS_UI_CAPTURE_ROOT:join(root,'captures')},stdio:['ignore','pipe','pipe'],timeout:600000});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk.toString());child.stderr.on('data',chunk=>stderr+=chunk.toString());child.once('error',reject);child.once('close',code=>done({code,stdout,stderr}));
 });
 await writeFile(join(root,'report.json'),result.stdout,{mode:0o600});await writeFile(join(root,'stderr.log'),result.stderr,{mode:0o600});
 const report=JSON.parse(result.stdout);console.log(JSON.stringify({gate:'customer-profiles-ui',...report.stats}));
 if(result.code!==0||report.errors.length||!report.stats.expected||report.stats.unexpected||report.stats.skipped||report.stats.flaky)throw Error('Customer profile UI checks failed; inspect private report');
},{deadlineMs:900000});
