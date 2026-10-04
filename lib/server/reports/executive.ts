import {EXECUTIVE_SECTIONS,validateReportDocument,type ReportDocument} from '../../reports/document';
import type {captureReportSnapshot} from './snapshots';
import {composeWeeklyReport} from './weekly';
import {reportProfileBlocks} from './profile-content';
type Snapshot=Awaited<ReturnType<typeof captureReportSnapshot>>;
/** Composition consumes only the already authorized, current eligible snapshot. No model inference. */
export function composeExecutiveReport(snapshot:Snapshot,annotations:string[]=[],correctionOf:string|null=null):ReportDocument{
 const weekly=composeWeeklyReport(snapshot,annotations,correctionOf),sections:ReportDocument['sections']=EXECUTIVE_SECTIONS.map(heading=>({heading,blocks:[]}));
 const labels=new Map(snapshot.dependencies.map((source,index)=>[`${source.kind}:${source.revisionId}`,`S${index+1}`]));
 for(const record of snapshot.records){
  const source=labels.get(`execution_record:${record.revisionId}`);if(!source)continue;
  const title=typeof record.content.title==='string'?record.content.title:'Reviewed delivery update',narrative=typeof record.content.narrative==='string'?record.content.narrative:'';
  const text=`${title} (${record.eventDate}): ${narrative}`;
  const index=record.kind==='outcome'?2:['raid','decision'].includes(record.kind)?4:record.content.subtype==='milestone_plan'?5:3;
  sections[index].blocks.push({type:index===5?'proposal':'fact',text,citations:[source]});
 }
 for(const input of snapshot.profiles??[]){const label=labels.get(`accepted_profile:${input.revisionId}`);if(!label)continue;const projected=reportProfileBlocks(input,label);if(projected)sections[({maturity:1,value:2,risk:4,decision:0,next:5} as const)[projected.section]].blocks.push(...projected.blocks);}
 for(const milestone of snapshot.milestones??[]){const label=labels.get(`milestone_decision:${milestone.revisionId}`);if(label)sections[3].blocks.push({type:'fact',text:`Milestone ${milestone.key}: ${milestone.state==='accepted'?'accepted through explicit milestone review':'waived; waiver does not establish completion'}`,citations:[label]});}
 const gap=(index:number,text:string)=>sections[index].blocks.push({type:'gap',text,citations:[]});
 gap(0,'Executive decisions and recommendations require explicit reviewed inputs. Delivery evidence, risks and quantities are shown in their respective sections.');
 if(!sections[1].blocks.length)gap(1,'No audience-eligible accepted maturity assessment is present in this captured snapshot. Engagement stage does not establish customer maturity.');
 gap(2,'Only explicitly accepted delivery outcomes are included. Unmeasured adoption, ROI and business value remain unknown.');
 gap(3,'The selected delivery portfolio and reviewed baselines are fixed at the capture instant. Planned work does not establish completion.');
 gap(6,`Period ${snapshot.period.fromDate} to ${snapshot.period.toDate}; ${snapshot.selection.timezone}. Captured ${snapshot.asOf}. ${snapshot.period.partial?'Partial current period. ':''}Template executive-review-v1; formula report-metrics-v1. ${snapshot.coverage.reviewRequiredRecords?'Some authorized records require renewed source review. ':''}Personnel, individual utilization and finance are excluded.`);
 for(const section of sections)if(!section.blocks.length)section.blocks.push({type:'gap',text:'No currently accepted input is available for this section.',citations:[]});
 return validateReportDocument({...weekly,templateVersion:'executive-review-v1',kind:snapshot.selection.kind,title:snapshot.selection.kind==='quarterly'?'Quarterly Executive Review':'Monthly Executive Review',sections,gaps:sections.flatMap(section=>section.blocks.filter(block=>block.type==='gap').map(block=>block.text))});
}
