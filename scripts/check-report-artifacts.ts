import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createHash} from 'node:crypto';import {mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {executiveArtifactFixtures} from '../tests/fixtures/reports/executive';import {runReportRenderer} from '../lib/server/reports/renderer-container';import {reportsSourceDigest} from './reports-source';
const execute=promisify(execFile),hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export async function checkReportArtifacts(image:string){
 const sourceDigest=await reportsSourceDigest();await mkdir(resolve('local-artifacts/009'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/009/artifact-check-'));
 const cases=[];
 for(const fixture of executiveArtifactFixtures()){
  const base=join(root,fixture.name),input=join(base,'input'),output=join(base,'output'),office=join(base,'office'),raster=join(base,'raster');
  for(const path of [input,output,office,raster])await mkdir(path,{recursive:true,mode:0o700});
  const inputBytes=JSON.stringify(fixture.document);await writeFile(join(input,'report.json'),inputBytes,{mode:0o600,flag:'wx'});
  await runReportRenderer({image,inputDirectory:input,outputDirectory:output});
  const structure=JSON.parse((await execute('python3',['report-renderer/validate.py',output],{timeout:30000,maxBuffer:65536})).stdout);
  await runReportRenderer({image,inputDirectory:output,outputDirectory:office,operation:'office_check'});
  const editing=JSON.parse(await readFile(join(office,'office.json'),'utf8'));
  const fonts=(await execute('pdffonts',[join(office,'slides.pdf')],{timeout:15000,maxBuffer:65536})).stdout.split('\n').slice(2).filter(line=>line.trim());
  if(!fonts.length || fonts.some(line=>!line.includes('Geist')))throw new Error('Office font substitution');
  for(const [file,prefix]of [[join(output,'report.pdf'),'pdf'],[join(office,'slides.pdf'),'slide']])await execute('pdftoppm',['-scale-to','1600','-png',file,join(raster,prefix)],{timeout:60000,maxBuffer:65536});
  const images=await Promise.all((await readdir(raster)).filter(file=>file.endsWith('.png')).sort().map(async file=>({path:`${fixture.name}/raster/${file}`,digest:hash(await readFile(join(raster,file)))})));
  if(images.length!==structure.pages+structure.slides)throw new Error('Incomplete raster coverage');
  cases.push({name:fixture.name,inputDigest:hash(inputBytes),renderer:JSON.parse(await readFile(join(output,'renderer.json'),'utf8')),structure,editing,images});
 }
 if(await reportsSourceDigest()!==sourceDigest)throw new Error('Artifact source changed during validation');
 const evidence={schemaVersion:'report-artifact-check-v1',sourceDigest,image,cases,visualReview:'pending',officeEnvironment:'LibreOffice; PowerPoint portability is untested'};
 const bytes=JSON.stringify(evidence,null,2)+'\n';await writeFile(join(root,'evidence.json'),bytes,{mode:0o600,flag:'wx'});
 return {directory:root,evidenceDigest:hash(bytes),pages:cases.reduce((count,item)=>count+item.structure.pages,0),slides:cases.reduce((count,item)=>count+item.structure.slides,0),status:'visual-review-required'};
}
export async function verifyArtifactVisualReview(directory:string){
 const evidenceBytes=await readFile(join(directory,'evidence.json')),evidence=JSON.parse(evidenceBytes.toString());const review=JSON.parse(await readFile(join(directory,'review.json'),'utf8'));
 if(evidence.sourceDigest!==await reportsSourceDigest() || review.evidenceDigest!==hash(evidenceBytes) || review.status!=='passed' || review.assertions?.join('|')!=='All Pages and Slides Inspected|No Clipping or Overlap|Readable Fonts and Contrast|Native Objects Verified')throw new Error('Current complete artifact visual review required');
 const expected=evidence.cases.flatMap((item:any)=>item.images).sort((a:any,b:any)=>a.path.localeCompare(b.path));
 if(JSON.stringify(review.images)!==JSON.stringify(expected))throw new Error('Visual review omitted images');
 for(const image of expected){if(!/^[a-z0-9-]+\/raster\/(?:pdf|slide)-\d+\.png$/.test(image.path) || hash(await readFile(join(directory,image.path)))!==image.digest)throw new Error('Reviewed raster changed');}
  const result={gate:'reports-artifacts',sourceDigest:evidence.sourceDigest,evidenceDigest:review.evidenceDigest,pairs:evidence.cases.length,rasters:expected.length,status:'passed',officeEnvironment:evidence.officeEnvironment};
  await writeFile(join(directory,'completed.json'),JSON.stringify(result),{mode:0o600});
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const operation=process.argv[2]==='--verify-review'?verifyArtifactVisualReview(resolve(process.argv[3])):checkReportArtifacts(process.env.TURAS_REPORT_RENDERER_IMAGE??'');
 operation.then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Artifact gate failed; inspect private artifact evidence');process.exitCode=1;});
}
