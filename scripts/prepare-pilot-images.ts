import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,cp,lstat,writeFile,readFile,readdir,rm,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pilotImagePreparationSchema} from '../lib/contracts/pilot-images';
import {assertFreshArtifactSignatures} from '../lib/server/artifacts/scan';

const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw Error('Use --output with a new private directory under local-artifacts/016');
const output=resolve(args[1]),parent=resolve('local-artifacts/016');if(output!==args[1]||!output.startsWith(parent+'/')||output.slice(parent.length+1).includes('/'))throw Error('An owned direct child preparation directory is required');
await mkdir(parent,{recursive:true,mode:0o700});if((await lstat(parent)).isSymbolicLink())throw Error('Unsafe preparation parent');
await mkdir(output,{mode:0o700});
const context=join(output,'context'),store=join(output,'store'),owner=randomUUID().replaceAll('-',''),prefix='turas-pilot-016-'+owner;
const env:NodeJS.ProcessEnv=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','DOCKER_HOST','DOCKER_CONTEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const docker=(argv:string[],capture=false)=>execFileSync('docker',argv,{cwd:context,env,timeout:1200000,encoding:'utf8',maxBuffer:1048576,stdio:capture?'pipe':'inherit'});
async function safeCopy(source:string,target:string){const info=await lstat(source);if(info.isSymbolicLink())throw Error('Build inputs cannot be symlinks');if(info.isDirectory()){await mkdir(target,{recursive:true,mode:0o755});for(const name of await readdir(source)){if(['node_modules','dist','.git','.eve','.next','coverage'].includes(name)||name.startsWith('.env'))continue;await safeCopy(join(source,name),join(target,name));}}else if(info.isFile()){await mkdir(resolve(target,'..'),{recursive:true,mode:0o755});await cp(source,target);await chmod(target,0o644);}else throw Error('Unexpected build input');}
async function readableBuildDirectories(path:string){const stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Unsafe build directory');if(stat.isDirectory()){await chmod(path,0o755);for(const name of await readdir(path))await readableBuildDirectories(join(path,name));}}
let success=false;
try{
 await mkdir(context,{mode:0o700});for(const path of ['infra/artifacts','infra/pilot','packages/artifact-extractor','report-renderer','report-templates','lib/reports','lib/contracts/http.ts','lib/server/operations/code-version.ts'])await safeCopy(resolve(path),join(context,path));
 // Only static source files enter the build context. Never copy application env, workflow data or original stores.
 await mkdir(store,{mode:0o700});const sourceConfig=JSON.parse(await readFile('infra/artifacts/images.json','utf8'));const signaturesRoot=join(store,'signatures');await mkdir(signaturesRoot,{mode:0o777});await chmod(signaturesRoot,0o777);
 const freshclam=prefix+'-freshclam';try{docker(['run','--rm','--name',freshclam,'--label','turas.pilot.image-owner='+owner,'--network','bridge','--user','0:0','--mount','type=bind,src='+signaturesRoot+',dst=/var/lib/clamav','--entrypoint','freshclam',sourceConfig.scannerBase,'--stdout']);}finally{await chmod(signaturesRoot,0o755);try{const label=docker(['inspect','--format','{{index .Config.Labels "turas.pilot.image-owner"}}',freshclam],true).trim();if(label!==owner)throw Error('Preparation container ownership changed');docker(['rm','--force',freshclam],true);}catch(error){if(!/No such (?:object|container)/i.test((error as {stderr?:string}).stderr??''))throw Error('Preparation cleanup unverified');}}
 await mkdir(join(store,'assets'),{mode:0o755});const response=await fetch(sourceConfig.englishOcrAsset.url,{signal:AbortSignal.timeout(60000)});if(!response.ok||!response.body)throw Error('OCR preparation unavailable');let total=0;const chunks:Buffer[]=[];for await(const chunk of response.body){const bytes=Buffer.from(chunk);total+=bytes.length;if(total>10485760)throw Error('OCR asset exceeds limit');chunks.push(bytes);}await writeFile(join(store,'assets/eng.traineddata'),Buffer.concat(chunks,total),{mode:0o644,flag:'wx'});
 const signatureVersion=await assertFreshArtifactSignatures(join(store,'signatures'));const signatureFiles=(await readdir(join(store,'signatures'))).filter(name=>/^(main|daily|bytecode)\.(cvd|cld)$/.test(name));
 const signatures=[];for(const name of signatureFiles){const bytes=await readFile(join(store,'signatures',name));signatures.push({name,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')});}
 const ocr=await readFile(join(store,'assets/eng.traineddata'));const ocrDigest=createHash('sha256').update(ocr).digest('hex');if(ocrDigest!==sourceConfig.englishOcrAsset.sha256)throw Error('OCR provenance mismatch');
 await safeCopy(join(store,'signatures'),join(context,'signatures'));await safeCopy(join(store,'assets'),join(context,'assets'));
 // Explicit chmod is necessary: an operator umask of 077 must not make image assets root-only.
 for(const name of await readdir(context))await readableBuildDirectories(join(context,name));
 const images=[];for(const [kind,baseRecipe] of [['scanner','infra/artifacts/scanner.Dockerfile'],['parser','infra/artifacts/parser.Dockerfile'],['renderer','report-renderer/Dockerfile']]){
  const base=prefix+'-'+kind+'-base:local',tag=prefix+'-'+kind+':local';
  docker(['build','--platform','linux/amd64','--file',baseRecipe,'--tag',base,'.']);docker(['build','--platform','linux/amd64','--file','infra/pilot/'+kind+'.Dockerfile','--build-arg','PREPARED_BASE='+base,'--tag',tag,'.']);
  const observed=JSON.parse(docker(['image','inspect',tag],true))[0];if(observed.Architecture!=='amd64'||observed.Os!=='linux'||!/^sha256:[a-f0-9]{64}$/.test(observed.Id))throw Error('Image platform or identity mismatch');
  images.push({kind,localTag:tag,localImageId:observed.Id,architecture:observed.Architecture,recipeDigest:createHash('sha256').update(await readFile(join(context,'infra/pilot/'+kind+'.Dockerfile'))).digest('hex'),baseRecipeDigest:createHash('sha256').update(await readFile(join(context,baseRecipe))).digest('hex'),hostedOci:null});
 }
 const parser=images.find(image=>image.kind==='parser')!,scanner=images.find(image=>image.kind==='scanner')!;await writeFile(join(store,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:parser.localImageId,parserDigest:parser.localImageId.slice(7),scannerImage:scanner.localImageId,scannerDigest:scanner.localImageId.slice(7)})+'\n',{mode:0o600,flag:'wx'});
 await writeFile(join(output,'preparation.json'),JSON.stringify(pilotImagePreparationSchema.parse({contract:'pilot-image-preparation-v1',preparedAt:new Date().toISOString(),owner,platform:'linux/amd64',images,scanner:{engine:'ClamAV 1.5.4',signatureVersion,signatures},ocr:{digest:ocrDigest,license:sourceConfig.englishOcrAsset.license,source:sourceConfig.englishOcrAsset.url},hostedVerified:false}),null,2)+'\n',{mode:0o600,flag:'wx'});success=true;
}finally{await rm(context,{recursive:true,force:true});if(!success)await writeFile(join(output,'failed.json'),JSON.stringify({contract:'pilot-image-preparation-v1',owner,completed:false,hostedVerified:false})+'\n',{mode:0o600,flag:'wx'});}
