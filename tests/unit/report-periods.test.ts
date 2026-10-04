import {describe,it,expect} from 'vitest';
import {validateReportPeriod} from '../../lib/reports/periods';
describe('canonical report periods',()=>{
  const now='2026-10-03T12:00:00Z';
  it('accepts both 92-day quarter shapes and year boundaries',()=>{
    expect(validateReportPeriod('quarterly','2026-07-01','2026-09-30','America/Denver',false,now).days).toBe(92);
    expect(validateReportPeriod('quarterly','2025-10-01','2025-12-31','UTC',false,now).days).toBe(92);
  });
  it('counts calendar dates across DST and leap days',()=>{
    expect(validateReportPeriod('weekly','2026-03-02','2026-03-08','America/Denver',false,now).days).toBe(7);
    expect(validateReportPeriod('monthly','2024-02-01','2024-02-29','UTC',false,now).days).toBe(29);
  });
  it('requires explicit partial current periods and rejects future periods',()=>{
    expect(()=>validateReportPeriod('monthly','2026-10-01','2026-10-31','UTC',false,now)).toThrow();
    expect(validateReportPeriod('monthly','2026-10-01','2026-10-31','UTC',true,now).partial).toBe(true);
    expect(()=>validateReportPeriod('monthly','2026-11-01','2026-11-30','UTC',true,now)).toThrow();
  });
  it.each([
    ['weekly','2026-09-22','2026-09-28','UTC'],
    ['monthly','2026-02-01','2026-02-29','UTC'],
    ['quarterly','2026-07-01','2026-09-29','UTC'],
    ['monthly','2026-09-01','2026-09-30','No/Timezone'],
  ])('rejects malformed canonical period %s %s', (kind,from,to,zone)=>expect(()=>validateReportPeriod(kind as any,from,to,zone,false,now)).toThrow());
});
