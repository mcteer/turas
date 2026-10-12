import {preparePilotAssetPermissions} from './pilot-asset-permissions';
import { readFile,mkdir,mkdtemp,writeFile,readdir,cp } from 'node:fs/promises';
import { resolve,join,dirname } from 'node:path';
import {createHash} from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { withPilotEnvironment } from './pilot-environment';
import { capturePartnerProcess } from './test-partners';
import { executionUiDiscovery,verifyExecutionUiReport } from './execution-ui-report';
import {pilotImagePreparationSchema} from '../lib/contracts/pilot-images';
import {verifyArtifactImage,assertFreshArtifactSignatures} from '../lib/server/artifacts/scan';
import { pilotSource } from './pilot-source';
export async function checkPilotUi(){
 if(process.argv.length!==2)throw Error('Pilot UI acceptance takes no filters or target overrides');
 process.umask(0o077);
 const manifest=JSON.parse(await readFile('scripts/pilot-suites.json','utf8')).ui as {files:string[];projects:string[];cases:Record<string,string[]>;expectedCases:number};
 const actual=(await readdir('tests/ui')).filter(file=>/^pilot-.*\.spec\.ts$/.test(file)).map(file=>'tests/ui/'+file);
 if(JSON.stringify(actual.sort())!==JSON.stringify([...manifest.files].sort())||manifest.expectedCases!==40||manifest.projects.length!==4)throw Error('Incomplete pilot UI catalog');
 const preparationFile=process.env.TURAS_PILOT_UI_PREPARATION_FILE;if(!preparationFile)throw Error('Prepare actual local pilot images and set TURAS_PILOT_UI_PREPARATION_FILE');
 const preparation=pilotImagePreparationSchema.parse(JSON.parse(await readFile(preparationFile,'utf8')));
 const image=(kind:string)=>preparation.images.find(row=>row.kind===kind)!;
 for(const kind of ['parser','scanner'])await verifyArtifactImage(image(kind).localImageId,image(kind).localImageId.slice(7));
 for(const signature of preparation.scanner.signatures){const bytes=await readFile(join(dirname(preparationFile),'store/signatures',signature.name));if(bytes.length!==signature.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==signature.digest)throw Error('Scanner asset provenance differs');}
 const ocr=await readFile(join(dirname(preparationFile),'store/assets/eng.traineddata'));if(createHash('sha256').update(ocr).digest('hex')!==preparation.ocr.digest)throw Error('OCR asset provenance differs');
 await assertFreshArtifactSignatures(join(dirname(preparationFile),'store/signatures'));
 const source=await pilotSource();await mkdir('local-artifacts/016',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/016/ui-'));let passed=0;
 await withPilotEnvironment(async environment=>{
  process.env.TURAS_PILOT_PARSER_IMAGE=image('parser').localImageId;process.env.TURAS_PILOT_SCANNER_IMAGE=image('scanner').localImageId;
  await cp(join(dirname(preparationFile),'store/signatures'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
  await cp(join(dirname(preparationFile),'store/assets'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
  await preparePilotAssetPermissions(process.env.TURAS_ARTIFACT_STORE_ROOT!);
  await writeFile(join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:image('parser').localImageId,parserDigest:image('parser').localImageId.slice(7),scannerImage:image('scanner').localImageId,scannerDigest:image('scanner').localImageId.slice(7)}),{mode:0o600});
  process.env.TURAS_PILOT_UI_FIXTURE_READY='1';process.env.TURAS_UI_BASE_URL=environment.origin;
  await environment.startProductionNative();
  for(const project of manifest.projects){
   const args=['node_modules/@playwright/test/cli.js','test',...manifest.files,'--project='+project,'--reporter=json','--forbid-only','--retries=0'];
   const discovery=await capturePartnerProcess([...args,'--list'],60000,environment.signal);if(discovery.status!==0||discovery.error)throw Error('Pilot UI discovery failed');
   const discovered=JSON.parse(discovery.stdout);
   const titles:Record<string,string[]>={};function visit(rows:{specs?:{file:string;title:string}[];suites?:typeof rows}[]){for(const row of rows){for(const spec of row.specs??[]){const file='tests/ui/'+spec.file.replace(/^.*\//,'');(titles[file]??=[]).push(spec.title);}visit(row.suites??[]);}}visit(discovered.suites);
   if(manifest.files.some(file=>JSON.stringify([...(titles[file]??[])].sort())!==JSON.stringify([...manifest.cases[file]].sort())))throw Error('Pilot UI discovery differs from the frozen journeys');
   const cases=executionUiDiscovery(discovered,manifest.files,project);
   if(cases.length!==10)throw Error('Pilot UI catalog must discover ten cases per project');
   const run=await capturePartnerProcess([...args,'--output='+resolve(directory,project)],300000,environment.signal);
   await writeFile(resolve(directory,project+'.json'),run.stdout,{mode:0o600});await writeFile(resolve(directory,project+'.log'),run.stderr,{mode:0o600});
   if(run.status!==0||run.error)throw Error('Pilot UI failed; inspect '+directory);
   passed+=verifyExecutionUiReport(JSON.parse(run.stdout),cases).expected;console.info(JSON.stringify({project,passed:cases.length,skipped:0}));
  }
 },{deadlineMs:1800000});
 if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Pilot source changed during UI verification');
 if(passed!==manifest.expectedCases)throw Error('Incomplete UI execution');
 const summary={...source,passed,failed:0,skipped:0,projects:4,acceptance:true,scope:'owned local workspace and upload transport; no hosted or scanner acceptance'};
 await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkPilotUi().catch(error=>{console.error(error instanceof Error?error.message:'Pilot UI failed');process.exitCode=1;});
