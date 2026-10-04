import {describe,it,expect} from 'vitest';
import {reportCommandSchema} from '../../lib/server/reports/schema';
import {reportJson} from '../../lib/server/reports/http';
import {randomUUID} from 'node:crypto';
describe('report transport boundary',()=>{
 it('rejects forged approval and unexpected fields',()=>{
  expect(()=>reportCommandSchema.parse({requestKey:randomUUID(),expectedVersion:1,rationale:'Reviewed',approved:true})).toThrow();
 });
 it('returns private no-store bounded JSON',()=>{
  expect(reportJson({status:'ready'}).headers.get('cache-control')).toBe('private, no-store');
  expect(()=>reportJson({text:'x'.repeat(1024*1024)})).toThrow();
 });
});
