import {outcomeSchema} from '../execution/handoff-schema';
import {calculateComparableChange} from '../../reports/calculations';
export function reportMeasurementInputs(records:Array<{revisionId:string;kind:string;content:Record<string,unknown>}>,cutoffDate:string){
 return records.filter(record=>record.kind==='outcome' && typeof record.content.status==='string').map(record=>{
  const content=outcomeSchema.parse(record.content);
  const observed=content.status==='observed' && content.measurementEnd!==null && content.measurementEnd<=cutoffDate;
  const comparable=observed && content.limitationReason===null;
  const input={revisionId:record.revisionId,status:content.status,measure:content.measure,unit:content.unit,measurementStart:content.measurementStart,measurementEnd:content.measurementEnd,baseline:observed?content.baselineValue:null,current:observed?content.currentValue:null,comparison:observed?content.comparisonValue:null,comparable};
  const result=calculateComparableChange({baseline:input.baseline,current:input.current,comparable});
  return {input,result,reason:observed?content.limitationReason:content.status==='observed'?'Measurement window extends beyond the capture cutoff':content.limitationReason,baselineUnknownReason:content.baselineUnknownReason,comparisonUnknownReason:content.comparisonUnknownReason};
 });
}
