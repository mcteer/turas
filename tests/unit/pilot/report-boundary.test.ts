import {expect,it} from 'vitest';
import {maximumPilotReportAnnotations} from '../../../scripts/pilot-report-boundary';
import {executiveArtifactFixtures} from '../../fixtures/reports/executive';
import {planExecutiveSlides} from '../../../report-renderer/layout';
import {validateReportDocument} from '../../../lib/reports/document';
it('reaches the normal forty-slide content boundary using legal review annotations without changing accepted facts',()=>{
 for(const {document} of executiveArtifactFixtures().filter(row=>row.name!=='long-continuations')){
  const original=JSON.stringify(document),boundary=maximumPilotReportAnnotations(document),candidate=validateReportDocument({...document,annotations:boundary.annotations});expect(planExecutiveSlides(candidate)).toHaveLength(40);expect(JSON.stringify(document)).toBe(original);expect(candidate.sections).toEqual(document.sections);expect(candidate.metrics).toEqual(document.metrics);expect(candidate.citations).toEqual(document.citations);expect(boundary.annotations.length).toBeLessThanOrEqual(20);expect(boundary.annotations.every(text=>text.length>0&&text.length<=2000)).toBe(true);expect(boundary.structuredInputBytes).toBeLessThanOrEqual(1048576);expect(boundary.maximumGeneratedByteBoundaryVerified).toBe(false);
 }
});
it('refuses weekly and already excessive normal layouts before any paid render',()=>{
 const document=executiveArtifactFixtures()[0].document;expect(()=>maximumPilotReportAnnotations({...document,kind:'weekly'})).toThrow();
 const excessive={...document,sections:document.sections.map(section=>({...section,blocks:Array.from({length:10},()=>({type:'note',text:'Synthetic readable boundary '.repeat(100),citations:[]}))}))};expect(()=>maximumPilotReportAnnotations(excessive)).toThrow('already exceeds');
});
