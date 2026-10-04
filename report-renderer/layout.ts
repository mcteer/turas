import type {ReportDocument} from '../lib/reports/document';
import {HttpFailure} from '../lib/contracts/http';
import {executiveContent} from '../report-templates/executive';
export type ExecutiveSlide=
 |{type:'cover'}
 |{type:'text';heading:string;paragraphs:string[]}
 |{type:'table';heading:string;rows:string[][]}
 |{type:'chart';heading:string;labels:string[];values:number[]};
function fitsText(paragraphs:string[]):boolean{return paragraphs.join('\n\n').length<=540 && paragraphs.reduce((lines,text)=>lines+Math.ceil([...text].length/85)+1,0)<=12;}
export function planExecutiveSlides(document:ReportDocument):ExecutiveSlide[]{
 const slides:ExecutiveSlide[]=[{type:'cover'}];
 for(const section of executiveContent(document).filter(section=>section.heading!=='Reviewed Measures')){
  const chunks:string[]=[];
  for(const paragraph of section.paragraphs.length?section.paragraphs:['No reviewed input is available.']){
   let rest=paragraph;while([...rest].length>540){const candidate=[...rest].slice(0,540).join(''),space=candidate.lastIndexOf(' '),cut=space>270?space: candidate.length;chunks.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}if(rest)chunks.push(rest);
  }
  let current:string[]=[];const groups:string[][]=[];
  for(const chunk of chunks){if(!fitsText([...current,chunk])){groups.push(current);current=[];}current.push(chunk);}if(current.length)groups.push(current);
  groups.forEach((paragraphs,index)=>slides.push({type:'text',heading:section.heading+(index?' (Continued)':''),paragraphs}));
 }
 const rows=document.metrics.map(metric=>[metric.label,metric.value===null?'Unknown':`${metric.value} ${metric.unit}`]);
 if(rows.some(row=>[...row[0]].length>100 || [...row[1]].length>50))throw new HttpFailure(422,'layout_failed','Reviewed measure text exceeds the native table layout');
 for(let index=0;index<Math.max(1,rows.length);index+=4)slides.push({type:'table',heading:index?'Reviewed Measures (Continued)':'Reviewed Measures',rows:[['Measure','Reviewed Value'],...rows.slice(index,index+4)]});
 // The chart is explicitly selected; complete values and evidence remain in the native tables and content.
 const chart=document.metrics.filter(metric=>metric.unit==='hours' && metric.value!==null && /^-?\d{1,9}\.\d{2}$/.test(metric.value)).slice(0,6);
 if(chart.length>=2)slides.push({type:'chart',heading:'Selected Reviewed Effort',labels:chart.map(metric=>metric.label),values:chart.map(metric=>Number(metric.value))});
 // Include every metric's full reason and citation list independently of the compact table.
 const measures=executiveContent(document).find(section=>section.heading==='Reviewed Measures')!;
 const details=measures.paragraphs.filter((_,index)=>document.metrics[index].reason || document.metrics[index].citations.length);
 let detailGroup:string[]=[];
 for(const detail of details){if(detail.length>540)throw new HttpFailure(422,'layout_failed','Measure citation text exceeds the native layout');if(!fitsText([...detailGroup,detail])){slides.push({type:'text',heading:'Measure Evidence',paragraphs:detailGroup});detailGroup=[];}detailGroup.push(detail);}if(detailGroup.length)slides.push({type:'text',heading:'Measure Evidence',paragraphs:detailGroup});
 if(slides.length>40)throw new HttpFailure(422,'layout_failed','Narrow the executive report to at most 40 slides');return slides;
}
