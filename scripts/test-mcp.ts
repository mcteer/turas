import { readFileSync,readdirSync } from "node:fs";
import { mkdir,mkdtemp,readFile,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pathToFileURL } from "node:url";
import { withMcpEnvironment } from "./mcp-environment";
import { capturePartnerProcess,verifyPartnerTestReport } from "./test-partners";
import { featureSourceDigest } from "./execution-source-digest";

export function verifyMcpSuites(complete=true){
  const manifest=JSON.parse(readFileSync(resolve('scripts/mcp-suites.json'),'utf8')) as {domain:string[];ui:string[]};
  const actual=['contracts','integration'].flatMap(group=>readdirSync(resolve('tests',group,'mcp')).filter(file=>file.endsWith('.test.ts')).map(file=>`tests/${group}/mcp/${file}`));
  if(!manifest.domain.length || new Set(manifest.domain).size!==manifest.domain.length || actual.some(file=>!manifest.domain.includes(file)) ||
    (complete && (actual.length!==manifest.domain.length || manifest.domain.some(file=>!actual.includes(file)))))throw Error('MCP suites are incomplete, duplicated or unregistered');
  return manifest;
}
export async function testMcp(){
  const development=process.argv[2]==='--development';
  if(process.argv.length!==2&&!development)throw Error('MCP acceptance takes no overrides');
  const manifest=verifyMcpSuites(!development),files=development?process.argv.slice(3):manifest.domain;
  if(!files.length || new Set(files).size!==files.length || files.some(file=>!manifest.domain.includes(file)))throw Error('Only registered MCP development suites are allowed');
  const digest=await featureSourceDigest('015');
  await mkdir(resolve('local-artifacts/015'),{recursive:true,mode:0o700});
  const directory=await mkdtemp(resolve('local-artifacts/015/tests-')),reportPath=join(directory,'report.json');
  await withMcpEnvironment(async environment=>{
    if(files.some(file=>file.includes("consumer-"))){if(development)await environment.start();else await environment.startProduction();}
    const run=await capturePartnerProcess(['node_modules/vitest/vitest.mjs','run',...files,'--reporter=json','--outputFile='+reportPath],240000,environment.signal);
    await writeFile(join(directory,'stdout.log'),run.stdout,{mode:0o600});await writeFile(join(directory,'stderr.log'),run.stderr,{mode:0o600});
    if(run.status!==0 || run.error)throw Error('MCP checks failed; inspect '+directory);
  });
  const passed=verifyPartnerTestReport(JSON.parse(await readFile(reportPath,'utf8')),files);
  if(await featureSourceDigest('015')!==digest)throw Error('MCP source changed during check');
  const summary={sourceDigest:digest,suites:files.length,passed,skipped:0,failed:0,acceptance:!development,productionRuntime:!development,
    actualSdkConsumer:!development,consumerSuites:files.filter(file=>file.includes('consumer-')).length,paidCalls:0,hostedProof:false};
  await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)testMcp().catch(error=>{console.error(error instanceof Error?error.message:'MCP check failed');process.exitCode=1;});
