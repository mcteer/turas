import {describe,it,expect} from 'vitest';
import {normalizeReportAddress} from '../../lib/server/reports/recipients';
describe('report address identity',()=>{
 it('normalizes only domain case without folding local parts or plus aliases',()=>{
  expect(normalizeReportAddress('Ops+QBR@EXAMPLE.COM')).toBe('Ops+QBR@example.com');
  expect(normalizeReportAddress('Ops@example.com')).not.toBe(normalizeReportAddress('ops@example.com'));
 });
 it.each(['Name <a@example.com>','a@example.com\r\nBcc:b@example.com',' a@example.com','a@example.com ','a,b@example.com','a@example.com;b@example.com','a@localhost','a@https://example.com'])('rejects invalid address %s',value=>expect(()=>normalizeReportAddress(value)).toThrow());
});
