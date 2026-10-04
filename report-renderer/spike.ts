import { chromium } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.argv[2] ?? '/output';
await mkdir(output, {recursive:true});
const fontRoot = process.env.TURAS_RENDER_FONT_ROOT ?? '/renderer/fonts';
const regular = await readFile(join(fontRoot,'Geist-Regular.ttf'));
const bold = await readFile(join(fontRoot,'Geist-Bold.ttf'));
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  await page.route('**/*', route=>route.abort());
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic Executive Review</title><style>
  @font-face{font-family:Geist;src:url(data:font/ttf;base64,${regular.toString('base64')})} @font-face{font-family:Geist;font-weight:700;src:url(data:font/ttf;base64,${bold.toString('base64')})}
  @page{size:A4;margin:20mm}body{font-family:Geist;font-size:12pt;color:#171717}h1{font-size:30pt}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}footer{margin-top:40px;font-size:9pt;color:#555}
  </style></head><body><p>SYNTHETIC PREVIEW · September 2026</p><h1>Executive Review</h1><p>Measured delivery with explicit review and evidence.</p><h2>Delivery Portfolio</h2><table><thead><tr><th>Measure</th><th>Minutes</th></tr></thead><tbody><tr><td>Approved actual</td><td>60</td></tr><tr><td>Remaining estimate</td><td>90</td></tr></tbody></table><footer>Report renderer validation · No customer data · source S1</footer></body></html>`,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:join(output,'spike.pdf'),format:'A4',tagged:true,outline:true,printBackground:true,preferCSSPageSize:true});
} finally { await browser.close(); }
const deck = new PptxGenJS();
deck.layout='LAYOUT_WIDE'; deck.author='Turas'; deck.subject='Synthetic renderer acceptance'; deck.title='Synthetic Executive Review'; deck.company='Turas'; deck.lang='en-US';
deck.theme={headFontFace:'Geist',bodyFontFace:'Geist',lang:'en-US'};
const slide=deck.addSlide();slide.background={color:'FAFAFA'};
slide.addText('SYNTHETIC PREVIEW · September 2026',{x:0.7,y:0.35,w:12,h:0.35,fontFace:'Geist',fontSize:12,color:'666666'});
slide.addText('Executive Review',{x:0.7,y:0.9,w:12,h:0.6,fontFace:'Geist',fontSize:32,bold:true,color:'171717'});
slide.addTable([['Measure','Minutes'],['Approved actual','60'],['Remaining estimate','90']],{x:0.7,y:1.8,w:11.9,h:1.25,fontFace:'Geist',fontSize:18,border:{color:'DDDDDD',pt:0.5},margin:0.08,fill:'FFFFFF',color:'171717'});
slide.addChart(deck.ChartType.bar,[{name:'Minutes',labels:['Approved actual','Remaining estimate'],values:[60,90]}],{x:0.7,y:3.25,w:11.9,h:3,fontFace:'Geist',catAxisLabelFontFace:'Geist',catAxisLabelFontSize:16,valAxisLabelFontFace:'Geist',valAxisLabelFontSize:14,showValue:true,dataLabelFormatCode:'0',dataLabelPosition:'outEnd',chartColors:['171717'],showLegend:false,showCatName:false,showTitle:false});
slide.addText('Editable native text, table and chart · source S1',{x:0.7,y:6.8,w:12,h:0.3,fontFace:'Geist',fontSize:12,color:'666666'});
await deck.writeFile({fileName:join(output,'spike.pptx')});
await writeFile(join(output,'spike.json'),JSON.stringify({schema:'renderer-spike-v1',pdf:'spike.pdf',slides:'spike.pptx',values:[60,90],font:'Geist',synthetic:true})+'\n');
