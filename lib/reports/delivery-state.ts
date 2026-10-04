export type ReportDeliveryEvidence='accepted'|'delivered'|'bounced'|'complained'|'failed';
export function reportDeliveryMayPost(row:{state:string;attemptCount:number;firstDispatchAt:string|null},now:string){
 if(!['authorized','queued','retryable_failure','uncertain'].includes(row.state) || !Number.isInteger(row.attemptCount) || row.attemptCount<0 || row.attemptCount>=3)return false;
 const current=Date.parse(now);if(!Number.isFinite(current))return false;
 if(row.firstDispatchAt===null)return row.attemptCount===0 && ['authorized','queued'].includes(row.state);
 const first=Date.parse(row.firstDispatchAt);return row.attemptCount>0 && Number.isFinite(first) && current>=first && current-first<23*3600000;
}
export function reportDeliveryRetry(kind:'retryable_failure'|'uncertain',attemptNumber:number,retryAfterSeconds:number){
 if(!Number.isInteger(attemptNumber) || attemptNumber<1 || attemptNumber>3)throw new Error('Invalid delivery attempt');
 if(attemptNumber===3)return {state:kind==='uncertain'?'uncertain':'permanent_failure',delaySeconds:null};
 const suggested=Number.isFinite(retryAfterSeconds)?Math.min(3600,Math.max(0,retryAfterSeconds)):0;
 return {state:kind,delaySeconds:Math.max(attemptNumber===1?60:300,suggested)};
}
/** Facts remain append-only; the summary never turns acceptance into proof of delivery. */
export function projectReportDeliveryEvidence(facts:readonly ReportDeliveryEvidence[]){
 const set=new Set(facts);
 if(set.has('complained'))return 'complained';if(set.has('bounced'))return 'bounced';if(set.has('delivered'))return 'delivered';
 if(set.has('failed'))return 'permanent_failure';if(set.has('accepted'))return 'provider_accepted';return null;
}
