import {spawnSync,execFileSync,spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {withReportsTestEnvironment} from './reports-test-environment';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {reportsSourceManifest} from './reports-source';
import {executionUiDiscovery,verifyExecutionUiReport} from './execution-ui-report';
const projects=['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark'];
const specs=['report-weekly','report-executive','report-boundaries','report-delivery'].map(name=>`tests/ui/${name}.spec.ts`);
let evidenceDirectory:string|undefined;
async function main(){
 const rawArgs=process.argv.slice(2),focused=rawArgs.filter(arg=>arg.startsWith('--suite=')),args=rawArgs.filter(arg=>!arg.startsWith('--suite='));
 if(args.length>1||args.some(arg=>!projects.includes(arg))||focused.length>1||focused.some(arg=>!specs.includes(arg.slice(8))))throw new Error('Use an optional named WebKit project and --suite=<exact registered UI suite>');
 const selectedSpecs=focused.length?[focused[0].slice(8)]:specs;
 const discovered=readdirSync('tests/ui').filter(name=>/^report-.*\.spec\.ts$/.test(name)).map(name=>`tests/ui/${name}`).sort();
 if(JSON.stringify(discovered)!==JSON.stringify([...specs].sort()))throw new Error('Report UI manifest mismatch');
 await mkdir('local-artifacts/009',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/009/ui-'));
 evidenceDirectory=directory;
 const initialSource=await reportsSourceManifest(),sourceDigest=initialSource.digest,image=execFileSync('docker',['image','inspect','turas-report-renderer:009-executive-v1','--format','{{.Id}}'],{encoding:'utf8'}).trim();
 await writeFile(join(directory,'source-start.json'),JSON.stringify(initialSource),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({gate:'reports-ui-start',sourceDigest,evidenceDirectory:directory,sourceFiles:Object.keys(initialSource.files).length}));
 let passed=0;
 for(const project of args.length?args:projects){
  const base=['node_modules/@playwright/test/cli.js','test',...selectedSpecs,`--project=${project}`,'--reporter=json','--forbid-only','--retries=0'];
  const listed=spawnSync(process.execPath,[...base,'--list'],{env:{...process.env,TURAS_REPORT_UI_READY:'1'},encoding:'utf8',timeout:60000,maxBuffer:10000000});
  if(listed.status!==0)throw new Error('Report UI discovery failed');
  const cases=executionUiDiscovery(JSON.parse(listed.stdout),selectedSpecs,project);
  for(const [index,item]of cases.entries())await withReportsTestEnvironment(async environment=>{
   process.env.TURAS_REPORTS_ENABLED='true';process.env.TURAS_REPORT_DELIVERY_ENABLED='false';process.env.TURAS_REPORT_RENDERER_IMAGE=image;
   const owner=process.env.DATABASE_URL!,runtime=await environment.prepareRuntimeRole();
   process.env.DATABASE_URL=runtime;try{await environment.start();}finally{process.env.DATABASE_URL=owner;}
   const result=await new Promise<{stdout:string;stderr:string;status:number|null}>((done,reject)=>{
    const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',`${item.file}:${item.line}`,`--project=${project}`,'--reporter=json','--forbid-only','--retries=0',`--output=${join(directory,project,String(index))}`],
     {env:{...process.env,TURAS_UI_BASE_URL:environment.origin,TURAS_REPORT_UI_READY:'1',AI_GATEWAY_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0'},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),600000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',status=>{clearTimeout(timer);done({stdout,stderr,status});});
   });
   await writeFile(join(directory,`${project}-${index}.json`),result.stdout,{mode:0o600,flag:'wx'});
   await writeFile(join(directory,`${project}-${index}.log`),result.stderr,{mode:0o600,flag:'wx'});
   await writeFile(join(directory,`${project}-${index}-app.log`),environment.privateLogTail(),{mode:0o600,flag:'wx'});
   if(result.status!==0)throw new Error('Report UI case failed; inspect private report');
   passed+=verifyExecutionUiReport(JSON.parse(result.stdout),[item]).expected;
   await environment.stop();
  });
 }
 const finalSource=await reportsSourceManifest();
 await writeFile(join(directory,'source-end.json'),JSON.stringify(finalSource),{mode:0o600,flag:'wx'});
 if(sourceDigest!==finalSource.digest){
  const changed=[...new Set([...Object.keys(initialSource.files),...Object.keys(finalSource.files)])].filter(path=>initialSource.files[path]!==finalSource.files[path]).sort();
  await writeFile(join(directory,'source-changes.json'),JSON.stringify({changed}),{mode:0o600,flag:'wx'});
  throw new Error('Report UI source changed; inspect private per-file digest evidence');
 }
 const evidence={gate:args.length||focused.length?'reports-ui-focused':'reports-ui',sourceDigest,projects:args.length?args:projects,specs:selectedSpecs,passed,status:'passed'};
 await writeFile(join(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
withReportsLocalEnvironment(main).catch(async error=>{if(evidenceDirectory)await writeFile(join(evidenceDirectory,'failure.json'),JSON.stringify({message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined}),{mode:0o600,flag:'wx'});console.error('Report UI gate failed; inspect private 009 UI evidence');process.exitCode=1;});
