import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {reportCommandSchema,reportSelectionSchema,reportDigestSchema} from '../../lib/server/reports/schema';
import {reportDigest} from '../../lib/server/reports/commands';
describe('strict report commands and identities',()=>{
 it('canonicalizes object keys but preserves array order',()=>{
  expect(reportDigest({b:1,a:[2,3]})).toBe(reportDigest({a:[2,3],b:1}));
  expect(reportDigest([2,3])).not.toBe(reportDigest([3,2]));
 });
 it('requires positive exact versions, UUIDs and bounded rationale',()=>{
  const valid={requestKey:randomUUID(),expectedVersion:1,rationale:'Reviewed exact report'};
  expect(reportCommandSchema.parse(valid)).toEqual(valid);
  for(const change of [{expectedVersion:0},{expectedVersion:1.5},{requestKey:'wrong'},{rationale:''},{rationale:'x'.repeat(2001)},{extra:true}])expect(()=>reportCommandSchema.parse({...valid,...change})).toThrow();
 });
 it('rejects duplicate scope IDs and non-hex digests',()=>{
  const id=randomUUID();
  expect(()=>reportSelectionSchema.parse({kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[id,id],workloadIds:[],includeCustomerLevel:true})).toThrow();
  expect(()=>reportDigestSchema.parse('A'.repeat(64))).toThrow();
 });
});
