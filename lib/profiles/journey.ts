import {contextSchema,impactDelta} from '../contracts/customer-journey';
export function journeyRecords(entries:readonly {type?:unknown;citationId?:unknown;payload?:unknown}[]){
 return entries.flatMap(entry=>{
  if(entry.type!=='accepted_manual' || !entry.payload || typeof entry.payload!=='object')return [];
  const parsed=contextSchema.safeParse((entry.payload as Record<string,unknown>).legacyJourney);
  return parsed.success?[{id:entry.citationId,state:'approved' as const,context:parsed.data,
   impactDelta:parsed.data.impact?impactDelta(parsed.data.impact):null}]:[];
 });
}
