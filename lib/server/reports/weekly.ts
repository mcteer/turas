import {formatReportHours} from '../../reports/calculations';
import {WEEKLY_SECTIONS,validateReportDocument,type ReportDocument} from '../../reports/document';
import {reportProfileBlocks} from './profile-content';
import type {captureReportSnapshot} from './snapshots';
type Snapshot=Awaited<ReturnType<typeof captureReportSnapshot>>;
export function composeWeeklyReport(snapshot:Snapshot,annotations:string[]=[],correctionOf:string|null=null):ReportDocument{
 const labels=new Map(snapshot.dependencies.map((source,index)=>[`${source.kind}:${source.revisionId}`,`S${index+1}`]));
 const sections:ReportDocument['sections']=WEEKLY_SECTIONS.map(heading=>({heading,blocks:[]}));
 const metrics:ReportDocument['metrics']=[];
 const gap=(index:number,text:string)=>sections[index].blocks.push({type:'gap',text,citations:[]});
 const fact=(index:number,text:string,refs:string[])=>sections[index].blocks.push({type:'fact',text,citations:refs});
 for(const record of snapshot.records){
  const label=labels.get(`execution_record:${record.revisionId}`);if(!label)continue;
  const title=typeof record.content.title==='string'?record.content.title:'Reviewed delivery update',narrative=typeof record.content.narrative==='string'?record.content.narrative:'',text=`${title} (${record.eventDate}): ${narrative}`;
  if(record.kind==='activity' && record.content.subtype!=='milestone_plan')fact(1,text,[label]);
  if(record.content.subtype==='milestone_plan')sections[2].blocks.push({type:'proposal',text,citations:[label]});
  if(['scope_change','estimate'].includes(record.kind))fact(3,text,[label]);
  if(['raid','decision'].includes(record.kind))fact(4,text,[label]);
  if(['outcome','handoff','closeout'].includes(record.kind))fact(6,text,[label]);
 }
 for(const measurement of snapshot.measurements??[]){
  const input=measurement.input,label=labels.get(`execution_record:${input.revisionId}`);if(!label)continue;
  const name=input.measure??'Unmeasured Outcome',window=input.measurementStart && input.measurementEnd?` (${input.measurementStart} to ${input.measurementEnd})`:'';
  for(const [title,value,unit,reason] of [
   ['Current',input.current,input.unit??'unknown',measurement.reason],
   ['Baseline',input.baseline,input.unit??'unknown',measurement.baselineUnknownReason??measurement.reason],
   ['Comparison',input.comparison,input.unit??'unknown',measurement.comparisonUnknownReason??measurement.reason],
   ['Change',measurement.result.change,input.unit??'unknown',measurement.result.reason],
   ['Change Percentage',measurement.result.percentage,'%',measurement.result.reason],
  ] as const)metrics.push({label:`${name} · ${title}${window}`,value,unit,reason:value===null?reason??'Measurement is unavailable':null,citations:[label]});
 }
 for(const input of snapshot.profiles??[]){const label=labels.get(`accepted_profile:${input.revisionId}`);if(!label)continue;const projected=reportProfileBlocks(input,label);if(projected && projected.section!=='maturity')sections[({value:6,risk:4,decision:4,next:2} as const)[projected.section]].blocks.push(...projected.blocks);}
 for(const milestone of snapshot.milestones??[]){const label=labels.get(`milestone_decision:${milestone.revisionId}`);if(label)fact(3,`Milestone ${milestone.key}: ${milestone.state==='accepted'?'accepted through explicit milestone review':'waived through explicit milestone review; waiver does not establish completion'}`,[label]);}
 for(const calculation of snapshot.calculations){
  const refs=calculation.sources.map(source=>labels.get(`${source.kind}:${source.revisionId}`)!).filter(Boolean),values=calculation.results;
  for(const [key,label] of [['periodActualMinutes','Period Actual'],['cumulativeActualMinutes','Cumulative Actual Since Engagement Start'],['budgetMinutes','Reviewed Effort Budget'],['remainingMinutes','Remaining Estimate'],['forecastMinutes','Closing Forecast'],['varianceMinutes','Forecast Variance']] as const){
   const value=values[key],citations=key.includes('Actual')?refs:snapshot.records.filter(record=>record.engagementId===calculation.engagementId && ['estimate','effort_budget'].includes(record.kind)).map(record=>labels.get(`execution_record:${record.revisionId}`)!).filter(Boolean);
   metrics.push({label:`Engagement ${snapshot.engagements.findIndex(engagement=>engagement.id===calculation.engagementId)+1} · ${label}`,value:value===null?null:formatReportHours(value),unit:'hours',reason:value===null?'No current comparable reviewed quantity':null,citations:[...new Set([...refs,...citations])]});
  }
 }
 gap(0,snapshot.records.length?'This report summarizes currently accepted delivery records; the following sections identify their evidence and unresolved decisions.':'No validated update available for this period.');
 gap(3,'Baseline identity and capture cutoff are fixed for this revision. Changes require a new review.');
 gap(5,'Approved aggregate effort is shown below. Individual utilization, personnel and finance are excluded. Capacity constraints require an explicit delivery-visible record.');
 gap(7,`Period ${snapshot.period.fromDate} to ${snapshot.period.toDate}; ${snapshot.period.timezone}. Captured ${snapshot.asOf}. ${snapshot.period.partial?'Partial current period. ':''}${snapshot.coverage.reviewRequiredRecords?'Some authorized records require renewed source review. ':''}Template weekly-status-v1; report-metrics-v1. Review is recorded for this exact revision.`);
 for(const section of sections)if(!section.blocks.length)section.blocks.push({type:'gap',text:'No currently accepted input is available for this section.',citations:[]});
 return validateReportDocument({schemaVersion:'reports-v1',projectionVersion:'report-projection-v1',formulaVersion:'report-metrics-v1',templateVersion:'weekly-status-v1',kind:'weekly',title:'Weekly Delivery Update',
 audience:snapshot.selection.audience,classification:snapshot.synthetic?'Synthetic Delivery Report':'Delivery Report',timezone:snapshot.selection.timezone,period:{fromDate:snapshot.period.fromDate,toDate:snapshot.period.toDate},asOf:snapshot.asOf,partial:snapshot.period.partial,
 ownerLabel:'Accountable owner not specified in accepted delivery inputs',sponsorLabel:'Executive sponsor not specified in accepted delivery inputs',sections,metrics,citations:snapshot.dependencies.map((source,index)=>({label:`S${index+1}`,description:source.kind==='approved_time'?'Approved aggregate time contribution':source.kind==='workload_identity'?'Accepted workload scope identity (metadata only)':source.kind==='milestone_baseline'?'Reviewed delivery baseline':'Reviewed eligible delivery evidence'})),
 gaps:sections.flatMap(section=>section.blocks.filter(block=>block.type==='gap').map(block=>block.text)),annotations,correctionOf});
}
