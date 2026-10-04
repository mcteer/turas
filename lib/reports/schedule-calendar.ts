import {Temporal} from '@js-temporal/polyfill';
import {HttpFailure} from '../contracts/http';
import {previousCompletedWeek,validTimezone} from './periods';

export function reportScheduledInstant(date:string,time:string,timezone:string){
 try{
  if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time) || !validTimezone(timezone))throw new Error();
  const local=Temporal.PlainDateTime.from(`${date}T${time}`,{overflow:'reject'}),earlier=local.toZonedDateTime(timezone,{disambiguation:'earlier'});
  if(earlier.toPlainDateTime().equals(local))return earlier.toInstant().toString();
  // A gap is resolved at the transition itself, rather than shifting the requested minutes.
  const transition=earlier.getTimeZoneTransition('next');if(!transition)throw new Error();
  return transition.toInstant().toString();
 }catch{throw new HttpFailure(422,'invalid_input','Invalid weekly schedule time');}
}
export function nextReportScheduleRun(after:string,time:string,timezone:string){
 const now=Temporal.Instant.from(after),today=now.toZonedDateTimeISO(timezone).toPlainDate();
 let monday=today.subtract({days:today.dayOfWeek-1}),candidate=Temporal.Instant.from(reportScheduledInstant(monday.toString(),time,timezone));
 if(Temporal.Instant.compare(candidate,now)<=0){monday=monday.add({days:7});candidate=Temporal.Instant.from(reportScheduledInstant(monday.toString(),time,timezone));}
 return candidate.toString();
}
export function latestReportSchedulePeriod(recordedDue:string,now:string,time:string,timezone:string){
 const due=Temporal.Instant.from(recordedDue),instant=Temporal.Instant.from(now);if(Temporal.Instant.compare(due,instant)>0)return null;
 const today=instant.toZonedDateTimeISO(timezone).toPlainDate();let monday=today.subtract({days:today.dayOfWeek-1});
 if(Temporal.Instant.compare(Temporal.Instant.from(reportScheduledInstant(monday.toString(),time,timezone)),instant)>0)monday=monday.subtract({days:7});
 const run=reportScheduledInstant(monday.toString(),time,timezone),period=previousCompletedWeek(timezone,run);
 const missedWeeks=Math.max(0,Math.floor(due.toZonedDateTimeISO(timezone).toPlainDate().until(monday).days/7));
 return {...period,nextRunAt:nextReportScheduleRun(now,time,timezone),missedWeeks};
}
