import {chromium} from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import {mkdir,readFile,stat,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {validateReportDocument} from '../lib/reports/document';
import {validateReportPeriod} from '../lib/reports/periods';
import {canonicalReportJson} from '../lib/reports/canonical';
import {reportFontSupportsText} from '../lib/reports/fonts';
import {renderExecutiveHTML} from '../report-templates/executive';
import {planExecutiveSlides} from './layout';
const execute=promisify(execFile),hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function strings(value:unknown):string[]{if(typeof value==='string')return[value];if(Array.isArray(value))return value.flatMap(strings);return value && typeof value==='object'?Object.values(value).flatMap(strings):[];}
export async function renderExecutivePair(inputPath:string,output:string){
 if((await stat(inputPath)).size>1048576)throw new Error('Renderer input exceeds its limit');
 const input=await readFile(inputPath),document=validateReportDocument(JSON.parse(input.toString('utf8')));
 if(document.kind==='weekly')throw new Error('Executive report required');
 validateReportPeriod(document.kind,document.period.fromDate,document.period.toDate,document.timezone,document.partial,document.asOf);
 const root=resolve(import.meta.dirname,'..'),manifest=JSON.parse(await readFile(join(root,'report-templates/brand-manifest.json'),'utf8'));
 for(const asset of manifest.assets){if(!/^report-templates\/(?:assets|fonts)\/[A-Za-z0-9._-]+\.(?:png|svg|ttf|otf)$|^report-templates\/[A-Za-z0-9._-]+\.ts$/.test(asset.path) || hash(await readFile(join(root,asset.path)))!==asset.sha256)throw new Error('Renderer brand bytes changed');}
 const regular=await readFile(join(root,'report-templates/fonts/Geist-Regular.ttf')),bold=await readFile(join(root,'report-templates/fonts/Geist-Bold.ttf')),logo=await readFile(join(root,'report-templates/assets/vercel-logotype.png'));
 const text=[...new Set(strings(document).flatMap(value=>[...value]))].join('');if(!reportFontSupportsText(regular,text) || !reportFontSupportsText(bold,text))throw new Error('Approved font does not support report text');
 const planned=planExecutiveSlides(document);await mkdir(output,{recursive:true,mode:0o700});
 if((await readdir(output)).some(name=>name!=='.turas-report-scratch.json'))throw new Error('Empty owned render directory required');
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());
  await page.setContent(renderExecutiveHTML(document,{regular:regular.toString('base64'),bold:bold.toString('base64')},logo.toString('base64')),{waitUntil:'load'});
  await page.evaluate(()=>globalThis.document.fonts.ready);await page.pdf({path:join(output,'report.pdf'),format:'A4',tagged:true,outline:true,printBackground:true,preferCSSPageSize:true});
 }finally{await browser.close();}
 const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';deck.author='Turas';deck.company='Turas';deck.subject=document.classification;deck.title=document.title;deck.theme={headFontFace:'Geist',bodyFontFace:'Geist'};
 for(const [index,item]of planned.entries()){
  const slide=deck.addSlide();slide.background={color:'FFFFFF'};
  slide.addImage({data:'data:image/png;base64,'+logo.toString('base64'),x:0.7,y:0.4,w:1.15,h:0.25});
  slide.addText(document.classification.toUpperCase(),{x:7.1,y:0.4,w:5.5,h:0.25,fontFace:'Geist',fontSize:9,color:'666666',align:'right',margin:0});
  slide.addShape(deck.ShapeType.line,{x:0.7,y:0.95,w:11.9,h:0,line:{color:'E5E5E5',width:0.5}});
  if(item.type==='cover'){
   slide.addText(document.title,{x:0.7,y:1.3,w:11.9,h:2.2,fontFace:'Geist',fontSize:document.title.length>80?24:36,bold:true,color:'171717',margin:0,breakLine:false,valign:'top'});
   slide.addText([`${document.period.fromDate} to ${document.period.toDate} - ${document.timezone}${document.partial?' - Partial Period':''}${document.correctionOf?' - Reviewed Correction':''}`,`Audience: ${document.audience.replaceAll('_',' ')}`,`Accountable Owner: ${document.ownerLabel}`,`Executive Sponsor: ${document.sponsorLabel}`,`Captured ${document.asOf}`].join('\n\n'),{x:0.7,y:3.5,w:11.9,h:2.9,fontFace:'Geist',fontSize:12,color:'555555',margin:0,valign:'top',breakLine:false});
  }else{
   slide.addText(item.heading,{x:0.7,y:1.25,w:11.9,h:0.65,fontFace:'Geist',fontSize:28,bold:true,color:'171717',margin:0,valign:'top'});
   if(item.type==='text')slide.addText(item.paragraphs.join('\n\n'),{x:0.7,y:2.15,w:11.9,h:4.3,fontFace:'Geist',fontSize:18,color:'333333',margin:0,valign:'top',breakLine:false});
   if(item.type==='table')slide.addTable(item.rows.map(row=>row.map(text=>({text}))),{x:0.7,y:2.05,w:11.9,colW:[8.2,3.7],rowH:0.8,fontFace:'Geist',fontSize:14,color:'171717',fill:{color:'FFFFFF'},margin:0.08,border:{color:'E5E5E5',pt:0.5},autoPage:false});
   if(item.type==='chart')slide.addChart(deck.ChartType.bar,[{name:'Reviewed Hours',labels:item.labels,values:item.values}],{x:0.7,y:2.0,w:11.9,h:4.35,fontFace:'Geist',catAxisLabelFontFace:'Geist',catAxisLabelFontSize:12,valAxisLabelFontFace:'Geist',valAxisLabelFontSize:10,showValue:true,dataLabelFontFace:'Geist',dataLabelFontSize:10,dataLabelFormatCode:'0.00',dataLabelPosition:'outEnd',chartColors:['171717'],showLegend:false,showTitle:false});
  }
  slide.addText(`${document.templateVersion} - ${document.formulaVersion}`,{x:0.7,y:6.85,w:8,h:0.25,fontFace:'Geist',fontSize:9,color:'666666',margin:0});
  slide.addText(`${index+1} / ${planned.length}`,{x:10.6,y:6.85,w:2,h:0.25,fontFace:'Geist',fontSize:9,color:'666666',align:'right',margin:0});
  slide.addNotes('Vercel is a trademark of Vercel Inc. Install Geist Sans before editing. Font embedding is not asserted.');
 }
 await deck.writeFile({fileName:join(output,'report.pptx')});
 const {stdout}=await execute('pdfinfo',[join(output,'report.pdf')],{timeout:15000,maxBuffer:65536}),pages=Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
 const pdf=await readFile(join(output,'report.pdf')),pptx=await readFile(join(output,'report.pptx'));
 if(!Number.isInteger(pages) || pages<1 || pages>40 || pdf.length>10485760 || pptx.length>10485760 || pdf.length+pptx.length>15728640)throw new Error('Artifact layout or byte limits exceeded');
 const rendererCodeDigest=hash(canonicalReportJson(await Promise.all(['report-renderer/layout.ts','report-renderer/render.ts','report-renderer/validate.py'].map(async path=>({path,sha256:hash(await readFile(join(root,path)))})))));
 const result={rendererCodeDigest,schemaVersion:'report-render-result-v1',documentDigest:hash(canonicalReportJson(document)),brandDigest:hash(canonicalReportJson(manifest)),fontDigests:{regular:hash(regular),bold:hash(bold)},pages,slides:planned.length,pdf:{digest:hash(pdf),sizeBytes:pdf.length},pptx:{digest:hash(pptx),sizeBytes:pptx.length},editingRequirement:manifest.editingRequirement};
 await writeFile(join(output,'renderer.json'),JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)renderExecutivePair(process.argv[2],process.argv[3]).then(()=>console.log('Executive artifact pair rendered')).catch(()=>{console.error('Executive rendering failed; protected diagnostics withheld');process.exitCode=1;});
