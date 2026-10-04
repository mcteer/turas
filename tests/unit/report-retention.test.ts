import {it,expect} from 'vitest';
import {REPORT_RETENTION_POLICY,reportAuditExpired} from '../../lib/reports/retention';
it('expires non-technical audit at the exact 730-day boundary, independently of payload policy',()=>{
 const now=Date.parse('2026-10-04T12:00:00Z'),boundary=now-730*86400000;
 expect(REPORT_RETENTION_POLICY).toBe('report-retention-v2');
 expect(reportAuditExpired(new Date(boundary+1),now)).toBe(false);
 expect(reportAuditExpired(new Date(boundary),now)).toBe(true);
 expect(reportAuditExpired(new Date(boundary-1),now)).toBe(true);
 expect(()=>reportAuditExpired(new Date(NaN),now)).toThrow();
});
