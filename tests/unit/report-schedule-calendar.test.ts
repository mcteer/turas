import {describe,it,expect} from 'vitest';
import {reportScheduledInstant,nextReportScheduleRun,latestReportSchedulePeriod} from '../../lib/reports/schedule-calendar';
describe('weekly report schedule calendar',()=>{
 it('uses the first valid instant after a local gap',()=>expect(reportScheduledInstant('2026-03-08','02:30','America/Denver')).toBe('2026-03-08T09:00:00Z'));
 it('chooses only the earlier occurrence of a repeated local time',()=>expect(reportScheduledInstant('2026-11-01','01:30','America/Denver')).toBe('2026-11-01T07:30:00Z'));
 it('keeps local Monday 09:00 stable across DST',()=>{
  expect(nextReportScheduleRun('2026-03-02T16:00:00Z','09:00','America/Denver')).toBe('2026-03-09T15:00:00Z');
  expect(nextReportScheduleRun('2026-03-09T14:59:59Z','09:00','America/Denver')).toBe('2026-03-09T15:00:00Z');
 });
 it('selects only the latest complete week after downtime',()=>{
  expect(latestReportSchedulePeriod('2026-09-07T15:00:00Z','2026-10-06T18:00:00Z','09:00','America/Denver')).toEqual({fromDate:'2026-09-28',toDate:'2026-10-04',nextRunAt:'2026-10-12T15:00:00Z',missedWeeks:4});
 });
 it('does not run before the recorded due instant',()=>expect(latestReportSchedulePeriod('2026-10-05T15:00:00Z','2026-10-05T14:59:59Z','09:00','America/Denver')).toBeNull());
 it('uses the previous scheduled Monday if Monday execution is still ahead',()=>expect(latestReportSchedulePeriod('2026-09-28T15:00:00Z','2026-10-05T14:59:59Z','09:00','America/Denver')).toEqual({fromDate:'2026-09-21',toDate:'2026-09-27',nextRunAt:'2026-10-05T15:00:00Z',missedWeeks:0}));
 it.each(['24:00','9:00','09:60','09:00:00'])('rejects unsupported local time %s',time=>expect(()=>nextReportScheduleRun('2026-10-03T00:00:00Z',time,'UTC')).toThrow());
});
