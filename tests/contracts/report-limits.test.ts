import {describe,it,expect} from 'vitest';
import {readReportBody,reportFailure} from '../../lib/server/reports/http';
import {HttpFailure} from '../../lib/contracts/http';
describe('bounded report transport',()=>{
 it('enforces the actual streamed command size without trusting Content-Length',async()=>{
  const request=new Request('http://localhost/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'x'.repeat(131072)})});
  await expect(readReportBody(request)).rejects.toMatchObject({code:'body_too_large'});
 });
 it('rejects invalid media types and malformed JSON',async()=>{
  await expect(readReportBody(new Request('http://localhost',{method:'POST',body:'text'}))).rejects.toMatchObject({status:415});
  await expect(readReportBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).rejects.toMatchObject({status:400});
 });
 it('does not disclose unexpected error text or cache authenticated failures',async()=>{
  const response=reportFailure(new Error('PRIVATE_SENTINEL'));
  expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
  expect(reportFailure(new HttpFailure(429,'rate_limited','Report rate limit reached',60)).headers.get('retry-after')).toBe('60');
 });
});

describe('strict query transport',()=>{
 it('rejects duplicate and unknown query fields',async()=>{
  const {reportQuery}=await import('../../lib/server/reports/http');
  expect(()=>reportQuery(new Request('http://localhost?limit=1&limit=2'),['limit'])).toThrow();
  expect(()=>reportQuery(new Request('http://localhost?approved=true'),['limit'])).toThrow();
 });
});
