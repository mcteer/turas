import {describe,it,expect} from 'vitest';
import {validateReportDocument,WEEKLY_SECTIONS} from '../../lib/reports/document';
import {prepareReportMail} from '../../lib/server/reports/mail-content';
const document=()=>({schemaVersion:'reports-v1',projectionVersion:'report-projection-v1',formulaVersion:'report-metrics-v1',templateVersion:'weekly-status-v1',kind:'weekly',title:'Synthetic Weekly Update',audience:'delivery',classification:'Synthetic Delivery Report',timezone:'UTC',period:{fromDate:'2026-09-21',toDate:'2026-09-27'},asOf:'2026-10-03T12:00:00Z',partial:false,ownerLabel:'Unknown owner',sponsorLabel:'Unknown sponsor',sections:WEEKLY_SECTIONS.map(heading=>({heading,blocks:[{type:'gap',text:'No accepted input',citations:[]}]})),metrics:[],citations:[],gaps:[],annotations:[],correctionOf:null});
describe('source-bound structured report and mail',()=>{
 it('keeps all required sections and rejects unsupported factual blocks',()=>{
  expect(validateReportDocument(document()).sections).toHaveLength(8);
  const missing=document();missing.sections.pop();expect(()=>validateReportDocument(missing)).toThrow();
  const unsupported=document();unsupported.sections[0].blocks[0].type='fact';expect(()=>validateReportDocument(unsupported)).toThrow();
 });
 it('rejects unknown fields, excess annotations and oversized mail',()=>{
  expect(()=>validateReportDocument({...document(),approved:true})).toThrow();
  expect(()=>validateReportDocument({...document(),annotations:Array(21).fill('annotation')})).toThrow();
  const oversized=document();oversized.sections[0].blocks=Array.from({length:40},()=>({type:'gap',text:'&'.repeat(16000),citations:[]}));
  expect(()=>prepareReportMail(validateReportDocument(oversized))).toThrow();
 });
 it('escapes markup and distinguishes annotations from accepted facts',()=>{
  const report=validateReportDocument({...document(),annotations:['<img src="https://example.com/pixel">']});
  const mail=prepareReportMail(report);expect(mail.html).not.toContain('<img');expect(mail.html).toContain('&lt;img');expect(mail.plainText).toContain('not an accepted fact');
 });
 it('retains accountability and metric citations in both mail formats',()=>{
  const report=validateReportDocument({...document(),ownerLabel:'Owner explicitly unknown',sponsorLabel:'Sponsor explicitly unknown',citations:[{label:'S1',description:'Synthetic approved aggregate time'}],metrics:[{label:'Approved Actual',value:'1.00',unit:'hours',reason:null,citations:['S1']}]});
  const mail=prepareReportMail(report);for(const text of ['Owner explicitly unknown','Sponsor explicitly unknown','1.00 hours','[S1]']){expect(mail.html).toContain(text);expect(mail.plainText).toContain(text);}
 });
});
