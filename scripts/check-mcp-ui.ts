import { readFile,readdir,mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withMcpEnvironment } from './mcp-environment';
import { capturePartnerProcess } from './test-partners';
import { executionUiDiscovery,verifyExecutionUiReport } from './execution-ui-report';
import { featureSourceDigest } from './execution-source-digest';
export const mcpUiProjects=['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark'] as const;
export async function checkMcpUi(){
  const development=process.argv[2]==='--development';if(process.argv.length!==2&&!development)throw Error('MCP UI acceptance takes no filters');
  const manifest=(JSON.parse(await readFile('scripts/mcp-suites.json','utf8')) as {ui:string[]}).ui,files=development?process.argv.slice(3):manifest;
  const actual=(await readdir('tests/ui')).filter(file=>/^mcp-.*\.spec\.ts$/.test(file)).map(file=>'tests/ui/'+file);
  if(!files.length || files.some(file=>!manifest.includes(file)) || (!development&&JSON.stringify(actual.sort())!==JSON.stringify([...manifest].sort())))throw Error('MCP UI journeys are incomplete or unregistered');
  const digest=await featureSourceDigest('015');await mkdir('local-artifacts/015',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/015/ui-'));let passed=0;
  await withMcpEnvironment(async environment=>{
    await environment.startProduction();process.env.TURAS_UI_BASE_URL=environment.origin;process.env.TURAS_MCP_UI_FIXTURE_READY='1';
    for(const project of mcpUiProjects){
      const args=['node_modules/@playwright/test/cli.js','test',...files,'--project='+project,'--reporter=json','--forbid-only','--retries=0'];
      const discovery=await capturePartnerProcess([...args,'--list'],60000,environment.signal);
      if(discovery.status!==0||discovery.error)throw Error('MCP UI discovery failed');const cases=executionUiDiscovery(JSON.parse(discovery.stdout),files,project);
      const run=await capturePartnerProcess([...args,'--output='+resolve(directory,project)],300000,environment.signal);
      await writeFile(resolve(directory,project+'.json'),run.stdout,{mode:0o600});await writeFile(resolve(directory,project+'.log'),run.stderr,{mode:0o600});
      if(run.status!==0||run.error)throw Error('MCP UI failed: '+project+'; inspect '+directory);
      passed+=verifyExecutionUiReport(JSON.parse(run.stdout),cases).expected;console.info(JSON.stringify({project,passed:cases.length,skipped:0}));
    }
  },{deadlineMs:1800000});
  if(await featureSourceDigest('015')!==digest)throw Error('MCP source changed during UI check');
  const summary={sourceDigest:digest,journeys:files.length,projects:4,passed,failed:0,skipped:0,acceptance:!development};await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkMcpUi().catch(error=>{console.error(error instanceof Error?error.message:'MCP UI failed');process.exitCode=1;});
