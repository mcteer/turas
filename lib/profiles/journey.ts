import {contextSchema,impactDelta} from '../contracts/customer-journey';
export function journeyRecords(entries:readonly {type?:unknown;citationId?:unknown;recordId?:unknown;payload?:unknown}[],accountId?:string){
 return entries.flatMap(entry=>{
  if(entry.type!=='accepted_manual' || !entry.payload || typeof entry.payload!=='object')return [];
  const parsed=contextSchema.safeParse((entry.payload as Record<string,unknown>).legacyJourney);
  if(!parsed.success)return [];
  const delta=parsed.data.impact?impactDelta(parsed.data.impact):null;
  return [{id:entry.citationId,rootId:entry.recordId??entry.citationId,state:'approved' as const,context:parsed.data,
   stale:parsed.data.reviewAfter<new Date().toISOString().slice(0,10),delta,impactDelta:delta,
   ...(accountId?{citation:`/customers/${accountId}`}:{})}];
 });
}
