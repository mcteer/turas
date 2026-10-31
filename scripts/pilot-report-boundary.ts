import {validateReportDocument,type ReportDocument} from '../lib/reports/document';
import {planExecutiveSlides} from '../report-renderer/layout';
/** Legal reviewer annotations exercise the normal renderer's content/layout
 * boundary. No bytes, ZIP entries or PDF objects are added to generated output. */
export function maximumPilotReportAnnotations(raw:unknown){
 const original=validateReportDocument(raw);if(original.kind==='weekly')throw Error('Executive boundary required');
 const note='Controlled synthetic layout observation. This is a renderer boundary exercise, not an accepted customer fact or an outcome. ';
 function annotations(length:number){const result:string[]=[];for(let offset=0;offset<length;offset+=2000){const size=Math.min(2000,length-offset);result.push(note.repeat(Math.ceil(size/note.length)).slice(0,size).trim());}return result;}
 function candidate(length:number):ReportDocument{return validateReportDocument({...original,annotations:annotations(length)});}
 const fits=(length:number)=>{try{return planExecutiveSlides(candidate(length)).length<=40;}catch{return false;}};
 if(!fits(0))throw Error('Original normal report already exceeds its layout');let low=0,high=40000;
 while(low<high){const middle=Math.ceil((low+high)/2);if(fits(middle))low=middle;else high=middle-1;}
 const document=candidate(low),slides=planExecutiveSlides(document).length;if(slides!==40)throw Error('Normal forty-slide boundary not reachable for this original report');
 return {annotations:document.annotations,slides,annotationCharacters:document.annotations.reduce((sum,text)=>sum+text.length,0),structuredInputBytes:Buffer.byteLength(JSON.stringify(document)),maximumGeneratedByteBoundaryVerified:false as const};
}
