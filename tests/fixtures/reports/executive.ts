import {EXECUTIVE_SECTIONS,validateReportDocument,type ReportDocument} from '../../../lib/reports/document';
/** Explicitly synthetic renderer inputs. These are not domain approval or hosted evidence. */
export function executiveArtifactFixtures():Array<{name:string;document:ReportDocument}>{
 const variants=[
  {name:'monthly-multi',kind:'monthly',from:'2026-09-01',to:'2026-09-30',audience:'delivery'},
  {name:'quarter-q3-92',kind:'quarterly',from:'2026-07-01',to:'2026-09-30',audience:'leadership'},
  {name:'quarter-q4-year',kind:'quarterly',from:'2025-10-01',to:'2025-12-31',audience:'account_team'},
  {name:'empty-unknown',kind:'monthly',from:'2026-09-01',to:'2026-09-30',audience:'delivery'},
  {name:'partial-correction',kind:'monthly',from:'2026-10-01',to:'2026-10-31',audience:'leadership'},
  {name:'long-continuations',kind:'monthly',from:'2026-09-01',to:'2026-09-30',audience:'account_team'},
 ] as const;
 return variants.map(variant=>{
  const empty=variant.name==='empty-unknown',long=variant.name==='long-continuations',partial=variant.name==='partial-correction';
  const metrics=(empty?[['Period Actual',null],['Remaining Estimate',null],['Closing Forecast',null]]:[['Period Actual','1.00'],['Cumulative Actual','2.00'],['Remaining Estimate','1.50'],['Closing Forecast','3.50'],['Reviewed Effort Budget','4.00'],['Forecast Variance','-0.50']]).map(([label,value])=>({label:label!,value,unit:'hours',reason:value===null?'No reviewed comparable quantity in this synthetic fixture':null,citations:value===null?[]:['S1']}));
  if(long)for(let index=0;index<14;index++)metrics.push({label:`Synthetic Delivery Measure ${index+1}`,value:String(index+1)+'.00',unit:'hours',reason:null,citations:['S1']});
  const sections=EXECUTIVE_SECTIONS.map((heading,index)=>({heading,blocks:empty?[{type:'gap' as const,text:'No currently accepted input is available for this section.',citations:[]}]:Array.from({length:long?4:1},(_,block)=>({type:index===5?'proposal' as const:'fact' as const,text:long?`Synthetic reviewed section ${index+1}, item ${block+1}. `+Array.from({length:30},(_,word)=>`readable${word+1}`).join(' '):`Synthetic reviewed ${heading.toLowerCase()} input. Explicit evidence and unknown states remain visible.`,citations:['S1']}))}));
  return {name:variant.name,document:validateReportDocument({schemaVersion:'reports-v1',projectionVersion:'report-projection-v1',formulaVersion:'report-metrics-v1',templateVersion:'executive-review-v1',kind:variant.kind,title:'Synthetic Executive Review',audience:variant.audience,classification:'Synthetic Delivery Report',timezone:'UTC',period:{fromDate:variant.from,toDate:variant.to},asOf:'2026-10-03T12:00:00Z',partial,ownerLabel:'Synthetic accountable delivery owner',sponsorLabel:'Executive sponsor not specified in reviewed inputs',sections,metrics,citations:empty?[]:[{label:'S1',description:'Explicit synthetic renderer evidence; no real customer data'}],gaps:empty?sections.map(section=>section.blocks[0].text):[],annotations:partial?['Correction sample: this annotation is not an accepted fact.']:[],correctionOf:partial?'2d42c9f8-8599-4dbe-b234-b527c621abbb':null})};
 });
}
