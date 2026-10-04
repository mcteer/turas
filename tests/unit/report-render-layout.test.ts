import {describe,it,expect} from 'vitest';
import {executiveArtifactFixtures} from '../fixtures/reports/executive';
import {planExecutiveSlides} from '../../report-renderer/layout';
import {validateReportPeriod} from '../../lib/reports/periods';
describe('bounded executive artifact layout inputs',()=>{
 it('has six actual render cases across all audiences and both 92-day quarter shapes',()=>{
  const fixtures=executiveArtifactFixtures();expect(fixtures).toHaveLength(6);expect(new Set(fixtures.map(item=>item.document.audience)).size).toBe(3);
  for(const {document}of fixtures)expect(validateReportPeriod(document.kind,document.period.fromDate,document.period.toDate,document.timezone,document.partial,document.asOf).days).toBeLessThanOrEqual(92);
  expect(fixtures.filter(item=>item.document.kind==='quarterly').map(item=>validateReportPeriod(item.document.kind,item.document.period.fromDate,item.document.period.toDate,item.document.timezone,item.document.partial,item.document.asOf).days)).toEqual([92,92]);
 });
 it('keeps complete content and native table/chart plans under the 40-slide limit',()=>{
  for(const {document}of executiveArtifactFixtures()){
   const slides=planExecutiveSlides(document);expect(slides.length).toBeLessThanOrEqual(40);
   const text=slides.filter(slide=>slide.type==='text').flatMap(slide=>slide.paragraphs).join(' ');
   for(const section of document.sections)for(const block of section.blocks)expect(text).toContain(block.text);
   expect(slides.some(slide=>slide.type==='table')).toBe(true);
   if(document.metrics.some(metric=>metric.value!==null))expect(slides.some(slide=>slide.type==='chart')).toBe(true);
  }
 });
 it('paginates many short paragraphs before they overlap the footer',()=>{
  const doc=executiveArtifactFixtures().find(item=>item.name==='long-continuations')!.document;
  for(const slide of planExecutiveSlides(doc).filter(item=>item.type==='text'))expect(slide.paragraphs.reduce((lines,text)=>lines+Math.ceil([...text].length/85)+1,0)).toBeLessThanOrEqual(12);
  for(let index=0;index<4;index++)doc.metrics.push({label:`Overflow Measure ${index}`,value:'1.00',unit:'hours',reason:null,citations:['S1']});
  expect(()=>planExecutiveSlides(doc)).toThrow();
 });
 it('blocks overflow and keeps unknown values out of numeric charts',()=>{
  const empty=executiveArtifactFixtures().find(item=>item.name==='empty-unknown')!.document;expect(planExecutiveSlides(empty).some(slide=>slide.type==='chart')).toBe(false);
  const normal=executiveArtifactFixtures()[0].document;normal.sections[0].blocks=Array.from({length:50},()=>({type:'gap',text:'W'.repeat(1000),citations:[]}));expect(()=>planExecutiveSlides(normal)).toThrow();
 });
});
