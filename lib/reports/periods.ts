import {Temporal} from '@js-temporal/polyfill';
import {HttpFailure} from '../contracts/http';
export type ReportKind='weekly'|'monthly'|'quarterly';
export type ReportAudience='delivery'|'account_team'|'leadership';
export function validTimezone(zone:string):boolean{try{Temporal.Now.zonedDateTimeISO(zone);return !/^[+-]/.test(zone);}catch{return false;}}
export function validateReportPeriod(kind:ReportKind,from:string,to:string,zone:string,partial:boolean,asOf=new Date().toISOString()){
 try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !validTimezone(zone))throw new Error();
  const start=Temporal.PlainDate.from(from,{overflow:'reject'}),end=Temporal.PlainDate.from(to,{overflow:'reject'});
  const days=start.until(end).days+1,today=Temporal.Instant.from(asOf).toZonedDateTimeISO(zone).toPlainDate();
  if(days<7 || days>92 || Temporal.PlainDate.compare(start,today)>0)throw new Error();
  if(kind==='weekly' && (start.dayOfWeek!==1 || end.dayOfWeek!==7 || days!==7))throw new Error();
  if(kind==='monthly' && (start.day!==1 || end.toString()!==start.add({months:1}).subtract({days:1}).toString()))throw new Error();
  if(kind==='quarterly' && (start.day!==1 || ![1,4,7,10].includes(start.month) || end.toString()!==start.add({months:3}).subtract({days:1}).toString()))throw new Error();
  if(!['weekly','monthly','quarterly'].includes(kind))throw new Error();
  const incomplete=Temporal.PlainDate.compare(end,today)>=0;
  if(incomplete && !partial)throw new Error();
  return {fromDate:from,toDate:to,timezone:zone,days,partial:incomplete,asOf};
 }catch{throw new HttpFailure(422,'invalid_period','Select a canonical completed period or mark the current period partial');}
}

export function previousCompletedWeek(zone:string,asOf=new Date().toISOString()){
 if(!validTimezone(zone))throw new HttpFailure(422,'invalid_period','Invalid timezone');
 const today=Temporal.Instant.from(asOf).toZonedDateTimeISO(zone).toPlainDate();
 const monday=today.subtract({days:today.dayOfWeek-1}),start=monday.subtract({days:7});
 return {fromDate:start.toString(),toDate:monday.subtract({days:1}).toString()};
}
