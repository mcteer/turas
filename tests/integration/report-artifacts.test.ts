import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
import {executiveArtifactFixtures} from '../fixtures/reports/executive';
import {runReportRenderer} from '../../lib/server/reports/renderer-container';
const execute=promisify(execFile);let root:string,image:string;
async function render(name:string,document:unknown){const base=join(root,name),input=join(base,'input'),output=join(base,'output');await mkdir(input,{recursive:true,mode:0o700});await mkdir(output,{mode:0o700});await writeFile(join(input,'report.json'),JSON.stringify(document),{mode:0o600});await runReportRenderer({image,inputDirectory:input,outputDirectory:output});return {input,output,base};}
describe('actual isolated executive artifacts',()=>{
 beforeAll(async()=>{await requireOwnedReportsDatabase();root=await mkdtemp(join(tmpdir(),'turas-owned-009-artifacts-'));image=(await execute('docker',['image','inspect','turas-report-renderer:009-executive-v1','--format','{{.Id}}'],{timeout:10000,maxBuffer:4096})).stdout.trim();expect(image).toMatch(/^sha256:[a-f0-9]{64}$/);});
 afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
 for(const fixture of executiveArtifactFixtures())it(`renders ${fixture.name} with native editable objects and static fonts`,async()=>{
  const {output,base}=await render(fixture.name,fixture.document);
  const result=JSON.parse(await readFile(join(output,'renderer.json'),'utf8'));expect(result.pages).toBeGreaterThan(0);expect(result.pages).toBeLessThanOrEqual(40);expect(result.slides).toBeLessThanOrEqual(40);
  const checked=JSON.parse((await execute('python3',['report-renderer/validate.py',output],{timeout:30000,maxBuffer:65536})).stdout);expect(checked.approvedEmbeddedFonts).toBe(true);expect(checked.nativeTables).toBeGreaterThan(0);expect(checked.nativeCharts).toBe(fixture.name==='empty-unknown'?0:1);
  const office=join(base,'office');await mkdir(office,{mode:0o700});await runReportRenderer({image,inputDirectory:output,outputDirectory:office,operation:'office_check'});
  expect(JSON.parse(await readFile(join(office,'office.json'),'utf8')).nativeSaveReopen).toEqual({text:true,table:true,chart:fixture.name==='empty-unknown'?'not_applicable':true});
  const fonts=(await execute('pdffonts',[join(office,'slides.pdf')],{timeout:15000,maxBuffer:65536})).stdout.split('\n').slice(2).filter(line=>line.trim());expect(fonts.length).toBeGreaterThan(0);expect(fonts.every(line=>line.includes('Geist'))).toBe(true);
 });
 it('blocks unsupported glyphs before writing releasable files',async()=>{const doc=structuredClone(executiveArtifactFixtures()[0].document);doc.title='Unsupported \u{10ffff}';await expect(render('missing-glyph',doc)).rejects.toThrow();expect(await readdir(join(root,'missing-glyph/output'))).toEqual([]);});
 it('blocks excessive slide count before writing releasable files',async()=>{const doc=structuredClone(executiveArtifactFixtures()[0].document);doc.sections[0].blocks=Array.from({length:50},()=>({type:'gap',text:'W'.repeat(1000),citations:[]}));await expect(render('overflow',doc)).rejects.toThrow();expect(await readdir(join(root,'overflow/output'))).toEqual([]);});
 it('rejects artifact bytes changed after renderer receipt',async()=>{const {output}=await render('tampering',executiveArtifactFixtures()[0].document);await writeFile(join(output,'report.pdf'),'changed');await expect(execute('python3',['report-renderer/validate.py',output],{timeout:15000,maxBuffer:4096})).rejects.toThrow();});
});
