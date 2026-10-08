import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {expansionBody,expansionQuery,expansionRouteId} from '../../lib/server/expansion/http';
import {expansionCommandSchema,expansionOwnerCommandSchema} from '../../lib/server/expansion/schema';
import {discoveryHypothesis} from '../fixtures/expansion';
describe('Expansion HTTP limits',()=>{
 it('rejects malformed identity and extra authority fields',()=>{
  expect(()=>expansionRouteId('invalid')).toThrow();
  const input={contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  expect(expansionCommandSchema.safeParse(input).success).toBe(true);
  expect(expansionCommandSchema.safeParse({...input,role:'admin'}).success).toBe(false);
  expect(expansionOwnerCommandSchema.safeParse({contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:null,rationale:'Unassign',override:true}).success).toBe(false);
 });
 it('bounds streaming request bytes and validates JSON encoding',async()=>{
  await expect(expansionBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(65537)}))).rejects.toMatchObject({status:413});
  await expect(expansionBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).rejects.toMatchObject({status:400});
 });
 it('refuses duplicate query parameters and non-JSON mutation bodies',async()=>{
  expect(()=>expansionQuery(new Request('http://localhost/?limit=1&limit=2'))).toThrow();
  await expect(expansionBody(new Request('http://localhost',{method:'POST',body:'{}'}))).rejects.toMatchObject({status:415});
 });
});
